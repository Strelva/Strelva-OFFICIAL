\set ON_ERROR_STOP on
begin read only;
do $contract$
declare signature text; table_name text; audited_function record; actual_acl jsonb;
begin
 if (select count(*) from public.private_definition_function_receipts)<>17 or (select count(*) from public.private_definition_predecessors)<>6 then raise exception 'private_journal_incomplete';end if;
 foreach table_name in array array['public.private_application_sources','public.private_source_install_grants','public.private_definition_predecessors','public.private_definition_function_receipts'] loop
  if not exists(select 1 from pg_class where oid=table_name::regclass and relowner=(current_user::regrole)::oid and relrowsecurity)
   or exists(select 1 from pg_policy where polrelid=table_name::regclass)
   or exists(select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl where c.oid=table_name::regclass and (acl.grantee<>c.relowner or acl.grantor<>c.relowner))
   or exists(select 1 from pg_attribute attribute join pg_class c on c.oid=attribute.attrelid cross join lateral aclexplode(attribute.attacl) acl where attribute.attrelid=table_name::regclass and attribute.attnum>0 and not attribute.attisdropped and (acl.grantee<>c.relowner or acl.grantor<>c.relowner))
   then raise exception 'private_table_authority_not_closed';end if;
 end loop;
 for audited_function in select * from public.private_definition_function_receipts loop
  if audited_function.body_sha256<>encode(sha256(convert_to(pg_get_functiondef(audited_function.signature::regprocedure),'UTF8')),'hex') then raise exception 'private_successor_body_drift';end if;
  select coalesce(jsonb_agg(jsonb_build_array(acl.grantor,acl.grantee,acl.privilege_type,acl.is_grantable) order by acl.grantor,acl.grantee,acl.privilege_type,acl.is_grantable),'[]'::jsonb) into actual_acl
   from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=audited_function.signature::regprocedure;
  if actual_acl is distinct from audited_function.acl then raise exception 'private_successor_acl_drift';end if;
 end loop;
 foreach signature in array array[
 'public.system_package_install_grant_active(public.system_package_install_grants,uuid,text)',
 'public.require_private_application_source_share(uuid,uuid,text,uuid)'] loop
  if (select provolatile from pg_proc where oid=signature::regprocedure)<>'s' then raise exception 'private_read_not_stable';end if;
  if has_function_privilege('anon',signature,'EXECUTE') or has_function_privilege('authenticated',signature,'EXECUTE') then raise exception 'private_read_exposed';end if;
 end loop;
 if exists(select 1 from public.private_definition_predecessors receipt where encode(sha256(convert_to(pg_get_functiondef(receipt.signature::regprocedure),'UTF8')),'hex')<>receipt.after_sha256)then raise exception 'private_predecessor_drift';end if;
end $contract$;
rollback;
