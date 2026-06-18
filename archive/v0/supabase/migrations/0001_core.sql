-- billcheck schema v1 (plan U2). Invariants enforced here, not in app code:
--   * case_events is append-only (block-mutation trigger, even for service role;
--     single documented bypass: the purge job sets billcheck.purge = 'on')
--   * case state transitions validated against the V0 subset (reserved V1
--     states rejected by trigger, not by comment)
--   * documents are versioned: unique (version_group, version_number),
--     exactly one version-1 original per group (frozen savings baseline)
--   * findings are append-only per engine run: findings.run_id NOT NULL,
--     unique (run_id, check_id, evidence_key)
--   * all money is integer cents
--   * RLS owner-only on every user table

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  external_ref text,
  -- PHASE gate (plan, review S3): in PHASE=A, document-bearing LLM calls are
  -- allowed only for accounts flagged test/synthetic. Fail closed otherwise.
  is_test_account boolean not null default false,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------- cases
create table public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  state text not null default 'CAPTURED',
  coverage_profile jsonb not null default '{}',
  primary_verdict text,
  stacked_tracks text[] not null default '{}',
  current_run_id uuid, -- FK added after engine_runs exists
  consent_status text not null default 'none',
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- V0-writable states + legal transitions (plan: Key Technical Decisions).
-- GATHERING / EXECUTING / AWAITING_RESPONSE / ESCALATED are reserved for V1.
create or replace function public.validate_case_transition()
returns trigger language plpgsql as $$
declare
  allowed text[];
begin
  if tg_op = 'INSERT' then
    if new.state <> 'CAPTURED' then
      raise exception 'cases must be created in CAPTURED, got %', new.state;
    end if;
    return new;
  end if;

  if new.state = old.state then
    return new; -- no-op state writes are fine
  end if;

  allowed := case old.state
    when 'CAPTURED' then array['TRIAGED','CLOSED_BY_USER']
    when 'TRIAGED' then array['AUDITED','WAITING_ADJUDICATION','WAITING_ITEMIZED','CLOSED_BY_USER']
    when 'WAITING_ADJUDICATION' then array['TRIAGED','AUDITED','CLOSED_BY_USER']
    when 'WAITING_ITEMIZED' then array['TRIAGED','AUDITED','CLOSED_BY_USER']
    when 'AUDITED' then array['VERDICT','CLOSED_BY_USER']
    when 'VERDICT' then array['SENT_BY_USER','RESOLVED_SELF_REPORTED','RESOLVED_VERIFIED','AUDITED','CLOSED_BY_USER']
    when 'SENT_BY_USER' then array['RESOLVED_SELF_REPORTED','RESOLVED_VERIFIED','AUDITED','CLOSED_BY_USER']
    when 'RESOLVED_SELF_REPORTED' then array['RESOLVED_VERIFIED','CLOSED_BY_USER']
    when 'RESOLVED_VERIFIED' then array['CLOSED_BY_USER']
    when 'CLOSED_BY_USER' then array[]::text[]
    else null
  end;

  if allowed is null then
    raise exception 'unknown or reserved case state %', old.state;
  end if;
  if not (new.state = any (allowed)) then
    raise exception 'illegal case transition % -> %', old.state, new.state;
  end if;
  return new;
end $$;

create trigger cases_validate_transition
  before insert or update of state on public.cases
  for each row execute function public.validate_case_transition();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger cases_touch_updated_at
  before update on public.cases
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------- case_events
create table public.case_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.cases (id) on delete cascade,
  type text not null,
  -- Allowlist discipline (plan, security #4): IDs, states, event types only.
  -- Never extracted document text — that lives in RLS-protected typed tables.
  payload jsonb not null default '{}',
  by_role text not null default 'system',
  at timestamptz not null default now()
);

-- Append-only guard: blocks UPDATE/DELETE for every role including service.
-- Single documented bypass (plan, data #6): the purge job (U17) runs
--   select set_config('billcheck.purge', 'on', true);
-- inside its transaction before deleting anonymous-owned cases (cascade).
create or replace function public.case_events_block_mutation()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and current_setting('billcheck.purge', true) = 'on' then
    return old;
  end if;
  raise exception 'case_events is append-only (%, blocked)', tg_op;
end $$;

create trigger case_events_append_only
  before update or delete on public.case_events
  for each row execute function public.case_events_block_mutation();

-- Auto-append a case_events row on every state transition.
create or replace function public.append_state_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.state <> old.state then
    insert into public.case_events (case_id, type, payload)
    values (
      new.id,
      'state_transition',
      jsonb_build_object('from', case when tg_op = 'INSERT' then null else old.state end, 'to', new.state)
    );
  end if;
  return new;
end $$;

create trigger cases_append_state_event
  after insert or update of state on public.cases
  for each row execute function public.append_state_event();

-- --------------------------------------------------------------- documents
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  kind text not null check (kind in ('bill','eob','gfe','receipt','collection_notice','corrected_statement','other')),
  -- Opaque UUID object key (plan, security #2): never embeds filename/email.
  storage_path text not null unique,
  filename text,
  parse_status text not null default 'pending' check (parse_status in ('pending','parsing','parsed','failed')),
  version_group uuid not null default gen_random_uuid(),
  version_number int not null default 1 check (version_number >= 1),
  content_hash text,
  redaction_status text not null default 'unredacted',
  created_at timestamptz not null default now(),
  unique (version_group, version_number)
);

-- Exactly one version-1 original per group (frozen savings baseline, data #1).
create unique index documents_one_original_per_group
  on public.documents (version_group) where (version_number = 1);

-- -------------------------------------------------------------- line_items
create table public.line_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  code text,
  code_system text check (code_system in ('cpt_hcpcs','revenue','ndc','unknown')),
  description_raw text not null,
  description_plain text,
  units int,
  amount_cents bigint, -- integer cents, never floats
  date_of_service date,
  confidence real not null default 0,
  created_at timestamptz not null default now()
);

create table public.attestations (
  id uuid primary key default gen_random_uuid(),
  line_item_id uuid not null references public.line_items (id) on delete cascade,
  status text not null check (status in ('remember','not_sure','didnt_happen')),
  created_at timestamptz not null default now(),
  unique (line_item_id)
);

-- ------------------------------------------------------------- engine_runs
create table public.engine_runs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  engine_version text not null,
  check_versions jsonb not null default '{}',
  ref_version_map jsonb not null default '{}', -- per-table reference versions (data #4)
  status text not null default 'running' check (status in ('running','complete','dead')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.cases
  add constraint cases_current_run_fk
  foreign key (current_run_id) references public.engine_runs (id);

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.engine_runs (id) on delete cascade,
  case_id uuid not null references public.cases (id) on delete cascade,
  check_id text not null,
  check_version text not null,
  confidence_tier text not null check (confidence_tier in ('high','medium','review')),
  amount_impact_cents bigint,
  title text not null,
  evidence jsonb not null default '[]',
  evidence_key text not null, -- belt-and-suspenders duplicate guard (data #2)
  created_at timestamptz not null default now(),
  unique (run_id, check_id, evidence_key)
);

create table public.verdicts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  run_id uuid not null references public.engine_runs (id),
  primary_verdict text not null,
  stacked jsonb not null default '[]',
  coverage_map jsonb not null,
  router_version text not null,
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------- artifacts
create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  type text not null check (type in ('dispute','validation','itemized_request','fap_application','ppdr_guide','appeal')),
  content_ref text,
  finding_ids uuid[] not null default '{}', -- letters cite finding IDs; re-audits never orphan citations (data #2)
  approved_at timestamptz,
  approval_payload jsonb, -- includes the user's fact-attestation (review A4)
  delivered_via text check (delivered_via in ('download','portal_guided')),
  created_at timestamptz not null default now()
);

create table public.deadlines (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  type text not null, -- ppdr_file_by | response_expected_by | appeal_window | ...
  due_at timestamptz,  -- nullable: appeal_window is null-dated until user supplies denial date (review G2)
  source text not null default 'system',
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  kind text not null default 'pwyw',
  stripe_ref text unique, -- written exclusively from signature-verified webhooks, idempotent on event ID (security #6)
  amount_cents bigint not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- ai_calls
-- First-party LLM observability ledger (Pedro's request, 2026-06-12): every
-- model call's I/O lives HERE (RLS-protected), never in logs or third-party
-- tracing. Rows follow the same purge lifecycle as their cases.
create table public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.cases (id) on delete cascade,
  document_id uuid references public.documents (id) on delete set null,
  engine_run_id uuid references public.engine_runs (id) on delete set null,
  purpose text not null check (purpose in ('classify','parse','decode','letter','judgment')),
  model_id text not null,
  prompt_version text not null,
  input_refs jsonb not null default '{}', -- document version refs, never duplicated bytes
  raw_completion text,
  validated_output jsonb,
  tokens_in int,
  tokens_out int,
  latency_ms int,
  stop_reason text,
  error_code text,
  error_payload jsonb, -- full error belongs here, NOT in logs (security #4)
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.cases enable row level security;
alter table public.case_events enable row level security;
alter table public.documents enable row level security;
alter table public.line_items enable row level security;
alter table public.attestations enable row level security;
alter table public.engine_runs enable row level security;
alter table public.findings enable row level security;
alter table public.verdicts enable row level security;
alter table public.artifacts enable row level security;
alter table public.deadlines enable row level security;
alter table public.payments enable row level security;
alter table public.ai_calls enable row level security;

create policy profiles_own on public.profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy cases_own on public.cases
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Owner read for the audit trail; INSERT only via triggers/server. No client
-- UPDATE/DELETE policies exist, and the block trigger stops even service role.
create policy case_events_read on public.case_events
  for select using (
    exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid())
  );

create policy documents_own on public.documents
  for all using (
    exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid())
  );

create policy line_items_own on public.line_items
  for all using (
    exists (
      select 1 from public.documents d
      join public.cases c on c.id = d.case_id
      where d.id = document_id and c.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.documents d
      join public.cases c on c.id = d.case_id
      where d.id = document_id and c.user_id = auth.uid()
    )
  );

create policy attestations_own on public.attestations
  for all using (
    exists (
      select 1 from public.line_items li
      join public.documents d on d.id = li.document_id
      join public.cases c on c.id = d.case_id
      where li.id = line_item_id and c.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.line_items li
      join public.documents d on d.id = li.document_id
      join public.cases c on c.id = d.case_id
      where li.id = line_item_id and c.user_id = auth.uid()
    )
  );

-- Server-written tables: owner may read; writes happen server-side only.
create policy engine_runs_read on public.engine_runs
  for select using (exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid()));
create policy findings_read on public.findings
  for select using (exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid()));
create policy verdicts_read on public.verdicts
  for select using (exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid()));
create policy artifacts_read on public.artifacts
  for select using (exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid()));
create policy deadlines_read on public.deadlines
  for select using (exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid()));
create policy payments_read on public.payments
  for select using (exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid()));
create policy ai_calls_read on public.ai_calls
  for select using (
    case_id is not null
    and exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid())
  );

-- ----------------------------------------------------------------- storage
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;
-- No client storage policies: documents are written and served exclusively
-- through authenticated server routes (server-proxied reads, plan security #2).
