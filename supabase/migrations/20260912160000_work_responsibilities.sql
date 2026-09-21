-- Shared continuity only. Product commands remain the mutation/approval authority.
create function public.update_work_responsibility(
  p_work_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_expected_revision integer, p_payload jsonb
) returns setof public.saved_product_work
language plpgsql security definer set search_path=public,pg_temp as $$
declare existing public.saved_product_work; next_event jsonb; prior_step jsonb; next_step jsonb; step_index integer;
begin
  if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null) then raise exception 'workspace_access_denied'; end if;
  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id for share;
  if not found then raise exception 'workspace_access_denied'; end if;
  select * into existing from public.saved_product_work where id=p_work_id and workspace_id=p_workspace_id for update;
  if not found or existing.product_id<>'operations' or existing.resource_kind<>'responsibility'
    or existing.payload->>'ownerId' is distinct from p_user_id::text then raise exception 'workspace_access_denied'; end if;
  if p_expected_revision is null or p_expected_revision<0 or p_expected_revision>=2147483647 then raise exception 'responsibility_payload_invalid'; end if;
  if existing.payload->>'revision' is distinct from p_expected_revision::text then raise exception 'responsibility_revision_conflict'; end if;
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object'
    or jsonb_typeof(p_payload->'version') is distinct from 'number' or p_payload->>'version' is distinct from '1'
    or jsonb_typeof(p_payload->'revision') is distinct from 'number' or p_payload->>'revision' is distinct from (p_expected_revision+1)::text
    or p_payload->'ownerId' is distinct from existing.payload->'ownerId'
    or p_payload->'title' is distinct from existing.payload->'title'
    or p_payload->'intent' is distinct from existing.payload->'intent'
    or (existing.payload->>'status'<>'proposed' and p_payload->'budgetId' is distinct from existing.payload->'budgetId')
    or p_payload->'createdAt' is distinct from existing.payload->'createdAt'
    or jsonb_typeof(p_payload->'updatedAt') is distinct from 'string'
    or coalesce(p_payload->>'status','') not in ('proposed','ready','running','waiting','paused','needs_attention','completed','cancelled')
    or jsonb_typeof(p_payload->'steps') is distinct from 'array'
    or jsonb_typeof(p_payload->'history') is distinct from 'array'
    or jsonb_typeof(existing.payload->'history') is distinct from 'array'
    or octet_length(p_payload::text)>1048576 then raise exception 'responsibility_payload_invalid'; end if;
  if jsonb_array_length(p_payload->'history')<>jsonb_array_length(existing.payload->'history')+1
    or jsonb_array_length(p_payload->'history')>1000
    or ((p_payload->'history') - (jsonb_array_length(p_payload->'history')-1)) is distinct from existing.payload->'history'
    or jsonb_array_length(p_payload->'steps') not between 1 and 20 then raise exception 'responsibility_payload_invalid'; end if;
  -- State can change; the exact approved operation, inputs and cost ceiling cannot.
  if (select jsonb_agg(jsonb_build_object('id',v->'id','operation',v->'operation','workId',v->'workId','input',v->'input','dependsOn',v->'dependsOn','maximumCents',v->'maximumCents','expectedUpdatedAt',v->'expectedUpdatedAt') order by n) from jsonb_array_elements(p_payload->'steps') with ordinality x(v,n))
    is distinct from
    (select jsonb_agg(jsonb_build_object('id',v->'id','operation',v->'operation','workId',v->'workId','input',v->'input','dependsOn',v->'dependsOn','maximumCents',v->'maximumCents','expectedUpdatedAt',v->'expectedUpdatedAt') order by n) from jsonb_array_elements(existing.payload->'steps') with ordinality x(v,n)) then raise exception 'responsibility_payload_invalid'; end if;
  next_event:=p_payload->'history'->(jsonb_array_length(p_payload->'history')-1);
  if next_event->>'actorId' is distinct from p_user_id::text
    or jsonb_typeof(next_event->'revision') is distinct from 'number'
    or next_event->>'revision' is distinct from (p_expected_revision+1)::text
    or coalesce(next_event->>'kind','') not in ('approve','set_budget','pause','resume','cancel','retry','reconcile','started','outcome')
    or jsonb_typeof(next_event->'at') is distinct from 'string' then raise exception 'responsibility_payload_invalid'; end if;
  begin
    perform (p_payload->>'updatedAt')::timestamptz;
    perform (next_event->>'at')::timestamptz;
    if p_payload ? 'approvedAt' then perform (p_payload->>'approvedAt')::timestamptz; end if;
  exception when invalid_datetime_format or datetime_field_overflow then raise exception 'responsibility_payload_invalid'; end;
  if existing.payload ? 'approvedAt' then
    if p_payload->'approvedAt' is distinct from existing.payload->'approvedAt'
      or p_payload->'approvedBy' is distinct from existing.payload->'approvedBy' then raise exception 'responsibility_payload_invalid'; end if;
  elsif p_payload ? 'approvedAt' then
    if next_event->>'kind'<>'approve' or p_payload->>'status'<>'ready'
      or p_payload->>'approvedBy' is distinct from p_user_id::text
      or jsonb_typeof(p_payload->'approvedAt') is distinct from 'string' then raise exception 'responsibility_payload_invalid'; end if;
  elsif p_payload->>'status' not in ('proposed','cancelled') then raise exception 'responsibility_payload_invalid'; end if;
  if existing.payload->>'status'='completed' then raise exception 'responsibility_payload_invalid'; end if;
  if existing.payload->>'status'='cancelled' and (p_payload->>'status'<>'cancelled' or next_event->>'kind'<>'outcome') then raise exception 'responsibility_payload_invalid'; end if;
  for step_index in 0..jsonb_array_length(p_payload->'steps')-1 loop
    prior_step:=existing.payload->'steps'->step_index; next_step:=p_payload->'steps'->step_index;
    if coalesce(next_step->>'status','') not in ('pending','running','waiting','completed','accepted','failed','unknown')
      or jsonb_typeof(next_step->'attempt') is distinct from 'number'
      or coalesce(next_step->>'attempt','') !~ '^[0-9]+$' then raise exception 'responsibility_payload_invalid'; end if;
    if prior_step->>'effect'='accepted' and (next_step->>'effect' is distinct from 'accepted'
      or coalesce(next_step->>'status','') not in ('accepted','completed')
      or next_step->'result' is distinct from prior_step->'result') then raise exception 'responsibility_payload_invalid'; end if;
    if prior_step->>'status'='completed' and (next_step->>'status' is distinct from 'completed'
      or next_step->'effect' is distinct from prior_step->'effect'
      or next_step->'result' is distinct from prior_step->'result') then raise exception 'responsibility_payload_invalid'; end if;
  end loop;
  return query update public.saved_product_work set payload=p_payload,title=p_payload->>'title',updated_at=clock_timestamp() where id=p_work_id returning *;
end $$;
revoke all on function public.update_work_responsibility(uuid,uuid,uuid,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.update_work_responsibility(uuid,uuid,uuid,text,integer,jsonb) to service_role;

-- A due pointer is not execution authority: native commands recheck current membership.
create function public.due_workspace_work(p_limit integer default 30)
returns table(id uuid,product_id text,user_id uuid,email text)
language sql security definer set search_path=public,pg_temp as $$
  select w.id,w.product_id,u.id,u.email from public.saved_product_work w
  join public.users u on u.id=w.created_by and u.verified_at is not null
  join public.workspace_memberships m on m.workspace_id=w.workspace_id and m.user_id=u.id
  where
    (w.product_id='operations' and w.resource_kind='responsibility' and
      (w.payload->>'status'='ready' or (w.payload->>'status'='waiting' and exists(
        select 1 from jsonb_array_elements(w.payload->'steps') s where s->>'status'='waiting' and (s->>'wakeAt')::timestamptz<=now()))))
    or (w.product_id='investigations' and w.resource_kind='investigation' and w.payload->>'status'='active' and (w.payload->>'nextRunAt')::timestamptz<=now())
    or (w.product_id='product-learning' and w.resource_kind='learning' and w.payload->>'status'='active' and (w.payload->>'nextRunAt')::timestamptz<=now())
  order by w.updated_at asc limit greatest(1,least(coalesce(p_limit,30),30));
$$;
revoke all on function public.due_workspace_work(integer) from public,anon,authenticated;
grant execute on function public.due_workspace_work(integer) to service_role;
