-- Roll back only before new recovery pointers exist. Never silently discard
-- a saved owner's recovery receipt. Their Ask messages remain authoritative.
begin;
set local lock_timeout = '5s';
lock table public.workspace_creation_receipts in access exclusive mode;
do $$ begin
  if exists(select 1 from public.workspace_creation_receipts where ask_conversation_id is not null) then
    raise exception 'ux_owner_setup_ask_rollback_populated';
  end if;
end; $$;
drop function public.enter_customer_business(uuid,text,text,uuid,text,uuid,text);
alter function public.enter_customer_business_before_ux_owner(uuid,text,text,uuid,text,uuid,text)
  rename to enter_customer_business;
revoke all on function public.enter_customer_business(uuid,text,text,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.enter_customer_business(uuid,text,text,uuid,text,uuid,text) to service_role;
alter table public.workspace_creation_receipts drop column ask_conversation_id;
commit;
