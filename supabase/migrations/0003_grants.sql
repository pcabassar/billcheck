-- Explicit privilege GRANTs so the schema is reproducible on a FRESH Postgres, not only on the
-- existing Supabase project (where Supabase's auto-grant event triggers already grant these).
-- RLS policies are only consulted AFTER the table-level privilege check, so without these GRANTs
-- the `authenticated` role assumed by withUser() would hit "permission denied for table ..." at
-- runtime on a fresh/non-Supabase target. Harmless (idempotent intent) where already granted.
grant usage on schema public to authenticated, service_role, anon;

do $$
declare t text;
begin
  foreach t in array array['profiles','cases','documents','timeline_events','deadlines','artifacts','transcripts']
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Keyless aggregate store: service_role (admin client) only.
grant select, insert, update, delete on public.aggregate_records to service_role;
