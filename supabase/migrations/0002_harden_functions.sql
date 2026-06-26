-- Hardening: trigger functions should not be callable as RPC by clients.
-- Triggers still fire (they run in trigger context, not via the role's EXECUTE grant).
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.touch_updated_at() from anon, authenticated, public;

comment on table public.aggregate_records is
  'Keyless, de-identified aggregate store. RLS enabled + forced with NO policies by design: only the service_role (BYPASSRLS) admin client may read/write. Never reachable by authenticated/anon clients.';
