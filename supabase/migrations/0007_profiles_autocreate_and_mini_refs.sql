-- Applied remotely 2026-06-12 (repo file added retroactively — keep in sync).
-- (a) Auto-create a profiles row for every new auth user (PHASE gate dependency).
-- (b) MINI1: tiny hand-authored reference set for the demo slice (replaced by
--     real CMS quarterly seeds via the manual-download process; append-only).

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.ref_mue (version, code, max_units) values
  ('MINI1','36415',3), ('MINI1','71046',2), ('MINI1','99285',1), ('MINI1','80053',1), ('MINI1','85025',1)
on conflict do nothing;

insert into public.ref_ncci_ptp (version, code1, code2, modifier_allowed) values
  ('MINI1','80053','80048',false), ('MINI1','85025','85027',false)
on conflict do nothing;

insert into public.ref_medicare_rates (version, code, national_rate_cents) values
  ('MINI1','99285',18500), ('MINI1','71046',3100), ('MINI1','36415',300), ('MINI1','80053',1050), ('MINI1','85025',775)
on conflict do nothing;
