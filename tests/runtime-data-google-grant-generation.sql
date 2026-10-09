\set ON_ERROR_STOP on
begin;
insert into public.users(id,email,verified_at) values ('e8210000-0000-4000-8000-000000000051','generation@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values ('e8210000-0000-4000-8000-000000000052','customer','Generation fixture','e8210000-0000-4000-8000-000000000051');
insert into public.workspace_account_bindings(id,workspace_id,provider,migrated_from,status,access_token_ciphertext,updated_at)
values ('e8210000-0000-4000-8000-000000000053','e8210000-0000-4000-8000-000000000052','google','oauth','connected','enc:v1:AAAA:BBBB:CCCC','2026-10-08T00:00:00Z');
do $$ declare generation text; begin
 if has_function_privilege('anon','public.mutate_google_binding_generation(uuid,timestamptz,jsonb)','execute')
 or has_function_privilege('authenticated','public.mutate_google_binding_generation(uuid,timestamptz,jsonb)','execute')
 or not has_function_privilege('service_role','public.mutate_google_binding_generation(uuid,timestamptz,jsonb)','execute') then raise exception 'generation_acl_wrong'; end if;
 generation:=public.mutate_google_binding_generation('e8210000-0000-4000-8000-000000000053','2026-10-08T00:00:00Z','{"accessTokenCiphertext":"enc:v1:DDDD:EEEE:FFFF"}');
 begin
  perform public.mutate_google_binding_generation('e8210000-0000-4000-8000-000000000053','2026-10-08T00:00:00Z','{"status":"needs_reauth"}');
  raise exception 'stale_generation_allowed';
 exception when others then if sqlerrm <> 'account_binding_superseded_or_revoked' then raise; end if; end;
 perform public.set_workspace_account_binding_status('e8210000-0000-4000-8000-000000000053','revoked',null,null);
 begin
  perform public.mutate_google_binding_generation('e8210000-0000-4000-8000-000000000053',generation::timestamptz,'{"accessTokenCiphertext":"enc:v1:GGGG:HHHH:IIII"}');
  raise exception 'revoked_generation_allowed';
 exception when others then if sqlerrm <> 'account_binding_superseded_or_revoked' then raise; end if; end;
 if (select status <> 'revoked' or access_token_ciphertext <> 'enc:v1:DDDD:EEEE:FFFF' from public.workspace_account_bindings where id='e8210000-0000-4000-8000-000000000053') then raise exception 'revocation_changed'; end if;
 -- A distinct reconnect advances authority; old writers still cannot replace it.
 update public.workspace_account_bindings set status='connected',access_token_ciphertext='enc:v1:JJJJ:KKKK:LLLL',updated_at=clock_timestamp()+interval '1 second' where id='e8210000-0000-4000-8000-000000000053';
 begin
  perform public.mutate_google_binding_generation('e8210000-0000-4000-8000-000000000053',generation::timestamptz,'{"status":"needs_reauth"}');
  raise exception 'reconnected_generation_overwritten';
 exception when others then if sqlerrm <> 'account_binding_superseded_or_revoked' then raise; end if; end;
end $$;
rollback;
