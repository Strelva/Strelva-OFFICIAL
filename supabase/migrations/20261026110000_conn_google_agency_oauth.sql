begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
create schema conn_google_rollback;
revoke all on schema conn_google_rollback from public,anon,authenticated,service_role;
create table conn_google_rollback.functions(signature text primary key,fingerprint text not null);
alter table conn_google_rollback.functions enable row level security;
revoke all on conn_google_rollback.functions from public,anon,authenticated,service_role;
-- A separate attempt store prevents an owner callback consuming an agency attempt.
create table public.conn_google_agency_oauth_attempts (like public.native_google_oauth_attempts including all,
 agency_workspace_id uuid not null references public.workspaces(id),
 foreign key(workspace_id) references public.workspaces(id),
 foreign key(requested_by) references public.users(id));
alter table public.conn_google_agency_oauth_attempts enable row level security;
revoke all on public.conn_google_agency_oauth_attempts from public,anon,authenticated,service_role;

create function public.conn_google_agency_oauth(p_user_id uuid,p_verified_email text,p_workspace_id uuid,p_agency_workspace_id uuid,p_action text,p_input jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.workspace_account_bindings%rowtype; o public.conn_google_agency_oauth_attempts%rowtype; saved jsonb;
begin
 if p_action not in ('begin_oauth','consume_oauth','finish_oauth','fail_oauth') or p_action is null or p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>4096 then raise exception 'conn_google_input_invalid'; end if;
 -- Lock current actor, membership, provider seat and area before committing.
 -- No agency constant or owner address is consulted. prepare permits connecting,
 -- not approval of any outside write.
 perform 1 from public.users u join public.workspace_memberships m on m.user_id=u.id
 join public.workspaces a on a.id=m.workspace_id and a.kind='agency'
 join public.provider_seats s on s.agency_workspace_id=a.id and s.customer_workspace_id=p_workspace_id and s.status='active'
 join public.agency_client_staff c on c.agency_workspace_id=a.id and c.customer_workspace_id=p_workspace_id and c.user_id=p_user_id and c.status='active'
 join public.agency_scope_grants g on g.agency_workspace_id=a.id and g.customer_workspace_id=p_workspace_id and g.scope='google' and g.status='active' and g.level in ('prepare','full_control')
 where u.id=p_user_id and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null
 and a.id=p_agency_workspace_id and m.role in ('owner','admin','member')
 and exists(select 1 from public.workspaces w where w.id=p_workspace_id and w.kind='customer')
 and not exists(select 1 from public.workspace_memberships own where own.workspace_id=p_workspace_id and own.user_id=p_user_id)
 for share of u,m,s,g,c;
 if not found then raise exception 'conn_google_agency_denied'; end if;
 perform pg_advisory_xact_lock(771904091);
 if p_action='begin_oauth' then
  if (p_input-array['id','accountId','locationId','nonceHash','stateHash'])<>'{}'::jsonb then raise exception 'native_google_input_invalid'; end if;
  update public.conn_google_agency_oauth_attempts set status='expired' where workspace_id=p_workspace_id and status in ('pending','exchanging') and expires_at<=clock_timestamp();
  select * into b from public.workspace_account_bindings where workspace_id=p_workspace_id and provider='google' and origin_tenant_stable_id is null for update;
  if found and exists(select 1 from public.workspace_google_locations l where l.binding_id=b.id and (l.account_id<>p_input->>'accountId' or l.location_id<>p_input->>'locationId')) then raise exception 'native_google_oauth_target_changed'; end if;
  insert into public.conn_google_agency_oauth_attempts(id,workspace_id,agency_workspace_id,requested_by,account_id,location_id,nonce_hash,state_hash,expected_binding_id,expected_updated_at,expected_location_generation,expected_locations,status)
  values((p_input->>'id')::uuid,p_workspace_id,p_agency_workspace_id,p_user_id,p_input->>'accountId',p_input->>'locationId',p_input->>'nonceHash',p_input->>'stateHash',b.id,b.updated_at,b.location_selection_generation,public.native_google_location_selection(b.id),'pending');
  return jsonb_build_object('id',p_input->>'id','status','pending');
 elsif p_action='fail_oauth' then
  update public.conn_google_agency_oauth_attempts set status='failed' where id=(p_input->>'id')::uuid and workspace_id=p_workspace_id and agency_workspace_id=p_agency_workspace_id and requested_by=p_user_id and status='exchanging';
  if not found then raise exception 'native_google_oauth_unavailable'; end if;
  return jsonb_build_object('status','failed');
 elsif p_action='consume_oauth' then
  if (p_input-array['id','nonceHash','stateHash'])<>'{}'::jsonb then raise exception 'native_google_input_invalid'; end if;
  select * into o from public.conn_google_agency_oauth_attempts where id=(p_input->>'id')::uuid and workspace_id=p_workspace_id and agency_workspace_id=p_agency_workspace_id and requested_by=p_user_id for update;
  if not found or o.status<>'pending' or o.expires_at<=clock_timestamp() or o.nonce_hash is distinct from p_input->>'nonceHash' or o.state_hash is distinct from p_input->>'stateHash' then raise exception 'native_google_oauth_unavailable'; end if;
  update public.conn_google_agency_oauth_attempts set status='exchanging' where id=o.id;
  return jsonb_build_object('id',o.id,'status','exchanging');
 elsif p_action='finish_oauth' then
  if (p_input-array['id','subject','scopes','accessTokenCiphertext','refreshTokenCiphertext','tokenExpiresAt'])<>'{}'::jsonb or not public.account_binding_ciphertext_valid(p_input->>'accessTokenCiphertext') or not public.account_binding_ciphertext_valid(p_input->>'refreshTokenCiphertext') then raise exception 'native_google_input_invalid'; end if;
  if exists(select 1 from unnest(array['id','subject','accessTokenCiphertext','refreshTokenCiphertext','tokenExpiresAt']) k where jsonb_typeof(p_input->k) is distinct from 'string' or coalesce(btrim(p_input->>k),'')='') or length(p_input->>'subject')>255 or jsonb_typeof(p_input->'scopes') is distinct from 'array' then raise exception 'native_google_input_invalid'; end if;
  if exists(select 1 from jsonb_array_elements(p_input->'scopes') x where jsonb_typeof(x) is distinct from 'string') or not (p_input->'scopes' @> '["openid","https://www.googleapis.com/auth/business.manage"]'::jsonb) or (p_input->>'tokenExpiresAt')::timestamptz<=clock_timestamp() or (p_input->>'tokenExpiresAt')::timestamptz>clock_timestamp()+interval '24 hours' then raise exception 'native_google_input_invalid'; end if;
  select * into o from public.conn_google_agency_oauth_attempts where id=(p_input->>'id')::uuid and workspace_id=p_workspace_id and agency_workspace_id=p_agency_workspace_id and requested_by=p_user_id for update;
  if not found or o.status<>'exchanging' or o.expires_at<=clock_timestamp() then raise exception 'native_google_oauth_unavailable'; end if;
  select * into b from public.workspace_account_bindings where workspace_id=p_workspace_id and provider='google' and origin_tenant_stable_id is null for update;
  if b.id is distinct from o.expected_binding_id or b.updated_at is distinct from o.expected_updated_at then raise exception 'native_google_grant_changed'; end if;
  if b.location_selection_generation is distinct from o.expected_location_generation or public.native_google_location_selection(b.id) is distinct from o.expected_locations then raise exception 'native_google_oauth_target_changed'; end if;
  saved:=public.upsert_workspace_account_binding(jsonb_build_object('workspaceId',p_workspace_id,'provider','google','originTenantStableId',null,'subject',p_input->>'subject','scopes',p_input->'scopes','accessTokenCiphertext',p_input->>'accessTokenCiphertext','refreshTokenCiphertext',p_input->>'refreshTokenCiphertext','tokenExpiresAt',p_input->>'tokenExpiresAt','status','connected'),'oauth');
  perform public.upsert_workspace_google_location((saved->>'id')::uuid,o.account_id,o.location_id,null);
  update public.conn_google_agency_oauth_attempts set status='finished' where id=o.id;
  return jsonb_build_object('bindingId',saved->>'id','workspaceId',p_workspace_id,'accountId',o.account_id,'locationId',o.location_id,'status','connected');
 end if;
 raise exception 'conn_google_action_invalid';
end $$;
revoke all on function public.conn_google_agency_oauth(uuid,text,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.conn_google_agency_oauth(uuid,text,uuid,uuid,text,jsonb) to service_role;
insert into conn_google_rollback.functions
select p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)||':'||p.proowner::text||':'||coalesce(p.proacl::text,''))
from pg_proc p where p.oid='public.conn_google_agency_oauth(uuid,text,uuid,uuid,text,jsonb)'::regprocedure;
notify pgrst,'reload schema';
commit;
