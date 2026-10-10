begin;
set local lock_timeout='2s';
-- Audit journal authority before trusting any journal row.
do $private_table_authority$
declare table_name text;
begin
 foreach table_name in array array['public.private_application_sources','public.private_source_install_grants','public.private_definition_predecessors','public.private_definition_function_receipts'] loop
  if exists(select 1 from pg_policy where polrelid=table_name::regclass)
   or exists(select 1 from pg_attribute attribute join pg_class c on c.oid=attribute.attrelid
    cross join lateral aclexplode(attribute.attacl) acl
    where attribute.attrelid=table_name::regclass and attribute.attnum>0 and not attribute.attisdropped
     and (acl.grantee<>c.relowner or acl.grantor<>c.relowner))
   or not exists(select 1 from pg_class where oid=table_name::regclass and relowner=(current_user::regrole)::oid and relrowsecurity)
   or exists(select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
    where c.oid=table_name::regclass and (acl.grantee<>c.relowner or acl.grantor<>c.relowner)) then
   raise exception 'private_definition_table_authority_changed: %',table_name;
  end if;
 end loop;
end $private_table_authority$;
do $audit_all$
declare item record; current_acl jsonb;
begin
 for item in select * from public.private_definition_function_receipts order by signature loop
  if encode(sha256(convert_to(pg_get_functiondef(item.signature::regprocedure),'UTF8')),'hex')<>item.body_sha256 then
   raise exception 'private_definition_successor_changed: %',item.signature;
  end if;
  select coalesce(jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable)
   order by a.grantor,a.grantee,a.privilege_type,a.is_grantable),'[]'::jsonb) into current_acl
   from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=item.signature::regprocedure;
  if current_acl is distinct from item.acl then raise exception 'private_definition_successor_acl_changed: %',item.signature;end if;
 end loop;
 -- Old/unqualified packets must also fail closed if they captured a grant
 -- graph this bounded inverse cannot reproduce, or a role has disappeared.
 if exists(select 1 from public.private_definition_predecessors receipt join pg_proc p on p.oid=receipt.signature::regprocedure
   where p.proowner<>(current_user::regrole)::oid)
  or exists(select 1 from public.private_definition_predecessors receipt join pg_proc p on p.oid=receipt.signature::regprocedure
   cross join lateral aclexplode(receipt.before_acl) acl where acl.grantor<>p.proowner or acl.privilege_type<>'EXECUTE'
    or not exists(select 1 from pg_roles where oid=acl.grantor)
    or (acl.grantee<>0 and not exists(select 1 from pg_roles where oid=acl.grantee))) then
  raise exception 'private_definition_unsupported_acl_baseline';
 end if;
 -- Serialize history producers before the fresh emptiness check and keep locks through drops.
 lock table public.private_application_sources,public.private_source_install_grants in access exclusive mode;
 if exists(select 1 from public.private_application_sources) or exists(select 1 from public.private_source_install_grants) then
  raise exception 'private_definition_populated_forward_only';
 end if;
end $audit_all$;
do $restore$
declare item record; privilege record; current_acl jsonb; expected_acl jsonb;
begin
 for item in select * from public.private_definition_predecessors loop
  if encode(sha256(convert_to(pg_get_functiondef(item.signature::regprocedure),'UTF8')),'hex')<>item.after_sha256 then raise exception 'private_definition_successor_changed';end if;
  select coalesce(jsonb_agg(jsonb_build_array(acl.grantor,acl.grantee,acl.privilege_type,acl.is_grantable)
   order by acl.grantor,acl.grantee,acl.privilege_type,acl.is_grantable),'[]'::jsonb) into current_acl
   from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=item.signature::regprocedure;
  if current_acl is distinct from item.after_acl then raise exception 'private_definition_successor_acl_changed';end if;
  execute item.before_definition;
  -- Clear every actual grantee (including custom default-role grants), then
  -- restore exact captured privileges and grant-option state.
  for privilege in select distinct acl.grantee from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=item.signature::regprocedure loop
   execute 'revoke all on function '||item.signature||' from '||case when privilege.grantee=0 then 'PUBLIC' else quote_ident(pg_get_userbyid(privilege.grantee)) end||' cascade';
  end loop;
  for privilege in select * from aclexplode(item.before_acl) loop
   execute 'grant '||privilege.privilege_type||' on function '||item.signature||' to '||case when privilege.grantee=0 then 'PUBLIC' else quote_ident(pg_get_userbyid(privilege.grantee)) end||case when privilege.is_grantable then ' with grant option' else '' end;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_array(acl.grantor,acl.grantee,acl.privilege_type,acl.is_grantable)
   order by acl.grantor,acl.grantee,acl.privilege_type,acl.is_grantable),'[]'::jsonb) into expected_acl
   from aclexplode(item.before_acl) acl;
  select coalesce(jsonb_agg(jsonb_build_array(acl.grantor,acl.grantee,acl.privilege_type,acl.is_grantable)
   order by acl.grantor,acl.grantee,acl.privilege_type,acl.is_grantable),'[]'::jsonb) into current_acl
   from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=item.signature::regprocedure;
  if current_acl is distinct from expected_acl then raise exception 'private_definition_predecessor_acl_restore_mismatch: %',item.signature;end if;
 end loop;
end $restore$;
drop function public.create_version_system_command_private_core(uuid,text,jsonb,text,text,uuid,jsonb);
drop function public.create_private_version_system_command(uuid,text,jsonb,text,text,uuid,jsonb);
drop function public.require_private_application_source_share(uuid,uuid,text,uuid);
drop function public.grant_private_application_install(uuid,uuid,text,uuid,uuid,uuid,timestamptz);
drop function public.require_system_package_install_scope_private_core(uuid,uuid,text,uuid,integer,uuid);
drop function public.system_version_access_private_core(public.system_versions,uuid,text,boolean);
drop function public.system_actor_scope_private_core(uuid,uuid,text,boolean);
drop function public.lock_system_package_install_grant_private_core(uuid,uuid,text);
drop function public.system_package_install_grant_active_private_core(public.system_package_install_grants,uuid,text);
drop table public.private_source_install_grants;
drop function public.set_private_application_source_share(uuid,uuid,text,uuid,uuid,boolean);
drop function public.publish_private_application_source(uuid,uuid,text,uuid,uuid,integer,jsonb);
drop table public.private_application_sources;
drop table public.private_definition_function_receipts;
drop table public.private_definition_predecessors;
commit;
