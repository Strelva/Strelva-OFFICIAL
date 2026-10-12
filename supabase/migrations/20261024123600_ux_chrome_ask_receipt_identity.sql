-- Capture Ask Request identity inside the saved record, after command hashing.
-- A display-name change must not change the idempotency digest or rewrite History.
begin;
set local lock_timeout = '3s';
create function public.ask_request_capture_identity()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare request_actor jsonb; agency_name text;
begin
  if tg_op = 'UPDATE' then
    if old.context->>'source' = 'ask_strelva' then
      new.context := new.context || jsonb_build_object('actor', old.context->'actor', 'agencyName', old.context->'agencyName');
    elsif new.context->>'source' = 'ask_strelva' then
      -- Relabelling an old request cannot manufacture its historical identity.
      new.context := new.context || jsonb_build_object('actor', null, 'agencyName', null);
    end if;
    return new;
  end if;
  if new.context->>'source' is distinct from 'ask_strelva' then return new; end if;
  request_actor := public.application_action_actor_snapshot(new.business_workspace_id, new.created_by);
  if request_actor->>'kind' = 'agency' and request_actor->>'displayName' = 'Strelva' then
    request_actor := jsonb_set(request_actor, '{displayName}', '"Strelva Agency"'::jsonb);
  end if;
  if new.provider_kind = 'agency' then
    select case when exists(select 1 from public.strelva_agency_workspace h where h.workspace_id=w.id)
      then 'Strelva Agency' else coalesce(nullif(btrim(w.agency_brand->>'displayName'), ''), w.name) end
      into agency_name from public.workspaces w where w.id=new.provider_agency_workspace_id and w.kind='agency';
  end if;
  new.context := new.context || jsonb_build_object('actor', request_actor, 'agencyName', agency_name);
  return new;
end $$;
revoke all on function public.ask_request_capture_identity() from public,anon,authenticated,service_role;
create trigger ask_request_capture_identity before insert or update on public.service_requests
for each row execute function public.ask_request_capture_identity();
commit;
