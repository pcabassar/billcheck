-- billcheck v1 schema — persistent advocate. RLS-first; signup-only (policies scoped to `authenticated`).
-- This is the version-controlled source of truth for the schema + RLS boundary. It was applied to
-- the billcheck Supabase project via the Supabase migration API; this file reproduces it verbatim so
-- the security boundary is reproducible/reviewable and can be applied to a fresh project.
-- (A one-time reset dropping a prior experimental schema preceded this on the existing project; a
-- fresh database does not need it.)

create function public.touch_updated_at() returns trigger
  language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

-- ===== profiles (1:1 auth.users) — minimal+open coverage object =====
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  coverage_situation text,
  is_dual_qmb boolean not null default false,
  is_self_funded boolean,
  state text,
  situation_notes text,
  consent_account boolean not null default true,
  consent_aggregate boolean not null default false,
  consent_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ===== cases =====
create table public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  status text not null default 'new'
    check (status in ('new','gathering','recommendation_offered','acting','resolved','closed','reopened')),
  summary text,
  structured_state jsonb not null default '{}'::jsonb,
  aggregate_record_id uuid,                       -- personal-side pointer; NOT a FK (keyless store)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cases_user_id_idx on public.cases(user_id);

-- ===== documents =====
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  kind text not null default 'unknown'
    check (kind in ('statement','itemized','eob','receipt','collection_notice','denial_letter','gfe','bill','unknown')),
  filename text,
  content_type text,
  blob_url text,
  blob_pathname text,
  status text not null default 'pending' check (status in ('pending','ready','failed')),
  linked_to_doc_id uuid references public.documents(id) on delete set null,
  extracted jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index documents_case_id_idx on public.documents(case_id);
create index documents_user_id_idx on public.documents(user_id);
create index documents_linked_to_idx on public.documents(linked_to_doc_id);

-- ===== timeline_events (the activity log) =====
create table public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index timeline_events_case_id_idx on public.timeline_events(case_id);
create index timeline_events_user_id_idx on public.timeline_events(user_id);

-- ===== deadlines =====
create table public.deadlines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  kind text,
  title text,
  due_at timestamptz not null,
  status text not null default 'open' check (status in ('open','met','passed','cancelled')),
  reminder_status text not null default 'none'
    check (reminder_status in ('none','pending','armed','sent','failed','cancelled')),
  workflow_run_id text,
  reminder_branch text,
  dedup_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index deadlines_case_id_idx on public.deadlines(case_id);
create index deadlines_user_id_idx on public.deadlines(user_id);
create unique index deadlines_dedup_idx on public.deadlines(case_id, dedup_key) where dedup_key is not null;

-- ===== artifacts =====
create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  type text,
  title text,
  content_md text not null,
  status text not null default 'draft' check (status in ('draft','sent')),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index artifacts_case_id_idx on public.artifacts(case_id);
create index artifacts_user_id_idx on public.artifacts(user_id);

-- ===== transcripts (sessions; UIMessage[] persistence; one active per case) =====
create table public.transcripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  messages jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index transcripts_case_id_idx on public.transcripts(case_id);
create index transcripts_user_id_idx on public.transcripts(user_id);
create unique index transcripts_one_active_per_case_idx on public.transcripts(case_id) where is_active;

-- ===== aggregate_records (keyless, admin-only; no user/case FK) =====
create table public.aggregate_records (
  id uuid primary key default gen_random_uuid(),
  issue_type text,
  lever text,
  coverage_situation text,
  state text,
  provider_type text,
  billed_bucket text,
  allowed_bucket text,
  paid_bucket text,
  patient_resp_bucket text,
  outcome text,
  service_year int,
  recorded_at timestamptz not null default now()
);

-- ===== updated_at triggers =====
create trigger touch_profiles before update on public.profiles for each row execute function public.touch_updated_at();
create trigger touch_cases before update on public.cases for each row execute function public.touch_updated_at();
create trigger touch_deadlines before update on public.deadlines for each row execute function public.touch_updated_at();
create trigger touch_artifacts before update on public.artifacts for each row execute function public.touch_updated_at();
create trigger touch_transcripts before update on public.transcripts for each row execute function public.touch_updated_at();

-- ===== autocreate profile on signup =====
create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== RLS: every tenant table (forced; scoped to authenticated) =====
do $$
declare t text;
begin
  foreach t in array array['profiles','cases','documents','timeline_events','deadlines','artifacts','transcripts']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t||'_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t||'_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t||'_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t||'_delete', t);
  end loop;
end $$;

-- aggregate_records: RLS on + forced + NO policies => authenticated/anon get nothing;
-- only the service_role (BYPASSRLS) admin client writes/reads it.
alter table public.aggregate_records enable row level security;
alter table public.aggregate_records force row level security;
