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

-- --------------------------------------------------------------- U11 seeds
-- FAP policies, hand-authored MINI1 set (~10 large systems; thresholds from
-- published policies as of 2026, FPL multiples; degraded copy elsewhere).
insert into public.ref_fap_policies (version, hospital_name, state, threshold_free_fpl, threshold_discount_fpl, source_url) values
  ('MINI1', 'NewYork-Presbyterian', 'NY', 4.0, 5.0, 'https://www.nyp.org/financialassistance'),
  ('MINI1', 'Mount Sinai', 'NY', 2.5, 4.0, 'https://www.mountsinai.org/about/financial-assistance'),
  ('MINI1', 'NYU Langone', 'NY', 2.0, 4.0, 'https://nyulangone.org/financial-assistance'),
  ('MINI1', 'Northwell Health', 'NY', 2.0, 5.0, 'https://www.northwell.edu/financial-assistance'),
  ('MINI1', 'Montefiore', 'NY', 2.0, 3.0, 'https://www.montefiore.org/financial-assistance'),
  ('MINI1', 'NYC Health + Hospitals', 'NY', 2.0, 5.0, 'https://www.nychealthandhospitals.org/nyc-care'),
  ('MINI1', 'Mayo Clinic', 'MN', 2.0, 4.0, 'https://www.mayoclinic.org/billing-insurance/financial-assistance'),
  ('MINI1', 'Cleveland Clinic', 'OH', 2.5, 4.0, 'https://my.clevelandclinic.org/patients/billing-finance/financial-assistance'),
  ('MINI1', 'Massachusetts General', 'MA', 3.0, 4.0, 'https://www.massgeneral.org/patient-billing/financial-assistance'),
  ('MINI1', 'Johns Hopkins', 'MD', 2.0, 5.0, 'https://www.hopkinsmedicine.org/patient_care/billing-insurance/assistance'),
  ('MINI1', 'St. Mary''s Medical Center', 'NY', 2.0, 4.0, null) -- synthetic test-bill provider (Phase A demos)
on conflict do nothing;
insert into public.ref_versions (table_name, version) values ('ref_fap_policies', 'MINI1')
on conflict do nothing;

-- Medicare PFS rates, MINI2: superset of MINI1 plus codes appearing in the
-- synthetic test bills + common E/M codes (append-only: MINI1 untouched —
-- prior findings' version stamps stay resolvable).
insert into public.ref_medicare_rates (version, code, national_rate_cents) values
  ('MINI2','99285',18500), ('MINI2','71046',3100), ('MINI2','36415',300),
  ('MINI2','80053',1050), ('MINI2','85025',775), ('MINI2','80048',850),
  ('MINI2','85027',650), ('MINI2','99213',9200), ('MINI2','99214',13000),
  ('MINI2','96372',1400), ('MINI2','J0696',120), ('MINI2','80061',1100),
  ('MINI2','81001',310), ('MINI2','93000',1700)
on conflict do nothing;
insert into public.ref_versions (table_name, version) values ('ref_medicare_rates', 'MINI2')
on conflict do nothing;
