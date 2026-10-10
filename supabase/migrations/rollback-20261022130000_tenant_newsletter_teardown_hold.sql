-- Refuse drift before the first DROP/rename/write; restore captured341 exactly.
begin;
set local lock_timeout='3s';
do $inverse_preflight$
declare item record; p record; current_acl jsonb; acl_entry record;
begin
 if not exists(select 1 from pg_class where oid='public.tenant_newsletter_teardown_function_journal'::regclass
  and relowner=(current_user::regrole)::oid and relrowsecurity)
  or exists(select 1 from pg_class t cross join lateral aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) a
   where t.oid='public.tenant_newsletter_teardown_function_journal'::regclass and a.grantee<>t.relowner)
  or exists(select 1 from pg_attribute col join pg_class rel on rel.oid=col.attrelid
   cross join lateral aclexplode(col.attacl) acl
   where col.attrelid='public.tenant_newsletter_teardown_function_journal'::regclass
    and col.attnum>0 and not col.attisdropped and acl.grantee<>rel.relowner)
  or exists(select 1 from pg_policy where polrelid='public.tenant_newsletter_teardown_function_journal'::regclass) then
  raise exception 'newsletter_teardown_journal_authority_changed';
 end if;
 if (select count(*) from public.tenant_newsletter_teardown_function_journal)<>3
  or exists(select 1 from public.tenant_newsletter_teardown_function_journal where after_definition is null or after_acl is null
   or signature not in ('public.tenant_cleanup_teardown_blockers(text)',
    'public.tenant_cleanup_teardown_blockers_before_newsletter(text)',
    'public.deprovision_tenant_guarded_before_cleanup(text,boolean,boolean,boolean)')
   or ((before_definition is null) is distinct from (signature='public.tenant_cleanup_teardown_blockers_before_newsletter(text)'))) then
  raise exception 'newsletter_teardown_invalid_journal';
 end if;
 for item in select * from public.tenant_newsletter_teardown_function_journal loop
  select * into p from pg_proc where oid=to_regprocedure(item.signature);
  if p.oid is null or p.proowner<>item.owner_id or p.proowner<>(current_user::regrole)::oid
   or pg_get_functiondef(p.oid) is distinct from item.after_definition then
   raise exception 'newsletter_teardown_successor_changed: %',item.signature;
  end if;
  select coalesce(jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable)
   order by a.grantor,a.grantee,a.privilege_type,a.is_grantable),'[]'::jsonb) into current_acl
   from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a;
  if current_acl is distinct from item.after_acl then raise exception 'newsletter_teardown_successor_acl_changed: %',item.signature;end if;
  for acl_entry in select * from aclexplode(item.before_acl) loop
   if acl_entry.grantor<>item.owner_id or acl_entry.privilege_type<>'EXECUTE' or acl_entry.is_grantable
    or not exists(select 1 from pg_roles where oid=acl_entry.grantor)
    or (acl_entry.grantee<>item.owner_id and (item.signature<>'public.tenant_cleanup_teardown_blockers(text)' or acl_entry.grantee<>('service_role'::regrole)::oid)) then
    raise exception 'newsletter_teardown_unsupported_acl_baseline: %',item.signature;
   end if;
  end loop;
 end loop;
end $inverse_preflight$;
drop function public.tenant_cleanup_teardown_blockers(text);
alter function public.tenant_cleanup_teardown_blockers_before_newsletter(text) rename to tenant_cleanup_teardown_blockers;
do $restore$
declare item record; acl_entry record; actual_acl jsonb; expected_acl jsonb;
begin
 for item in select * from public.tenant_newsletter_teardown_function_journal where before_definition is not null loop
  execute item.before_definition;
  -- Only these two packet-owned functions change. The preflight forbids any
  -- delegated/grant-option graph; no CASCADE or global role cleanup is needed.
  for acl_entry in select distinct acl.grantee from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=item.signature::regprocedure loop
   execute 'revoke all on function '||item.signature||' from '||case when acl_entry.grantee=0 then 'PUBLIC' else quote_ident(pg_get_userbyid(acl_entry.grantee)) end;
  end loop;
  for acl_entry in select * from aclexplode(item.before_acl) loop
   execute 'grant EXECUTE on function '||item.signature||' to '||quote_ident(pg_get_userbyid(acl_entry.grantee));
  end loop;
  select coalesce(jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable)
   order by a.grantor,a.grantee,a.privilege_type,a.is_grantable),'[]'::jsonb) into expected_acl from aclexplode(item.before_acl) a;
  select coalesce(jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable)
   order by a.grantor,a.grantee,a.privilege_type,a.is_grantable),'[]'::jsonb) into actual_acl
   from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=item.signature::regprocedure;
  if actual_acl is distinct from expected_acl or pg_get_functiondef(item.signature::regprocedure) is distinct from item.before_definition then
   raise exception 'newsletter_teardown_predecessor_restore_mismatch: %',item.signature;
  end if;
 end loop;
end $restore$;
drop table public.tenant_newsletter_teardown_function_journal;
commit;
