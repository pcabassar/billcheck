-- Review round 1 (2026-06-12): fixes from the 12-persona whole-repo review.
-- Findings fixed here: F16 (client-writable is_test_account = PHASE-gate
-- bypass), F28 (FOR ALL policies grant client UPDATE/DELETE broadly),
-- F05/F06 (reference-version provenance), F09 (parse staleness clock),
-- F10 (unfenced delete-and-replace), F14 (no per-case run uniqueness),
-- F23 (artifact draft pileup), F26-partial (provisional rollback path),
-- F36 (unbounded parse retries), F73 (PHI in PostgREST URL filters),
-- plus the Supabase advisor lints (RLS initplan wrapping, FK indexes).

-- ---------------------------------------------------------------- columns
alter table public.documents add column if not exists parse_started_at timestamptz;
alter table public.documents add column if not exists parse_attempts int not null default 0;
alter table public.cases add column if not exists process_started_at timestamptz;
alter table public.cases add column if not exists audit_locked_at timestamptz;

-- ------------------------------------------------- reference version registry
-- F05/F06: "latest version" was the lexicographic max label (MINI1 would
-- shadow 2026Q2). Loads are now recorded here; latest = most recent load.
create table if not exists public.ref_versions (
  id bigint generated always as identity primary key,
  table_name text not null check (table_name in
    ('ref_ncci_ptp','ref_mue','ref_medicare_rates','ref_carc_rarc','ref_fap_policies')),
  version text not null,
  loaded_at timestamptz not null default now(),
  unique (table_name, version)
);
alter table public.ref_versions enable row level security; -- server-only: no policies
insert into public.ref_versions (table_name, version) values
  ('ref_ncci_ptp','MINI1'), ('ref_mue','MINI1'), ('ref_medicare_rates','MINI1')
on conflict do nothing;

-- ------------------------------------------------------------ run uniqueness
-- F14: at most one running engine run per case; a second concurrent audit
-- dies on insert instead of duplicating findings. Stale rows are swept to
-- 'dead' by the cron reconciler. Clean any current strays first.
update public.engine_runs set status = 'dead' where status = 'running';
create unique index if not exists engine_runs_one_running_per_case
  on public.engine_runs (case_id) where (status = 'running');

-- F23: at most one unapproved draft artifact per (case, type); the route
-- returns the existing draft instead of burning another letter-fill call.
with ranked as (
  select id, row_number() over (partition by case_id, type order by created_at desc) rn
  from public.artifacts where approved_at is null
)
delete from public.artifacts a using ranked r where a.id = r.id and r.rn > 1;
create unique index if not exists artifacts_one_open_draft_per_case
  on public.artifacts (case_id, type) where (approved_at is null);

-- --------------------------------------------------------------------- RLS
-- F16/F28 + advisor initplan: policies are recreated split-by-command (no
-- more blanket FOR ALL), with auth.uid() wrapped in a scalar subquery.
-- Client write surface after this block:
--   profiles      SELECT only (is_test_account is server-owned — PHASE gate)
--   cases         SELECT + INSERT (state/claims are server-owned)
--   documents     SELECT + INSERT + UPDATE (no DELETE)
--   line_items    SELECT + UPDATE (inserts come from the parse RPC)
--   attestations  SELECT + INSERT + UPDATE (no DELETE)
--   read-only tables unchanged apart from initplan wrapping.

drop policy if exists profiles_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (user_id = (select auth.uid()));

drop policy if exists cases_own on public.cases;
create policy cases_select_own on public.cases
  for select using (user_id = (select auth.uid()));
create policy cases_insert_own on public.cases
  for insert with check (user_id = (select auth.uid()));

drop policy if exists documents_own on public.documents;
create policy documents_select_own on public.documents
  for select using (exists (
    select 1 from public.cases c where c.id = case_id and c.user_id = (select auth.uid())));
create policy documents_insert_own on public.documents
  for insert with check (exists (
    select 1 from public.cases c where c.id = case_id and c.user_id = (select auth.uid())));
create policy documents_update_own on public.documents
  for update using (exists (
    select 1 from public.cases c where c.id = case_id and c.user_id = (select auth.uid())))
  with check (exists (
    select 1 from public.cases c where c.id = case_id and c.user_id = (select auth.uid())));

drop policy if exists line_items_own on public.line_items;
create policy line_items_select_own on public.line_items
  for select using (exists (
    select 1 from public.documents d join public.cases c on c.id = d.case_id
    where d.id = document_id and c.user_id = (select auth.uid())));
create policy line_items_update_own on public.line_items
  for update using (exists (
    select 1 from public.documents d join public.cases c on c.id = d.case_id
    where d.id = document_id and c.user_id = (select auth.uid())))
  with check (exists (
    select 1 from public.documents d join public.cases c on c.id = d.case_id
    where d.id = document_id and c.user_id = (select auth.uid())));

drop policy if exists attestations_own on public.attestations;
create policy attestations_select_own on public.attestations
  for select using (exists (
    select 1 from public.line_items li
    join public.documents d on d.id = li.document_id
    join public.cases c on c.id = d.case_id
    where li.id = line_item_id and c.user_id = (select auth.uid())));
create policy attestations_insert_own on public.attestations
  for insert with check (exists (
    select 1 from public.line_items li
    join public.documents d on d.id = li.document_id
    join public.cases c on c.id = d.case_id
    where li.id = line_item_id and c.user_id = (select auth.uid())));
create policy attestations_update_own on public.attestations
  for update using (exists (
    select 1 from public.line_items li
    join public.documents d on d.id = li.document_id
    join public.cases c on c.id = d.case_id
    where li.id = line_item_id and c.user_id = (select auth.uid())))
  with check (exists (
    select 1 from public.line_items li
    join public.documents d on d.id = li.document_id
    join public.cases c on c.id = d.case_id
    where li.id = line_item_id and c.user_id = (select auth.uid())));

-- Read-only policies: recreate with initplan wrapping (advisor 0003).
drop policy if exists case_events_read on public.case_events;
create policy case_events_read on public.case_events
  for select using (exists (
    select 1 from public.cases c where c.id = case_id and c.user_id = (select auth.uid())));
drop policy if exists engine_runs_read on public.engine_runs;
create policy engine_runs_read on public.engine_runs
  for select using (exists (
    select 1 from public.cases c where c.id = case_id and c.user_id = (select auth.uid())));
drop policy if exists findings_read on public.findings;
create policy findings_read on public.findings
  for select using (exists (
    select 1 from public.cases c where c.id = case_id and c.user_id = (select auth.uid())));
drop policy if exists verdicts_read on public.verdicts;
create policy verdicts_read on public.verdicts
  for select using (exists (
    select 1 from public.cases c where c.id = case_id and c.user_id = (select auth.uid())));
drop policy if exists artifacts_read on public.artifacts;
create policy artifacts_read on public.artifacts
  for select using (exists (
    select 1 from public.cases c where c.id = case_id and c.user_id = (select auth.uid())));
drop policy if exists deadlines_read on public.deadlines;
create policy deadlines_read on public.deadlines
  for select using (exists (
    select 1 from public.cases c where c.id = case_id and c.user_id = (select auth.uid())));
drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments
  for select using (exists (
    select 1 from public.cases c where c.id = case_id and c.user_id = (select auth.uid())));
drop policy if exists ai_calls_read on public.ai_calls;
create policy ai_calls_read on public.ai_calls
  for select using (
    case_id is not null
    and exists (select 1 from public.cases c where c.id = case_id and c.user_id = (select auth.uid())));

-- --------------------------------------------------- line-item edit lock (DB)
-- F28/F71: the AUDITED edit lock lived only in the route handler; direct
-- PostgREST writes bypassed it. Client (JWT-bearing) UPDATE/DELETE on
-- line_items is now rejected in the DB once the case leaves the editable
-- states or the audit claim is taken. Service-role traffic (no sub claim)
-- passes — the parse RPC is the sanctioned writer.
create or replace function public.line_items_client_edit_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_state text; v_locked timestamptz;
begin
  if (select auth.uid()) is null then
    return coalesce(new, old); -- service role / no JWT
  end if;
  select c.state, c.audit_locked_at into v_state, v_locked
  from public.documents d join public.cases c on c.id = d.case_id
  where d.id = coalesce(new.document_id, old.document_id);
  if v_state is null or v_state not in ('CAPTURED','TRIAGED') or v_locked is not null then
    raise exception 'line_items are locked for this case (state %, audit_locked %)', v_state, v_locked is not null;
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function public.line_items_client_edit_guard() from public, anon, authenticated;

drop trigger if exists line_items_client_edit_lock on public.line_items;
create trigger line_items_client_edit_lock
  before update or delete on public.line_items
  for each row execute function public.line_items_client_edit_guard();

-- ------------------------------------------------------- parse finish (atomic)
-- F10: delete-and-replace + status CAS now commit in ONE transaction, fenced
-- on still holding the 'parsing' claim. A sweeper or competing writer that
-- took the document away makes this a no-op (returns false) instead of
-- interleaving into doubled line items.
create or replace function public.replace_line_items_and_finish(
  p_document_id uuid,
  p_rows jsonb,
  p_printed_total_cents bigint,
  p_reconciliation_ok boolean,
  p_extracted jsonb
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update public.documents
     set parse_status = 'parsed',
         printed_total_cents = p_printed_total_cents,
         reconciliation_ok = p_reconciliation_ok,
         extracted = p_extracted
   where id = p_document_id and parse_status = 'parsing';
  get diagnostics v_count = row_count;
  if v_count = 0 then
    return false; -- lost the claim: do not touch line items
  end if;

  delete from public.line_items where document_id = p_document_id;
  insert into public.line_items
    (document_id, code, code_system, description_raw, description_plain,
     units, amount_cents, date_of_service, confidence)
  select p_document_id,
         r->>'code',
         r->>'code_system',
         r->>'description_raw',
         r->>'description_plain',
         (r->>'units')::int,
         (r->>'amount_cents')::bigint,
         (r->>'date_of_service')::date,
         coalesce((r->>'confidence')::real, 0)
    from jsonb_array_elements(p_rows) as r;
  return true;
end $$;
revoke execute on function public.replace_line_items_and_finish(uuid, jsonb, bigint, boolean, jsonb)
  from public, anon, authenticated;

-- ------------------------------------------------- provisional case rollback
-- F26 (partial): cases_append_state_event fires on INSERT, so every case has
-- a case_events row and the append-only trigger blocked EVERY case delete —
-- the upload route's provisional rollback has never worked. Sanctioned,
-- guarded path: empty CAPTURED cases only, purge GUC set transaction-local.
create or replace function public.rollback_provisional_case(p_case_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.documents where case_id = p_case_id) then
    return false;
  end if;
  if (select state from public.cases where id = p_case_id) is distinct from 'CAPTURED' then
    return false;
  end if;
  perform set_config('billcheck.purge', 'on', true);
  delete from public.cases where id = p_case_id;
  return true;
end $$;
revoke execute on function public.rollback_provisional_case(uuid) from public, anon, authenticated;

-- --------------------------------------------------------- dedupe lookup RPC
-- F73: the dedupe lookup filtered on extracted->>provider/accountNumber/
-- dateOfService via PostgREST GET params — PHI in URL query strings lands in
-- Supabase API logs. RPC params travel in the POST body. SECURITY INVOKER:
-- the caller's RLS scopes results to their own documents.
create or replace function public.find_duplicate_documents(
  p_provider text, p_account text, p_dos text, p_exclude uuid
) returns table (id uuid, case_id uuid, version_group uuid, content_hash text)
language sql stable set search_path = public as $$
  select d.id, d.case_id, d.version_group, d.content_hash
    from public.documents d
   where d.extracted->>'provider' = p_provider
     and d.extracted->>'accountNumber' = p_account
     and d.extracted->>'dateOfService' = p_dos
     and d.id <> p_exclude
$$;
grant execute on function public.find_duplicate_documents(text, text, text, uuid) to authenticated;

-- ------------------------------------------------------- FK covering indexes
create index if not exists ai_calls_case_id_idx on public.ai_calls (case_id);
create index if not exists ai_calls_document_id_idx on public.ai_calls (document_id);
create index if not exists ai_calls_engine_run_id_idx on public.ai_calls (engine_run_id);
create index if not exists artifacts_case_id_idx on public.artifacts (case_id);
create index if not exists case_events_case_id_idx on public.case_events (case_id);
create index if not exists cases_current_run_id_idx on public.cases (current_run_id);
create index if not exists cases_user_id_idx on public.cases (user_id);
create index if not exists deadlines_case_id_idx on public.deadlines (case_id);
create index if not exists documents_case_id_idx on public.documents (case_id);
create index if not exists engine_runs_case_id_idx on public.engine_runs (case_id);
create index if not exists findings_case_id_idx on public.findings (case_id);
create index if not exists line_items_document_id_idx on public.line_items (document_id);
create index if not exists payments_case_id_idx on public.payments (case_id);
create index if not exists verdicts_case_id_idx on public.verdicts (case_id);
create index if not exists verdicts_run_id_idx on public.verdicts (run_id);
