-- Systems-on maker paths. Existing membership RPCs remain byte-for-byte intact.
set local lock_timeout = '3s';

create or replace function public.require_system_work_plan_actor(p_workspace_id uuid, p_user_id uuid, p_verified_email text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for share;
  if not found then raise exception 'workspace_access_denied'; end if;
  -- Hold active delegation and agency membership through the write, closing
  -- the revocation race as well as the direct-member removal race.
  perform 1 from public.workspace_delegations d
    join public.workspace_memberships m on m.workspace_id=d.agency_workspace_id and m.user_id=p_user_id
    where d.customer_workspace_id=p_workspace_id and d.status='active'
    for share of d, m;
  perform public.workspace_require_make_systems(p_workspace_id,p_user_id);
end;
$$;

create or replace function public.save_system_work_plan(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_title text,p_payload jsonb,p_input jsonb)
returns setof public.saved_product_work language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_system_work_plan_actor(p_workspace_id,p_user_id,p_verified_email);
  if p_payload->>'version' is distinct from '1' or p_payload->'metadata'->>'workspaceId' is distinct from p_workspace_id::text
    or p_payload->'metadata'->>'createdBy' is distinct from p_user_id::text or p_payload->'metadata'->>'revision' is distinct from '1' then
    raise exception 'work_plan_output_invalid';
  end if;
  if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  return query insert into public.saved_product_work(workspace_id,product_id,resource_kind,title,payload,input,created_by)
    values(p_workspace_id,'work_plans','plan',left(btrim(p_title),160),p_payload,p_input,p_user_id) returning *;
end;
$$;

create or replace function public.read_system_work_plan(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_work_id uuid)
returns setof public.saved_product_work language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_system_work_plan_actor(p_workspace_id,p_user_id,p_verified_email);
  return query select * from public.saved_product_work where id=p_work_id and workspace_id=p_workspace_id and product_id='work_plans' and resource_kind='plan';
end;
$$;

-- Copy the complete existing native validation, locking, exit guards and
-- idempotency transaction, changing only its actor gate. SQL checks fail if
-- the expected source definition has drifted instead of weakening validation.
do $migration$
declare definition text; signature text; legacy text; next_name text; member_gate text;
begin
  member_gate := E'  perform 1 from public.workspace_memberships\n  where workspace_id = p_workspace_id and user_id = p_user_id\n  for share;\n  if not found then raise exception ''workspace_access_denied''; end if;';
  for legacy,next_name,signature in select * from (values
    ('execute_work_plan_output','execute_system_work_plan_output','uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,jsonb,jsonb,jsonb'),
    ('read_work_plan_output','read_system_work_plan_output','uuid,uuid,uuid,text,integer,text,text,text,text'),
    ('list_work_plan_outputs','list_system_work_plan_outputs','uuid,uuid,uuid,text')
  ) definitions loop
    definition := pg_get_functiondef(('public.'||legacy||'('||signature||')')::regprocedure);
    if position(member_gate in definition)=0 then raise exception 'system_work_plan_actor_gate_drift: %',legacy; end if;
    definition := replace(definition,'FUNCTION public.'||legacy||'(','FUNCTION public.'||next_name||'(');
    definition := replace(definition,member_gate,'  perform public.require_system_work_plan_actor(p_workspace_id,p_user_id,p_verified_email);');
    if legacy='execute_work_plan_output' then
      -- The approved SQL parts gain only the business-record field types.
      definition := replace(definition,$$'text','number','boolean'$$, $$'text','number','boolean','contact','assigned_person'$$);
    end if;
    execute definition;
    execute 'revoke all on function public.'||next_name||'('||signature||') from public,anon,authenticated';
    execute 'grant execute on function public.'||next_name||'('||signature||') to service_role';
  end loop;
end;
$migration$;

revoke all on function public.require_system_work_plan_actor(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.save_system_work_plan(uuid,uuid,text,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.read_system_work_plan(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.save_system_work_plan(uuid,uuid,text,text,jsonb,jsonb) to service_role;
grant execute on function public.read_system_work_plan(uuid,uuid,text,uuid) to service_role;
