-- Never erase a pending/accepted provider receipt. Refuse even closed history.
begin;
set local lock_timeout = '3s';
lock table public.workspace_subscription_checkouts in access exclusive mode;
do $$ begin
  if exists(select 1 from public.workspace_subscription_checkouts) then raise exception 'workspace_checkout_populated_rollback_refused'; end if;
  if (select count(*)<>3 or not bool_and(after_hash=md5(pg_get_functiondef(signature::regprocedure))) from ux_owner2_checkout_rollback.functions)
    then raise exception 'workspace_checkout_rollback_function_drift'; end if;
end $$;
drop function public.prepare_workspace_subscription_checkout(uuid,uuid,text,jsonb,uuid);
drop function public.observe_workspace_subscription_checkout(uuid,text,text,text,text,boolean);
drop function public.assert_workspace_subscription_checkout(uuid,uuid,text);
drop table public.workspace_subscription_checkouts;
drop schema ux_owner2_checkout_rollback cascade;
commit;
