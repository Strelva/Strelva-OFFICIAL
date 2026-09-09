-- Durable, actor-bound attempts. No provider work runs inside a transaction.
create table public.workspace_operations (
 id uuid primary key,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 created_by uuid not null references public.users(id),
 product_id text not null,
 input jsonb not null,
 status text not null default 'running' check (status in ('running','ready','failed','completed')),
 lease_id uuid,
 lease_until timestamptz,
 attempts integer not null default 1,
 result jsonb,
 work_id uuid references public.saved_product_work(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index workspace_operations_pending on public.workspace_operations(workspace_id,created_by,created_at desc) where status<>'completed';
alter table public.workspace_operations enable row level security;
revoke all on public.workspace_operations from public, anon, authenticated;
grant all on public.workspace_operations to service_role;

create function public.workspace_operation(
 p_action text, p_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text,
 p_product_id text default null, p_input jsonb default null, p_lease_id uuid default null,
 p_result jsonb default null, p_resource_kind text default null, p_title text default null
) returns setof public.workspace_operations
language plpgsql security definer set search_path = public, pg_temp as $$
declare op public.workspace_operations; new_work_id uuid;
begin
 if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null)
 or not exists(select 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id) then
  raise exception 'workspace_access_denied';
 end if;
 if p_action='claim' then
  if p_product_id not in ('ai_visibility','website_audit') or p_input is null or p_lease_id is null then raise exception 'operation_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || p_user_id::text, 73));
  if not exists(select 1 from public.workspace_operations where id=p_id) and
    (select count(*) from public.workspace_operations where workspace_id=p_workspace_id and created_by=p_user_id and status<>'completed')>=100 then
    raise exception 'operation_attempt_limit';
  end if;
  insert into public.workspace_operations(id,workspace_id,created_by,product_id,input,lease_id,lease_until)
   values(p_id,p_workspace_id,p_user_id,p_product_id,p_input,p_lease_id,now()+interval '2 minutes') on conflict(id) do nothing;
 end if;
 select * into op from public.workspace_operations where id=p_id for update;
 if not found or op.workspace_id<>p_workspace_id or op.created_by<>p_user_id then raise exception 'workspace_access_denied'; end if;
 if p_action='claim' then
  if op.product_id<>p_product_id or op.input<>p_input then raise exception 'operation_input_conflict'; end if;
  if op.status='completed' or op.status='ready' or op.lease_id=p_lease_id then return next op; return; end if;
  if op.status='running' and op.lease_until>now() then raise exception 'operation_in_progress'; end if;
  if op.attempts>=3 then raise exception 'operation_attempt_limit'; end if;
  update public.workspace_operations set status='running',lease_id=p_lease_id,lease_until=now()+interval '2 minutes',attempts=attempts+1,updated_at=now() where id=p_id returning * into op;
 elsif p_action='checkpoint' then
  if op.status<>'running' or op.lease_id is distinct from p_lease_id or p_result is null then raise exception 'operation_lease_lost'; end if;
  update public.workspace_operations set status='ready',result=p_result,updated_at=now() where id=p_id returning * into op;
 elsif p_action='complete' then
  if op.status='completed' then return next op; return; end if;
  if op.status<>'ready' or p_resource_kind is null then raise exception 'operation_not_ready'; end if;
  -- Same row lock makes lost-response/concurrent retries return one saved result.
  insert into public.saved_product_work(workspace_id,product_id,resource_kind,title,payload,input,created_by)
   values(op.workspace_id,op.product_id,p_resource_kind,left(p_title,160),op.result,op.input,op.created_by) returning id into new_work_id;
  update public.workspace_operations set status='completed',work_id=new_work_id,result=null,lease_id=null,lease_until=null,updated_at=now() where id=p_id returning * into op;
 elsif p_action='fail' then
  update public.workspace_operations set status='failed',lease_until=null,updated_at=now() where id=p_id and status='running' and lease_id=p_lease_id returning * into op;
 elsif p_action<>'read' then raise exception 'operation_invalid';
 end if;
 return next op;
end $$;
revoke all on function public.workspace_operation(text,uuid,uuid,uuid,text,text,jsonb,uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.workspace_operation(text,uuid,uuid,uuid,text,text,jsonb,uuid,jsonb,text,text) to service_role;
