-- Phase B.5+C schema (accumulating: U10 triage → U18 claim). Each unit's
-- needs append here; applied once per batch.

-- ------------------------------------------------------------- U10 triage
-- WAITING_ADJUDICATION / WAITING_ITEMIZED are pre-audit states: line-item
-- edits stay open there (the 0008 guard only knew CAPTURED/TRIAGED).
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
  if v_state is null
     or v_state not in ('CAPTURED','TRIAGED','WAITING_ADJUDICATION','WAITING_ITEMIZED')
     or v_locked is not null then
    raise exception 'line_items are locked for this case (state %, audit_locked %)', v_state, v_locked is not null;
  end if;
  return coalesce(new, old);
end $$;
