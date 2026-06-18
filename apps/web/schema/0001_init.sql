-- billcheck V0.1 — fresh schema (greenfield; NOT migrated from V0).
-- Authored for later application to a Supabase project (no live DB this session).
-- Principles: owner-only RLS everywhere; append-only activity log; money as bigint
-- cents; documents private (server-proxied); a metadata-only ai_calls ledger.
-- Model: Case → Bill(s) → Documents (+ derived amounts, + per-bill insurance snapshot).

-- profiles: PHASE flag lives here (per-account test bypass).
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  is_test_account boolean not null default false,
  created_at timestamptz not null default now()
);

-- cases: the episode. status is DERIVED in app code (a rollup), not authoritative here.
create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  title text,
  coverage_profile jsonb not null default '{}'::jsonb,  -- account-level insurance situation
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- bills: one biller's charge. Carries the living-thread lifecycle + the per-bill
-- insurance snapshot (coverage at date-of-service). One episode → many bills is normal.
create table if not exists bills (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  owner uuid not null references auth.users(id) on delete cascade,
  biller text,
  -- living thread, not a rigid corridor:
  lifecycle text not null default 'new'
    check (lifecycle in ('expected','new','gathering','reviewed','acting','resolved','closed','reopened')),
  situation_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- documents: typed evidence bound to one bill. Bytes live in private Storage; here we
-- keep the opaque key + the parsed extraction (kind, itemized flag, eob fields…).
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  owner uuid not null references auth.users(id) on delete cascade,
  kind text not null
    check (kind in ('statement','itemized','eob','receipt','collection_notice','denial_letter','gfe','unknown')),
  itemized boolean not null default false,
  storage_key text,             -- opaque key into the private 'documents' bucket
  extracted jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- line_items + findings: the deterministic fact substrate (the only legal source of numbers).
create table if not exists line_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  owner uuid not null references auth.users(id) on delete cascade,
  code text,
  description text,
  units integer,
  amount_cents bigint not null
);

create table if not exists findings (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills(id) on delete cascade,
  owner uuid not null references auth.users(id) on delete cascade,
  check_id text not null,
  title text not null,
  amount_impact_cents bigint,    -- null = leverage, not a dollar claim
  evidence jsonb not null default '[]'::jsonb,  -- fact ids
  created_at timestamptz not null default now()
);

-- case_events: append-only activity log + audit trail (the evidence chain).
create table if not exists case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  owner uuid not null references auth.users(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,   -- ids/types only, never document text
  created_at timestamptz not null default now()
);

-- ai_calls: the metadata-only model ledger (PHI-safe; mirrors the guarded client).
create table if not exists ai_calls (
  id uuid primary key default gen_random_uuid(),
  owner uuid references auth.users(id) on delete set null,
  purpose text,
  intent text,
  model text,
  cost_cents_est integer not null default 0,
  ok boolean not null,
  err text,
  created_at timestamptz not null default now()
);

-- append-only guard for case_events.
create or replace function block_mutation() returns trigger
  language plpgsql set search_path = ''   -- hardened (no mutable search_path)
as $$ begin raise exception 'append-only'; end $$;
drop trigger if exists case_events_no_update on case_events;
create trigger case_events_no_update before update or delete on case_events
  for each row execute function block_mutation();

-- RLS: owner-only on every user table.
do $$ declare t text;
begin
  foreach t in array array['profiles','cases','bills','documents','line_items','findings','case_events','ai_calls']
  loop
    execute format('alter table %I enable row level security;', t);
  end loop;
end $$;

-- owner = auth.uid() policies (profiles keyed on id).
-- NOTE: policies apply to the anon role too (gated by auth.uid()). This is INTENTIONAL —
-- we plan anonymous sessions (Supabase anonymous sign-ins give a uid). With no JWT, auth.uid()
-- is null so no rows match. To exclude anon entirely later, add `to authenticated`.
create policy profiles_owner on profiles using (id = auth.uid()) with check (id = auth.uid());
create policy cases_owner on cases using (owner = auth.uid()) with check (owner = auth.uid());
create policy bills_owner on bills using (owner = auth.uid()) with check (owner = auth.uid());
create policy documents_owner on documents using (owner = auth.uid()) with check (owner = auth.uid());
create policy line_items_owner on line_items using (owner = auth.uid()) with check (owner = auth.uid());
create policy findings_owner on findings using (owner = auth.uid()) with check (owner = auth.uid());
create policy case_events_owner on case_events using (owner = auth.uid()) with check (owner = auth.uid());
create policy ai_calls_owner on ai_calls using (owner = auth.uid()) with check (owner = auth.uid());

-- NOTE: create a PRIVATE Storage bucket 'documents' with NO client policies (server-proxied reads).
