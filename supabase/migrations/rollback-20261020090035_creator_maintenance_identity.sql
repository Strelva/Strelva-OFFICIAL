-- Do not retire current identity protection around any newly accepted terms.
begin;
set local lock_timeout='3s';
lock table public.creator_royalty_terms in share mode;
do $$begin
 if exists(select 1 from public.creator_royalty_terms t left join release_rollback_baseline.creator_maintenance_identity_terms b on b.id=t.id where b.id is null or b.receipt_hash<>md5(to_jsonb(t)::text))
  or exists(select 1 from release_rollback_baseline.creator_maintenance_identity_terms b where not exists(select 1 from public.creator_royalty_terms t where t.id=b.id)) then
  raise exception 'creator_maintenance_identity_history_preservation_required';
 end if;
 if (select count(*) from release_rollback_baseline.creator_maintenance_identity)<>2
  or exists(select 1 from release_rollback_baseline.creator_maintenance_identity b where to_regprocedure(b.signature) is null or b.definition_hash<>md5(pg_get_functiondef(to_regprocedure(b.signature))) or b.acl_hash<>md5(coalesce((select proacl::text from pg_proc where oid=to_regprocedure(b.signature)),''))) then
  raise exception 'creator_maintenance_identity_function_drift';
 end if;
end $$;
drop function public.record_creator_royalty_maintenance(uuid,uuid,text,text,text,text,timestamptz);
alter function public.record_creator_royalty_maintenance_before_identity(uuid,uuid,text,text,text,text,timestamptz)
 rename to record_creator_royalty_maintenance;
grant execute on function public.record_creator_royalty_maintenance(uuid,uuid,text,text,text,text,timestamptz) to service_role;
drop table release_rollback_baseline.creator_maintenance_identity,release_rollback_baseline.creator_maintenance_identity_terms;
notify pgrst,'reload schema';
commit;
