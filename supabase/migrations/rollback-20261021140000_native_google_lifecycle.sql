-- Prepared operator rollback, never an automatic recovery or credential replay.
-- Refuse populated lifecycle records and any source drift before touching objects.
begin;
set local lock_timeout='3s';
set local statement_timeout='10s';
select pg_advisory_xact_lock(771904091);
do $$ declare prior record; properties jsonb; restored_source text; applied_definition text; expected_prior_source_hash text; expected_applied_source_hash text; catalog pg_proc%rowtype; expected_arguments text[]; begin
 if exists(select 1 from public.native_google_disconnect_receipts) or exists(select 1 from public.native_google_oauth_attempts) then raise exception 'native_google_rollback_populated_review_required'; end if;
 if (select count(*) from public.native_google_lifecycle_prior_functions)<>2
  or not exists(select 1 from public.native_google_lifecycle_prior_functions where signature='public.upsert_workspace_google_location(uuid,text,text,text)')
  or not exists(select 1 from public.native_google_lifecycle_prior_functions where signature='public.upsert_workspace_account_binding(jsonb,text)') then raise exception 'native_google_rollback_archive_incomplete'; end if;
 for prior in select * from public.native_google_lifecycle_prior_functions loop
  -- Source hashes come from the two immutable historical bodies pinned in the
  -- forward migration. Authenticate the whole saved SQL before EXECUTE, even
  -- if somebody changed its journal hash along with its definition.
  if prior.signature='public.upsert_workspace_google_location(uuid,text,text,text)' then
   expected_prior_source_hash:='d0073edf2c82e026e20df7fada8363b3122f2dfe089bfa188e11ec2010ac0533';
   expected_applied_source_hash:='dbfde686e20957b96c73f8d2ed1b7597d4999620b0c2195540d678779884fa52';
   expected_arguments:=array['p_binding_id','p_account_id','p_location_id','p_title'];
  elsif prior.signature='public.upsert_workspace_account_binding(jsonb,text)' then
   expected_prior_source_hash:='6efde76058d063fbccd77a05ffdec48ffcd46b1d585376e750e68632658b05b8';
   expected_applied_source_hash:='1f5ec785245ec2f06e4b543146feee051d8388463ab62b15c18081d795405bbd';
   expected_arguments:=array['p_input','p_mode'];
  else raise exception 'native_google_rollback_archive_incomplete'; end if;
  applied_definition:=pg_get_functiondef(to_regprocedure(prior.signature));
  if prior.applied_hash is null or prior.applied_properties is null
   or encode(sha256(convert_to(applied_definition,'UTF8')),'hex') is distinct from prior.applied_hash then raise exception 'native_google_rollback_source_drift'; end if;
  if prior.prior_source_hash is distinct from expected_prior_source_hash
   or (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid=to_regprocedure(prior.signature)) is distinct from expected_applied_source_hash
   or encode(sha256(convert_to(prior.definition,'UTF8')),'hex') is distinct from prior.prior_definition_hash
   or prior.definition is distinct from replace(applied_definition,'  perform pg_advisory_xact_lock(771904091);'||chr(10),'')
   or prior.prior_properties is distinct from prior.applied_properties then raise exception 'native_google_rollback_archive_drift'; end if;
  -- Immutable authority policy lives in this inverse, not in either mutable
  -- journal snapshot or a replaceable helper. Rebaselining both snapshots
  -- cannot admit an unexpected EXECUTE grant or changed function properties.
  select * into catalog from pg_proc where oid=to_regprocedure(prior.signature);
  if not found or catalog.proowner is distinct from (select relowner from pg_class where oid='public.workspace_account_bindings'::regclass)
   or (select lanname from pg_language where oid=catalog.prolang) is distinct from 'plpgsql'
   or catalog.prokind<>'f' or not catalog.prosecdef or catalog.proisstrict or catalog.proleakproof or catalog.proretset
   or catalog.provolatile<>'v' or catalog.proparallel<>'u' or catalog.prosupport<>0 or catalog.provariadic<>0
   or catalog.procost<>100 or catalog.prorows<>0 or catalog.probin is not null or catalog.prosqlbody is not null
   or catalog.prorettype<>'jsonb'::regtype or catalog.proargnames is distinct from expected_arguments
   or catalog.proallargtypes is not null or catalog.proargmodes is not null or catalog.pronargdefaults<>0
   or catalog.proconfig is distinct from array['search_path=public, pg_temp']::text[]
   or exists(select 1 from aclexplode(coalesce(catalog.proacl,acldefault('f',catalog.proowner))) a
     where a.grantee not in (catalog.proowner,(select oid from pg_roles where rolname='service_role'))
      or a.grantor<>catalog.proowner or a.privilege_type<>'EXECUTE' or a.is_grantable)
   or (select count(*) from aclexplode(coalesce(catalog.proacl,acldefault('f',catalog.proowner))))<>2
   or not exists(select 1 from aclexplode(coalesce(catalog.proacl,acldefault('f',catalog.proowner))) a
     where a.grantee=catalog.proowner and a.privilege_type='EXECUTE' and not a.is_grantable)
   or not exists(select 1 from aclexplode(coalesce(catalog.proacl,acldefault('f',catalog.proowner))) a
     where a.grantee=(select oid from pg_roles where rolname='service_role') and a.privilege_type='EXECUTE' and not a.is_grantable)
   then raise exception 'native_google_rollback_authority_drift'; end if;
  -- Read the catalog directly: a changed helper cannot bless changed authority.
  select (to_jsonb(p)-array['oid','prosrc','prosqlbody'])||jsonb_build_object('qualifiedSignature',prior.signature,
   'ownerName',pg_get_userbyid(p.proowner),'languageName',l.lanname,
   'bindingTableOwner',pg_get_userbyid((select relowner from pg_class where oid='public.workspace_account_bindings'::regclass)))
   into properties from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure(prior.signature);
  if properties is distinct from prior.applied_properties then raise exception 'native_google_rollback_authority_drift'; end if;
 end loop;
 for prior in select * from public.native_google_lifecycle_prior_functions loop
  execute prior.definition;
  select p.prosrc,(to_jsonb(p)-array['oid','prosrc','prosqlbody'])||jsonb_build_object('qualifiedSignature',prior.signature,
   'ownerName',pg_get_userbyid(p.proowner),'languageName',l.lanname,
   'bindingTableOwner',pg_get_userbyid((select relowner from pg_class where oid='public.workspace_account_bindings'::regclass)))
   into restored_source,properties from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure(prior.signature);
  if encode(sha256(convert_to(restored_source,'UTF8')),'hex') is distinct from prior.prior_source_hash
   or properties is distinct from prior.prior_properties then raise exception 'native_google_rollback_restore_drift'; end if;
 end loop;
end $$;
drop trigger native_google_legacy_credential_fence on public.tenant_client_records;
drop trigger native_google_legacy_lock on public.tenant_client_records;
drop trigger native_google_location_selection_advance on public.workspace_google_locations;
drop trigger native_google_location_selection_no_truncate on public.workspace_google_locations;
drop trigger native_google_location_selection_lock on public.workspace_google_locations;
drop trigger native_google_disconnect_fence on public.workspace_account_bindings;
drop trigger native_google_disconnect_lock on public.workspace_account_bindings;
drop function public.finalize_native_google_completion(uuid,uuid,text,uuid,integer,text,jsonb);
drop function public.save_native_google_recovered_activation(uuid,uuid,text,text,integer,jsonb);
drop function public.native_google_recovery_frame(uuid,jsonb);
drop function public.finalize_native_google_undo(uuid,uuid,text,uuid,integer,text,jsonb);
drop function public.save_native_google_undo_activation(uuid,uuid,text,text,integer,jsonb);
drop function public.native_google_undo_frame(uuid,jsonb);
drop function public.verify_native_google_inverse_intent(uuid,uuid,text,jsonb,uuid,uuid,text);
drop function public.native_google_inverse_intent_matches(uuid,uuid,uuid);
drop function public.native_google_undo_owner(uuid,uuid,text);
drop function public.native_google_owner_lifecycle(uuid,text,uuid,text,jsonb);
drop function public.native_google_location_selection_advance();
drop function public.native_google_location_selection_no_truncate();
drop function public.native_google_location_selection(uuid);
drop function public.native_google_legacy_credential_fence();
drop function public.native_google_disconnect_fence();
drop function public.native_google_disconnect_lock();
drop function public.native_google_writer_predecessor(text,text,text[]);
drop function public.native_google_writer_properties(text);
drop table public.native_google_lifecycle_prior_functions;
drop table public.native_google_disconnect_receipts;
drop table public.native_google_oauth_attempts;
alter table public.workspace_account_bindings drop column location_selection_generation;
commit;
