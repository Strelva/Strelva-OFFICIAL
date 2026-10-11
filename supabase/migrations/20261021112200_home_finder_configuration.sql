begin;
set local lock_timeout='5s';
create table public.home_finder_configuration_commands (
 command_id uuid primary key, binding_id uuid not null references public.home_finder_bindings(id), actor_id uuid not null references public.users(id),
 input_digest text not null check(input_digest ~ '^[a-f0-9]{64}$'), result jsonb not null, created_at timestamptz not null default clock_timestamp()
);
alter table public.home_finder_configuration_commands enable row level security;
revoke all on public.home_finder_configuration_commands from public,anon,authenticated,service_role;
alter table public.home_finder_binding_audit drop constraint home_finder_binding_audit_action_check;
alter table public.home_finder_binding_audit add constraint home_finder_binding_audit_action_check check(action in('installed','observed','revoked','configured'));
create function public.configure_home_finder(p_user_id uuid,p_verified_email text,p_input jsonb,p_digest text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.home_finder_bindings; s public.systems; scope record; prior public.home_finder_configuration_commands; result jsonb; command uuid:=(p_input->>'commandId')::uuid;
begin
 perform public.system_command_valid(command,p_digest);
 scope:=public.system_actor_scope((p_input->>'workspaceId')::uuid,p_user_id,p_verified_email,true);
 select * into b from public.home_finder_bindings where id=(p_input->>'bindingId')::uuid and business_workspace_id=(p_input->>'workspaceId')::uuid for update;
 if not found then raise exception 'system_not_found'; end if;
 perform public.require_agency_authoring_scope(b.agency_workspace_id,b.business_workspace_id,p_user_id,p_verified_email);
 perform public.enterprise_require(b.agency_workspace_id,p_user_id,p_verified_email,true);
 s:=public.system_load(b.business_workspace_id,b.system_id,true,scope.work_ids);
 perform pg_advisory_xact_lock(hashtextextended('home-finder-config:'||command::text,0));
 select * into prior from public.home_finder_configuration_commands where command_id=command;
 if found then
  if prior.binding_id<>b.id or prior.actor_id<>p_user_id or prior.input_digest<>p_digest then raise exception 'system_command_conflict'; end if;
  return prior.result;
 end if;
 if b.status<>'active' then raise exception 'home_finder_revoked'; end if;
 if b.row_revision is distinct from (p_input->>'expectedRevision')::bigint or s.change_number is distinct from (p_input->>'expectedChange')::bigint then raise exception 'enterprise_stale'; end if;
 if (p_input->>'licenseExpiresAt')::timestamptz<=clock_timestamp() or p_input->>'approvedOrigin' !~ '^https://[^/?#@]+$'
 or char_length(btrim(p_input->>'brokerageName')) not between 1 and 160 or char_length(btrim(p_input->>'sourceName')) not between 1 and 200 or char_length(btrim(p_input->>'licenseReference')) not between 1 and 500 then raise exception 'home_finder_license_required'; end if;
 -- Changed license/configuration stops new intake and invalidates old entry generations.
 if s.lifecycle='live' then
  perform public.transition_system_lifecycle(b.business_workspace_id,p_user_id,p_verified_email,b.system_id,s.change_number,'paused');
  s:=public.system_load(b.business_workspace_id,b.system_id,true,scope.work_ids);
 end if;
 update public.home_finder_bindings set brokerage_name=p_input->>'brokerageName',approved_origin=p_input->>'approvedOrigin',license_reference=p_input->>'licenseReference',license_expires_at=(p_input->>'licenseExpiresAt')::timestamptz,source_name=p_input->>'sourceName',row_revision=row_revision+1,qualified_at=null,readiness=null where id=b.id returning * into b;
 perform public.record_system_revision(b.business_workspace_id,p_user_id,p_verified_email,b.system_id,s.change_number,
 jsonb_build_object('implementation',jsonb_build_object('kind','home_finder','ref',b.id::text),'summary','Brokerage license and display configuration updated; provider requalification required'),command,p_digest,true);
 insert into public.home_finder_binding_audit(binding_id,actor_id,action,row_revision,detail) values(b.id,p_user_id,'configured',b.row_revision,jsonb_build_object('approvedOrigin',b.approved_origin,'sourceName',b.source_name,'licenseExpiresAt',b.license_expires_at));
 result:=public.home_finder_binding_json(b);
 insert into public.home_finder_configuration_commands(command_id,binding_id,actor_id,input_digest,result) values(command,b.id,p_user_id,p_digest,result);
 return result;
end;$$;
revoke all on function public.configure_home_finder(uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.configure_home_finder(uuid,text,jsonb,text) to service_role;
create trigger home_finder_configuration_history before update or delete on public.home_finder_configuration_commands for each row execute function public.system_version_history_immutable();
create trigger home_finder_audit_history before update or delete on public.home_finder_binding_audit for each row execute function public.system_version_history_immutable();
create trigger enterprise_unit_audit_history before update or delete on public.enterprise_unit_audit for each row execute function public.system_version_history_immutable();
notify pgrst,'reload schema';
commit;
