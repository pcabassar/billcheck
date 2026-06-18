-- Advisor remediation: pin search_path on all trigger functions and remove
-- them from the exposed RPC surface (triggers fire regardless of EXECUTE).

alter function public.validate_case_transition() set search_path = public;
alter function public.touch_updated_at() set search_path = public;
alter function public.case_events_block_mutation() set search_path = public;

revoke execute on function public.validate_case_transition() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.case_events_block_mutation() from public, anon, authenticated;
revoke execute on function public.append_state_event() from public, anon, authenticated;
