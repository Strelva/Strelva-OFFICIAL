-- Data-preserving rollback: stop future provisioning, retain every account,
-- payer snapshot, source, client line and price. The widened created_via check
-- remains necessary for retained business provenance; no financial row erased.
begin;
set local lock_timeout='3s';
do $$
declare object_id oid;signature text;name text;expected text;
begin
 foreach signature in array array['public.ensure_native_business_billing_home(uuid)','public.native_business_billing_on_creation()'] loop
  object_id:=to_regprocedure(signature);
  expected:='native_business_billing_20261021095000:'||encode(sha256(convert_to(pg_get_functiondef(object_id),'UTF8')),'hex');
  if object_id is null or obj_description(object_id,'pg_proc') is distinct from expected then
   raise exception 'native_business_billing_rollback_conflict: function %',signature;
  end if;
 end loop;
 foreach name in array array['agency_client_additions_business_billing','workspace_creation_receipts_business_billing'] loop
  select oid into object_id from pg_trigger where tgname=name and tgrelid=case name
   when 'agency_client_additions_business_billing' then 'public.agency_client_additions'::regclass else 'public.workspace_creation_receipts'::regclass end;
  expected:='native_business_billing_20261021095000:'||encode(sha256(convert_to(pg_get_triggerdef(object_id,true),'UTF8')),'hex');
  if object_id is null or obj_description(object_id,'pg_trigger') is distinct from expected then
   raise exception 'native_business_billing_rollback_conflict: trigger %',name;
  end if;
 end loop;
end $$;
drop trigger agency_client_additions_business_billing on public.agency_client_additions;
drop trigger workspace_creation_receipts_business_billing on public.workspace_creation_receipts;
drop function public.native_business_billing_on_creation();
drop function public.ensure_native_business_billing_home(uuid);
notify pgrst,'reload schema';
commit;
