-- Roll back owner email confirmations. With owner_email_confirmed gone the
-- email transport's read fails and every owner stream send is held.
-- Drops recorded confirmations; capture them first if they must be restored.
begin;
set local lock_timeout = '3s';
drop function public.revoke_owner_email_confirmation(uuid, text, uuid, text);
drop function public.confirm_owner_email(uuid, text, uuid, text, text);
drop function public.owner_email_confirmed(uuid, text);
drop trigger workspaces_forget_owner_email_confirmations on public.workspaces;
drop function public.owner_email_confirmations_forget();
drop table public.owner_email_confirmations;
notify pgrst, 'reload schema';
commit;
