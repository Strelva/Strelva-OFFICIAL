-- Supabase grants EXECUTE on new public functions to anon and authenticated by
-- default. Five security-definer helpers were created without revoking that
-- grant, so anyone holding the public key could call them through PostgREST:
--   create_owned_workspace          revoked only from PUBLIC, not anon/authenticated
--   custom_application_*  (four)    no revoke at all
-- The app calls create_owned_workspace with the service role; the four
-- custom_application helpers are only called from other security-definer
-- functions. Revoke the direct grants and keep the service-role path.
set local lock_timeout = '3s';

revoke all on function public.create_owned_workspace(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.create_owned_workspace(uuid, text, text, text) to service_role;

revoke all on function public.custom_application_state_json(uuid) from public, anon, authenticated;
revoke all on function public.custom_application_touch_work(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.custom_application_artifact_summary(uuid, integer) from public, anon, authenticated;
revoke all on function public.custom_application_assert_identity(uuid, uuid, text, boolean) from public, anon, authenticated;
