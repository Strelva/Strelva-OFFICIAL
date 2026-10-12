begin;
set local lock_timeout='3s';
do $$ declare baseline record; begin
  if exists(select 1 from public.outside_write_receipts where request ? 'authorship') then
    raise exception 'rollback_content_publication_has_outputs';
  end if;
  select * into baseline from release_rollback_baseline.content_publication_authority where singleton;
  if baseline.after_hash is distinct from md5(pg_get_functiondef('public.write_operator_content(text,text,jsonb)'::regprocedure)) then
    raise exception 'rollback_wrong_order_or_function_drift: content publication authority';
  end if;
  if not exists(select 1 from pg_proc p where p.oid=to_regprocedure('public.write_content_as_actor(text,text,jsonb,uuid,text)')
    and p.oid=baseline.actor_oid and p.proowner=baseline.actor_owner and p.proacl is not distinct from baseline.actor_acl
    and md5(pg_get_functiondef(p.oid))=baseline.actor_hash) then
    raise exception 'rollback_wrong_order_or_function_drift: actor content publication';
  end if;
  execute baseline.definition;
end $$;
drop function public.write_content_as_actor(text,text,jsonb,uuid,text);
drop table release_rollback_baseline.content_publication_authority;
commit;
