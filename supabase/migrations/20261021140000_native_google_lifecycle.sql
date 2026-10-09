begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
select pg_advisory_xact_lock(771904091);
-- Selection identity is independent of token refresh/health timestamps. Only
-- location mutation triggers advance this counter; change-back is still a change.
alter table public.workspace_account_bindings add column location_selection_generation bigint not null default 0 check(location_selection_generation>=0);
create table public.native_google_oauth_attempts (
 id uuid primary key, workspace_id uuid not null references public.workspaces(id), requested_by uuid not null references public.users(id),
 account_id text not null check(account_id ~ '^accounts/[A-Za-z0-9_-]{1,64}$'), location_id text not null check(location_id ~ '^[A-Za-z0-9_-]{1,64}$'),
 nonce_hash text not null check(nonce_hash ~ '^[a-f0-9]{64}$'), state_hash text not null check(state_hash ~ '^[a-f0-9]{64}$'),
 expected_binding_id uuid, expected_updated_at timestamptz,
 expected_location_generation bigint check(expected_location_generation is null or expected_location_generation>=0),
 expected_locations jsonb not null check(jsonb_typeof(expected_locations)='array' and octet_length(expected_locations::text)<=65536),
 status text not null check(status in ('pending','exchanging','finished','expired','failed')),
 expires_at timestamptz not null default clock_timestamp()+interval '10 minutes', created_at timestamptz not null default clock_timestamp()
);
create unique index native_google_oauth_one_open on public.native_google_oauth_attempts(workspace_id) where status in ('pending','exchanging');
alter table public.native_google_oauth_attempts enable row level security;
revoke all on public.native_google_oauth_attempts from public,anon,authenticated,service_role;
-- Prepared native owner lifecycle; no tenant/Redis writes, grants or provider calls.
create table public.native_google_disconnect_receipts (
 id uuid primary key, workspace_id uuid not null references public.workspaces(id),
 binding_id uuid not null references public.workspace_account_bindings(id),
 requested_by uuid not null references public.users(id), subject text not null,
 expected_updated_at timestamptz not null, account_id text not null, location_id text not null, grant_generation text not null check(grant_generation ~ '^[a-f0-9]{64}$'),
 revocation_token_ciphertext text check(public.account_binding_ciphertext_valid(revocation_token_ciphertext)), revocation_expires_at timestamptz not null,
 lease_id uuid, lease_expires_at timestamptz, attempts integer not null default 1 check(attempts between 1 and 3), status text not null check(status in ('claimed','settled')),
 remote_outcome text not null default 'not_attempted', remote_error_code text,
 credentials_purged boolean not null default false check(credentials_purged=(revocation_token_ciphertext is null)), created_at timestamptz not null default clock_timestamp(), settled_at timestamptz
);
alter table public.native_google_disconnect_receipts enable row level security;
revoke all on public.native_google_disconnect_receipts from public,anon,authenticated,service_role;
-- Prevent reconnect/token rotation/new native copies of the same Google consent
-- while the already-claimed remote revocation is unconfirmed. No replay grant.
create function public.native_google_disconnect_fence() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(771904091);
 if new.provider='google' and new.status='revoked' and (new.refresh_token_ciphertext is not null or new.access_token_ciphertext is not null) and exists(select 1 from public.native_google_disconnect_receipts r where r.binding_id=new.id) then raise exception 'native_google_revoked_credentials_refused'; end if;
 if new.provider='google' and (new.refresh_token_ciphertext is not null or new.access_token_ciphertext is not null) and exists(select 1 from public.native_google_disconnect_receipts r where (r.status='claimed' or r.remote_outcome not in ('revoked','already_revoked')) and (new.subject is null or r.subject=new.subject)) then raise exception 'native_google_disconnect_pending'; end if;
 return new;
end $$;
create function public.native_google_disconnect_lock() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin perform pg_advisory_xact_lock(771904091); return null; end $$;
create trigger native_google_disconnect_lock before insert or update or delete on public.workspace_account_bindings for each statement execute function public.native_google_disconnect_lock();
revoke all on function public.native_google_disconnect_lock() from public,anon,authenticated,service_role;
create trigger native_google_disconnect_fence before insert or update on public.workspace_account_bindings for each row execute function public.native_google_disconnect_fence();
-- Acquire admission before location tuple locks, including direct deletes and
-- binding cascades. The existing location writer also acquires it before its
-- explicit binding FOR UPDATE (archived/restored below).
create trigger native_google_location_selection_lock before insert or update or delete on public.workspace_google_locations for each statement execute function public.native_google_disconnect_lock();
create function public.native_google_location_selection_advance() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op<>'INSERT' then
  update public.workspace_account_bindings set location_selection_generation=location_selection_generation+1 where id=old.binding_id;
 end if;
 if tg_op='INSERT' or (tg_op='UPDATE' and new.binding_id is distinct from old.binding_id) then
  update public.workspace_account_bindings set location_selection_generation=location_selection_generation+1 where id=new.binding_id;
 end if;
 return null;
end $$;
create trigger native_google_location_selection_advance after insert or update or delete on public.workspace_google_locations for each row execute function public.native_google_location_selection_advance();
-- TRUNCATE takes AccessExclusive before its triggers: it cannot wait on the
-- admission lock safely. Refuse bulk clearing before it changes any selection.
create function public.native_google_location_selection_no_truncate() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'native_google_location_truncate_refused'; end $$;
create trigger native_google_location_selection_no_truncate before truncate on public.workspace_google_locations for each statement execute function public.native_google_location_selection_no_truncate();
create function public.native_google_location_selection(p_binding_id uuid) returns jsonb language sql stable set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'accountId',l.account_id,'locationId',l.location_id,'isPrimary',l.is_primary) order by l.id),'[]'::jsonb)
 from public.workspace_google_locations l where l.binding_id=p_binding_id
$$;
revoke all on function public.native_google_location_selection_advance(),public.native_google_location_selection_no_truncate(),public.native_google_location_selection(uuid) from public,anon,authenticated,service_role;
create function public.native_google_owner_lifecycle(p_user_id uuid,p_verified_email text,p_workspace_id uuid,p_action text,p_input jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.workspace_account_bindings%rowtype; r public.native_google_disconnect_receipts%rowtype; token_refresh text; token_access text; n integer; o public.native_google_oauth_attempts%rowtype; saved jsonb;
begin
 if p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>4096 then raise exception 'native_google_input_invalid'; end if;
 perform 1 from public.users u join public.workspace_memberships m on m.user_id=u.id join public.workspaces w on w.id=m.workspace_id
 where u.id=p_user_id and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null and m.workspace_id=p_workspace_id and m.role='owner' and w.kind='customer';
 if not found then raise exception 'native_google_owner_denied'; end if;
 if p_action='proof_identity' then
  if p_input<>'{}'::jsonb then raise exception 'native_google_input_invalid'; end if;
  return jsonb_build_object('system',(pg_control_system()).system_identifier::text,'database',current_database(),'address',inet_server_addr()::text,'port',inet_server_port());
 end if;
 if p_action='read_grant' then
  select * into b from public.workspace_account_bindings where id=(p_input->>'bindingId')::uuid and workspace_id=p_workspace_id and provider='google' and origin_tenant_stable_id is null;
  if not found then raise exception 'native_google_grant_unknown'; end if;
  return jsonb_build_object('bindingId',b.id,'status',b.status,'bindingCredentialsPurged',b.refresh_token_ciphertext is null and b.access_token_ciphertext is null,'credentialsPurged',b.refresh_token_ciphertext is null and b.access_token_ciphertext is null and not exists(select 1 from public.native_google_disconnect_receipts x where x.binding_id=b.id and x.revocation_token_ciphertext is not null),
   'grantGeneration',encode(digest(convert_to('['||to_jsonb(b.id)::text||','||coalesce(to_jsonb(b.subject)::text,'null')||','||coalesce(to_jsonb(b.refresh_token_ciphertext)::text,'null')||','||(public.account_binding_json(b,false)->'createdAt')::text||']','UTF8'),'sha256'),'hex'),
   'subjectDigest',case when b.subject is null then null else encode(digest(convert_to(b.subject,'UTF8'),'sha256'),'hex') end,'locations',coalesce((select jsonb_agg(jsonb_build_object('accountId',l.account_id,'locationId',l.location_id) order by l.account_id,l.location_id) from public.workspace_google_locations l where l.binding_id=b.id),'[]'::jsonb));
 end if;
 if p_action='qualify' then
  select * into b from public.workspace_account_bindings where id=(p_input->>'bindingId')::uuid and workspace_id=p_workspace_id and provider='google';
  if not found or b.origin_tenant_stable_id is not null or b.status<>'connected' or b.subject is null or exists(select 1 from public.workspace_account_bindings x where x.id<>b.id and x.provider='google' and (x.refresh_token_ciphertext is not null or x.access_token_ciphertext is not null) and (x.subject is null or x.subject=b.subject or x.origin_tenant_stable_id is not null)) then raise exception 'native_google_grant_isolation_unconfirmed'; end if;
  if exists(select 1 from public.tenant_client_records x where x.store='provider_connections' and x.record_id='google' and x.removed_at is null and (coalesce(x.payload->>'refreshToken','')<>'' or coalesce(x.payload->>'accessToken','')<>'')) then raise exception 'native_google_legacy_durable_grant_requires_review'; end if;
  return jsonb_build_object('isolated',true);
 end if;
 if p_action in ('read_disconnect','find_disconnect') then
  select * into r from public.native_google_disconnect_receipts where id=(p_input->>'commandId')::uuid and workspace_id=p_workspace_id;
  if not found then if p_action='find_disconnect' then return null; end if; raise exception 'native_google_receipt_unknown'; end if;
  if p_action='find_disconnect' and (r.binding_id is distinct from (p_input->>'bindingId')::uuid or r.account_id is distinct from p_input->>'accountId' or r.location_id is distinct from p_input->>'locationId' or r.grant_generation is distinct from p_input->>'grantGeneration') then raise exception 'native_google_disconnect_scope_changed'; end if;
  return jsonb_build_object('id',r.id,'bindingId',r.binding_id,'status',r.status,'remoteOutcome',r.remote_outcome,'remoteErrorCode',r.remote_error_code,'credentialsPurged',r.credentials_purged,'bindingCredentialsPurged',not exists(select 1 from public.workspace_account_bindings x where x.id=r.binding_id and (x.refresh_token_ciphertext is not null or x.access_token_ciphertext is not null)),'remoteRevoked',r.remote_outcome in ('revoked','already_revoked'),'retryAvailable',r.revocation_token_ciphertext is not null and r.revocation_expires_at>clock_timestamp() and r.attempts<3 and (r.status<>'claimed' or r.lease_expires_at<=clock_timestamp()),'attempts',r.attempts);
 end if;
 -- Current verified owner is locked for mutations; reads above remain lock-free.
 perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for share;
 if not found then raise exception 'native_google_owner_denied'; end if;
 perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and role='owner' for share;
 if not found then raise exception 'native_google_owner_denied'; end if;
 perform pg_advisory_xact_lock(771904091);
 if p_action='begin_oauth' then
  if (p_input-array['id','accountId','locationId','nonceHash','stateHash'])<>'{}'::jsonb then raise exception 'native_google_input_invalid'; end if;
  update public.native_google_oauth_attempts set status='expired' where workspace_id=p_workspace_id and status in ('pending','exchanging') and expires_at<=clock_timestamp();
  select * into b from public.workspace_account_bindings where workspace_id=p_workspace_id and provider='google' and origin_tenant_stable_id is null for update;
  if found and exists(select 1 from public.workspace_google_locations l where l.binding_id=b.id and (l.account_id<>p_input->>'accountId' or l.location_id<>p_input->>'locationId')) then raise exception 'native_google_oauth_target_changed'; end if;
  insert into public.native_google_oauth_attempts(id,workspace_id,requested_by,account_id,location_id,nonce_hash,state_hash,expected_binding_id,expected_updated_at,expected_location_generation,expected_locations,status)
  values((p_input->>'id')::uuid,p_workspace_id,p_user_id,p_input->>'accountId',p_input->>'locationId',p_input->>'nonceHash',p_input->>'stateHash',b.id,b.updated_at,b.location_selection_generation,public.native_google_location_selection(b.id),'pending');
  return jsonb_build_object('id',p_input->>'id','status','pending');
 elsif p_action='fail_oauth' then
  update public.native_google_oauth_attempts set status='failed' where id=(p_input->>'id')::uuid and workspace_id=p_workspace_id and requested_by=p_user_id and status='exchanging';
  if not found then raise exception 'native_google_oauth_unavailable'; end if;
  return jsonb_build_object('status','failed');
 elsif p_action='consume_oauth' then
  if (p_input-array['id','nonceHash','stateHash'])<>'{}'::jsonb then raise exception 'native_google_input_invalid'; end if;
  select * into o from public.native_google_oauth_attempts where id=(p_input->>'id')::uuid and workspace_id=p_workspace_id and requested_by=p_user_id for update;
  if not found or o.status<>'pending' or o.expires_at<=clock_timestamp() or o.nonce_hash is distinct from p_input->>'nonceHash' or o.state_hash is distinct from p_input->>'stateHash' then raise exception 'native_google_oauth_unavailable'; end if;
  update public.native_google_oauth_attempts set status='exchanging' where id=o.id;
  return jsonb_build_object('id',o.id,'status','exchanging');
 elsif p_action='finish_oauth' then
  if (p_input-array['id','subject','scopes','accessTokenCiphertext','refreshTokenCiphertext','tokenExpiresAt'])<>'{}'::jsonb or not public.account_binding_ciphertext_valid(p_input->>'accessTokenCiphertext') or not public.account_binding_ciphertext_valid(p_input->>'refreshTokenCiphertext') then raise exception 'native_google_input_invalid'; end if;
  if exists(select 1 from unnest(array['id','subject','accessTokenCiphertext','refreshTokenCiphertext','tokenExpiresAt']) k where jsonb_typeof(p_input->k) is distinct from 'string' or coalesce(btrim(p_input->>k),'')='') or length(p_input->>'subject')>255 or jsonb_typeof(p_input->'scopes') is distinct from 'array' then raise exception 'native_google_input_invalid'; end if;
  if exists(select 1 from jsonb_array_elements(p_input->'scopes') x where jsonb_typeof(x) is distinct from 'string') or not (p_input->'scopes' @> '["openid","https://www.googleapis.com/auth/business.manage"]'::jsonb) or (p_input->>'tokenExpiresAt')::timestamptz<=clock_timestamp() or (p_input->>'tokenExpiresAt')::timestamptz>clock_timestamp()+interval '24 hours' then raise exception 'native_google_input_invalid'; end if;
  select * into o from public.native_google_oauth_attempts where id=(p_input->>'id')::uuid and workspace_id=p_workspace_id and requested_by=p_user_id for update;
  if not found or o.status<>'exchanging' or o.expires_at<=clock_timestamp() then raise exception 'native_google_oauth_unavailable'; end if;
  select * into b from public.workspace_account_bindings where workspace_id=p_workspace_id and provider='google' and origin_tenant_stable_id is null for update;
  if b.id is distinct from o.expected_binding_id or b.updated_at is distinct from o.expected_updated_at then raise exception 'native_google_grant_changed'; end if;
  if b.location_selection_generation is distinct from o.expected_location_generation or public.native_google_location_selection(b.id) is distinct from o.expected_locations then raise exception 'native_google_oauth_target_changed'; end if;
  saved:=public.upsert_workspace_account_binding(jsonb_build_object('workspaceId',p_workspace_id,'provider','google','originTenantStableId',null,'subject',p_input->>'subject','scopes',p_input->'scopes','accessTokenCiphertext',p_input->>'accessTokenCiphertext','refreshTokenCiphertext',p_input->>'refreshTokenCiphertext','tokenExpiresAt',p_input->>'tokenExpiresAt','status','connected'),'oauth');
  perform public.upsert_workspace_google_location((saved->>'id')::uuid,o.account_id,o.location_id,null);
  update public.native_google_oauth_attempts set status='finished' where id=o.id;
  return jsonb_build_object('bindingId',saved->>'id','workspaceId',p_workspace_id,'accountId',o.account_id,'locationId',o.location_id,'status','connected');
 end if;
 if p_action='claim_disconnect' then
  if (p_input-array['commandId','bindingId','expectedUpdatedAt','accountId','locationId','grantGeneration'])<>'{}'::jsonb or coalesce(p_input->>'grantGeneration','') !~ '^[a-f0-9]{64}$' or coalesce(p_input->>'accountId','') !~ '^accounts/[A-Za-z0-9_-]{1,64}$' or coalesce(p_input->>'locationId','') !~ '^[A-Za-z0-9_-]{1,64}$' then raise exception 'native_google_input_invalid'; end if;
  select * into r from public.native_google_disconnect_receipts where id=(p_input->>'commandId')::uuid for update;
  if found then
   if r.workspace_id is distinct from p_workspace_id or r.binding_id is distinct from (p_input->>'bindingId')::uuid or r.account_id is distinct from p_input->>'accountId' or r.location_id is distinct from p_input->>'locationId' or r.grant_generation is distinct from p_input->>'grantGeneration' then raise exception 'native_google_disconnect_scope_changed'; end if;
   select * into b from public.workspace_account_bindings where id=r.binding_id and workspace_id=p_workspace_id and provider='google' for update;
   if not found or b.status<>'revoked' or b.subject is distinct from r.subject or b.refresh_token_ciphertext is not null or b.access_token_ciphertext is not null then raise exception 'native_google_credential_purge_unconfirmed'; end if;
   if r.remote_outcome in ('revoked','already_revoked') or r.revocation_token_ciphertext is null or r.revocation_expires_at<=clock_timestamp() or r.attempts>=3 or (r.status='claimed' and r.lease_expires_at>clock_timestamp()) then
    return public.native_google_owner_lifecycle(p_user_id,p_verified_email,p_workspace_id,'read_disconnect',jsonb_build_object('commandId',r.id))||jsonb_build_object('dispatch',false);
   end if;
   update public.native_google_disconnect_receipts set status='claimed',lease_id=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '2 minutes',attempts=attempts+1 where id=r.id returning * into r;
   return jsonb_build_object('dispatch',true,'id',r.id,'leaseId',r.lease_id,'revocationTokenCiphertext',r.revocation_token_ciphertext);
  end if;
  select * into b from public.workspace_account_bindings where id=(p_input->>'bindingId')::uuid and workspace_id=p_workspace_id and provider='google' for update;
  if not found or b.status<>'connected' or b.origin_tenant_stable_id is not null or b.subject is null or b.updated_at is distinct from (p_input->>'expectedUpdatedAt')::timestamptz or p_input->>'grantGeneration' is distinct from (public.native_google_owner_lifecycle(p_user_id,p_verified_email,p_workspace_id,'read_grant',jsonb_build_object('bindingId',b.id))->>'grantGeneration') or not exists(select 1 from public.workspace_google_locations l where l.binding_id=b.id and l.account_id=p_input->>'accountId' and l.location_id=p_input->>'locationId') then raise exception 'native_google_grant_changed'; end if;
  if exists(select 1 from public.workspace_account_bindings x where x.id<>b.id and x.provider='google' and (x.refresh_token_ciphertext is not null or x.access_token_ciphertext is not null) and (x.subject is null or x.subject=b.subject or x.origin_tenant_stable_id is not null)) then raise exception 'native_google_other_grants_require_review'; end if;
  if exists(select 1 from public.tenant_client_records x where x.store='provider_connections' and x.record_id='google' and x.removed_at is null and (coalesce(x.payload->>'refreshToken','')<>'' or coalesce(x.payload->>'accessToken','')<>'')) then raise exception 'native_google_legacy_durable_grant_requires_review'; end if;
  token_refresh:=b.refresh_token_ciphertext; token_access:=b.access_token_ciphertext;
  if token_refresh is null and token_access is null then raise exception 'native_google_no_token'; end if;
  insert into public.native_google_disconnect_receipts(id,workspace_id,binding_id,requested_by,subject,expected_updated_at,account_id,location_id,grant_generation,revocation_token_ciphertext,revocation_expires_at,lease_id,lease_expires_at,status)
  values((p_input->>'commandId')::uuid,p_workspace_id,b.id,p_user_id,b.subject,b.updated_at,p_input->>'accountId',p_input->>'locationId',p_input->>'grantGeneration',coalesce(token_refresh,token_access),clock_timestamp()+interval '24 hours',gen_random_uuid(),clock_timestamp()+interval '2 minutes','claimed') returning * into r;
  update public.workspace_account_bindings set refresh_token_ciphertext=null,access_token_ciphertext=null,token_expires_at=null,status='revoked',updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=b.id;
  return jsonb_build_object('dispatch',true,'id',r.id,'leaseId',r.lease_id,'revocationTokenCiphertext',r.revocation_token_ciphertext);
 elsif p_action='settle_disconnect' then
  if (p_input-array['commandId','leaseId','outcome','errorCode'])<>'{}'::jsonb or coalesce(p_input->>'outcome','') not in ('revoked','already_revoked','failed','partial_failure','no_token','not_attempted') then raise exception 'native_google_input_invalid'; end if;
  if p_input ? 'errorCode' and p_input->'errorCode'<>'null'::jsonb and (jsonb_typeof(p_input->'errorCode') is distinct from 'string' or coalesce(p_input->>'errorCode','') !~ '^[a-z][a-z0-9_]{0,79}$') then raise exception 'native_google_input_invalid'; end if;
  select * into r from public.native_google_disconnect_receipts where id=(p_input->>'commandId')::uuid and workspace_id=p_workspace_id for update;
  if not found or r.status<>'claimed' or r.lease_id is distinct from (p_input->>'leaseId')::uuid then raise exception 'native_google_receipt_not_claimed'; end if;
  if exists(select 1 from public.workspace_account_bindings where id=r.binding_id and (status<>'revoked' or refresh_token_ciphertext is not null or access_token_ciphertext is not null)) then raise exception 'native_google_credential_purge_unconfirmed'; end if;
  update public.native_google_disconnect_receipts set status='settled',remote_outcome=p_input->>'outcome',remote_error_code=left(p_input->>'errorCode',80),settled_at=clock_timestamp(),lease_id=null,lease_expires_at=null,
   revocation_token_ciphertext=case when p_input->>'outcome' in ('revoked','already_revoked') then null else revocation_token_ciphertext end,
   credentials_purged=p_input->>'outcome' in ('revoked','already_revoked') where id=r.id;
  return public.native_google_owner_lifecycle(p_user_id,p_verified_email,p_workspace_id,'read_disconnect',jsonb_build_object('commandId',r.id));
 elsif p_action='purge' then
  if p_input<>'{}'::jsonb then raise exception 'native_google_input_invalid'; end if;
  update public.native_google_disconnect_receipts set revocation_token_ciphertext=null,credentials_purged=true where workspace_id=p_workspace_id and revocation_token_ciphertext is not null and revocation_expires_at<=clock_timestamp() and (lease_expires_at is null or lease_expires_at<=clock_timestamp());
  delete from public.google_listing_receipt_payloads where workspace_id=p_workspace_id and expires_at<=clock_timestamp(); get diagnostics n=row_count;
  return jsonb_build_object('workspaceId',p_workspace_id,'purged',n,'expiredRemaining',(select count(*) from public.google_listing_receipt_payloads where workspace_id=p_workspace_id and expires_at<=clock_timestamp()));
 end if;
 raise exception 'native_google_action_invalid';
end $$;
revoke all on function public.native_google_disconnect_fence() from public,anon,authenticated,service_role;
revoke all on function public.native_google_owner_lifecycle(uuid,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.native_google_owner_lifecycle(uuid,text,uuid,text,jsonb) to service_role;

-- The one existing location writer obtains a binding row lock explicitly.
-- Acquire the same admission lock first, preserving its complete prior body.
create function public.native_google_writer_properties(p_signature text) returns jsonb language sql stable set search_path=public,pg_temp as $$
 select (to_jsonb(p)-array['oid','prosrc','prosqlbody']) || jsonb_build_object('qualifiedSignature',p_signature,
  'ownerName',pg_get_userbyid(p.proowner),'languageName',l.lanname,
  'bindingTableOwner',pg_get_userbyid((select relowner from pg_class where oid='public.workspace_account_bindings'::regclass)))
 from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure(p_signature)
$$;
create function public.native_google_writer_predecessor(p_signature text,p_expected_source text,p_argument_names text[]) returns void language plpgsql set search_path=public,pg_temp as $$
declare p pg_proc%rowtype;
begin
 select * into p from pg_proc where oid=to_regprocedure(p_signature);
 if not found then raise exception 'native_google_writer_predecessor_drift'; end if;
 if p.prosrc is distinct from p_expected_source or p.proowner is distinct from (select relowner from pg_class where oid='public.workspace_account_bindings'::regclass)
  or (select lanname from pg_language where oid=p.prolang) is distinct from 'plpgsql'
  or p.prokind<>'f' or not p.prosecdef or p.proisstrict or p.proleakproof or p.proretset
  or p.provolatile<>'v' or p.proparallel<>'u' or p.prosupport<>0 or p.provariadic<>0
  or p.procost<>100 or p.prorows<>0 or p.probin is not null or p.prosqlbody is not null
  or p.prorettype<>'jsonb'::regtype or p.proargnames is distinct from p_argument_names
  or p.proallargtypes is not null or p.proargmodes is not null or p.pronargdefaults<>0
  or p.proconfig is distinct from array['search_path=public, pg_temp']::text[] then raise exception 'native_google_writer_predecessor_drift'; end if;
 -- Role names are deployment-owned. The table owner must own the function;
 -- only that owner and the explicit service role may execute, with no grant
 -- option to the service role and no PUBLIC/default or extra-role privileges.
 if exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   where a.grantee not in (p.proowner,(select oid from pg_roles where rolname='service_role'))
    or a.grantor<>p.proowner or a.privilege_type<>'EXECUTE' or a.is_grantable)
  or (select count(*) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))))<>2
  or not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   where a.grantee=p.proowner and a.privilege_type='EXECUTE' and not a.is_grantable)
  or not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   where a.grantee=(select oid from pg_roles where rolname='service_role') and a.privilege_type='EXECUTE' and not a.is_grantable)
  then raise exception 'native_google_writer_predecessor_acl_drift'; end if;
end $$;
revoke all on function public.native_google_writer_properties(text),public.native_google_writer_predecessor(text,text,text[]) from public,anon,authenticated,service_role;
create table public.native_google_lifecycle_prior_functions(signature text primary key,definition text not null,
 prior_definition_hash text not null check(prior_definition_hash ~ '^[a-f0-9]{64}$'),
 prior_source_hash text not null check(prior_source_hash ~ '^[a-f0-9]{64}$'),prior_properties jsonb not null,
 applied_hash text check(applied_hash is null or applied_hash ~ '^[a-f0-9]{64}$'),applied_properties jsonb);
revoke all on public.native_google_lifecycle_prior_functions from public,anon,authenticated,service_role;
DO $$ declare definition text; marker text := '  select * into v_binding from public.workspace_account_bindings where id = p_binding_id for update;'; writer_signature text := 'public.upsert_workspace_google_location(uuid,text,text,text)';
 expected_source text := $historical_writer$
declare v_binding public.workspace_account_bindings%rowtype; v_id uuid;
begin
  select * into v_binding from public.workspace_account_bindings where id = p_binding_id for update;
  if not found then raise exception 'account_binding_not_found'; end if;
  if p_account_id is null or p_account_id !~ '^accounts/[A-Za-z0-9_-]{1,64}$'
    or p_location_id is null or p_location_id !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'account_binding_invalid';
  end if;
  update public.workspace_google_locations set is_primary = false, updated_at = clock_timestamp()
    where binding_id = p_binding_id and location_id <> p_location_id and is_primary;
  insert into public.workspace_google_locations(workspace_id, binding_id, account_id, location_id, title, is_primary)
  values (v_binding.workspace_id, p_binding_id, p_account_id, p_location_id, nullif(btrim(left(p_title, 200)), ''), true)
  on conflict (binding_id, location_id) do update set account_id = excluded.account_id,
    title = coalesce(excluded.title, workspace_google_locations.title), is_primary = true, updated_at = clock_timestamp()
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'bindingId', p_binding_id, 'workspaceId', v_binding.workspace_id);
end;
$historical_writer$; begin
 perform public.native_google_writer_predecessor(writer_signature,expected_source,array['p_binding_id','p_account_id','p_location_id','p_title']);
 definition:=pg_get_functiondef(to_regprocedure(writer_signature));
 if definition is null or strpos(definition,marker)=0 then raise exception 'native_google_location_writer_source_changed'; end if;
 insert into public.native_google_lifecycle_prior_functions(signature,definition,prior_definition_hash,prior_source_hash,prior_properties)
  values(writer_signature,definition,encode(sha256(convert_to(definition,'UTF8')),'hex'),encode(sha256(convert_to(expected_source,'UTF8')),'hex'),public.native_google_writer_properties(writer_signature));
 execute replace(definition,marker,'  perform pg_advisory_xact_lock(771904091);' || chr(10) || marker);
 update public.native_google_lifecycle_prior_functions set applied_hash=encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(writer_signature)),'UTF8')),'hex'),
  applied_properties=public.native_google_writer_properties(writer_signature) where native_google_lifecycle_prior_functions.signature=writer_signature;
 if exists(select 1 from public.native_google_lifecycle_prior_functions where signature=writer_signature and applied_properties is distinct from prior_properties) then raise exception 'native_google_writer_authority_changed'; end if;
end $$;
DO $$ declare definition text; marker text := '  perform pg_advisory_xact_lock(hashtextextended(v_workspace::text || ' || quote_literal(':google:') || ' || coalesce(v_tenant::text, ' || quote_literal('-') || '), 9107));'; writer_signature text := 'public.upsert_workspace_account_binding(jsonb,text)';
 expected_source text := $historical_writer$
declare
  v_workspace uuid;
  v_tenant uuid;
  v_linked uuid;
  v_scopes text[];
  v_existing public.workspace_account_bindings%rowtype;
  v_row public.workspace_account_bindings%rowtype;
begin
  if p_mode is null or p_mode not in ('copy', 'oauth') then raise exception 'account_binding_invalid'; end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or (p_input - array['workspaceId','provider','originTenantStableId','subject','scopes','refreshTokenCiphertext',
      'accessTokenCiphertext','tokenExpiresAt','status','lastError']::text[]) <> '{}'::jsonb
    or p_input->>'provider' is distinct from 'google'
    or jsonb_typeof(p_input->'workspaceId') is distinct from 'string'
    or (p_input ? 'scopes' and jsonb_typeof(p_input->'scopes') not in ('array', 'null'))
    or (p_input->>'status') not in ('connected', 'needs_reauth', 'revoked', 'error') then
    raise exception 'account_binding_invalid';
  end if;
  if not public.account_binding_ciphertext_valid(p_input->>'refreshTokenCiphertext')
    or not public.account_binding_ciphertext_valid(p_input->>'accessTokenCiphertext') then
    raise exception 'account_binding_plaintext_refused';
  end if;
  begin
    v_workspace := (p_input->>'workspaceId')::uuid;
    v_tenant := (p_input->>'originTenantStableId')::uuid;
  exception when others then
    raise exception 'account_binding_invalid';
  end;
  if not exists (select 1 from public.workspaces w where w.id = v_workspace and w.kind = 'customer') then
    raise exception 'account_binding_workspace_unknown';
  end if;
  if v_tenant is not null then
    select workspace_id into v_linked from public.tenant_workspace_links where tenant_stable_id = v_tenant;
    if v_linked is distinct from v_workspace then raise exception 'account_binding_tenant_not_linked'; end if;
  end if;
  if jsonb_typeof(p_input->'scopes') = 'array' then
    select coalesce(array_agg(value order by ordinality), '{}') into v_scopes
      from jsonb_array_elements_text(p_input->'scopes') with ordinality;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_workspace::text || ':google:' || coalesce(v_tenant::text, '-'), 9107));
  select * into v_existing from public.workspace_account_bindings
    where workspace_id = v_workspace and provider = 'google' and origin_tenant_stable_id is not distinct from v_tenant;
  if found and p_mode = 'copy' then
    return jsonb_build_object('status', 'exists', 'id', v_existing.id);
  end if;
  if found then
    update public.workspace_account_bindings set
      subject = coalesce(p_input->>'subject', subject),
      scopes = v_scopes,
      refresh_token_ciphertext = coalesce(p_input->>'refreshTokenCiphertext', refresh_token_ciphertext),
      access_token_ciphertext = p_input->>'accessTokenCiphertext',
      token_expires_at = (p_input->>'tokenExpiresAt')::timestamptz,
      status = p_input->>'status',
      last_error = left(p_input->>'lastError', 500),
      last_checked_at = clock_timestamp(),
      updated_at = clock_timestamp()
    where id = v_existing.id returning * into v_row;
    return jsonb_build_object('status', 'updated', 'id', v_row.id);
  end if;
  insert into public.workspace_account_bindings(workspace_id, provider, subject, origin_tenant_stable_id, scopes,
    refresh_token_ciphertext, access_token_ciphertext, token_expires_at, status, last_error, migrated_from)
  values (v_workspace, 'google', p_input->>'subject', v_tenant, v_scopes,
    p_input->>'refreshTokenCiphertext', p_input->>'accessTokenCiphertext', (p_input->>'tokenExpiresAt')::timestamptz,
    p_input->>'status', left(p_input->>'lastError', 500), case when p_mode = 'copy' then 'redis' else 'oauth' end)
  returning * into v_row;
  return jsonb_build_object('status', 'created', 'id', v_row.id);
end;
$historical_writer$; begin
 perform public.native_google_writer_predecessor(writer_signature,expected_source,array['p_input','p_mode']);
 definition:=pg_get_functiondef(to_regprocedure(writer_signature));
 if definition is null or strpos(definition,marker)=0 then raise exception 'native_google_binding_writer_source_changed'; end if;
 insert into public.native_google_lifecycle_prior_functions(signature,definition,prior_definition_hash,prior_source_hash,prior_properties)
  values(writer_signature,definition,encode(sha256(convert_to(definition,'UTF8')),'hex'),encode(sha256(convert_to(expected_source,'UTF8')),'hex'),public.native_google_writer_properties(writer_signature));
 execute replace(definition,marker,'  perform pg_advisory_xact_lock(771904091);' || chr(10) || marker);
 update public.native_google_lifecycle_prior_functions set applied_hash=encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(writer_signature)),'UTF8')),'hex'),
  applied_properties=public.native_google_writer_properties(writer_signature) where native_google_lifecycle_prior_functions.signature=writer_signature;
 if exists(select 1 from public.native_google_lifecycle_prior_functions where signature=writer_signature and applied_properties is distinct from prior_properties) then raise exception 'native_google_writer_authority_changed'; end if;
end $$;
create function public.native_google_legacy_credential_fence() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin
 if new.store='provider_connections' and new.record_id='google' and new.removed_at is null and (coalesce(new.payload->>'refreshToken','')<>'' or coalesce(new.payload->>'accessToken','')<>'') and exists(select 1 from public.native_google_disconnect_receipts r where r.status='claimed' or r.remote_outcome not in ('revoked','already_revoked')) then raise exception 'native_google_disconnect_pending'; end if;
 return new;
end $$;
create trigger native_google_legacy_lock before insert or update on public.tenant_client_records for each statement execute function public.native_google_disconnect_lock();
create trigger native_google_legacy_credential_fence before insert or update on public.tenant_client_records for each row execute function public.native_google_legacy_credential_fence();
revoke all on function public.native_google_legacy_credential_fence() from public,anon,authenticated,service_role;
-- Completed native Google undo has two narrow writers. Historical closed-state
-- RPCs stay closed; neither writer can approve, replay or progress a plan.
create function public.native_google_undo_owner(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(771904091);
 if p_workspace_id is null or p_user_id is null or coalesce(btrim(p_verified_email),'')='' then raise exception 'native_google_owner_denied'; end if;
 perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for share;
 if not found then raise exception 'native_google_owner_denied'; end if;
 perform 1 from public.workspace_memberships m join public.workspaces w on w.id=m.workspace_id
  where m.workspace_id=p_workspace_id and m.user_id=p_user_id and m.role='owner' and w.kind='customer' for share of m,w;
 if not found then raise exception 'native_google_owner_denied'; end if;
end $$;

-- Provider receipts use the original PostgreSQL jsonb::text digest encoding.
-- This private validator never substitutes a TypeScript/memory-store digest.
create function public.native_google_inverse_intent_matches(p_workspace_id uuid,p_original_id uuid,p_inverse_id uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare original public.google_listing_receipts%rowtype; inverse public.google_listing_receipts%rowtype; original_json jsonb; inverse_json jsonb; undo jsonb; inverse_action text; inverse_after jsonb; expected_intent text;
begin
 -- Historical settlement takes inverse then original; preserve that order.
 select * into inverse from public.google_listing_receipts where id=p_inverse_id and workspace_id=p_workspace_id for share;
 select * into original from public.google_listing_receipts where id=p_original_id and workspace_id=p_workspace_id for share;
 if original.id is null or inverse.id is null or inverse.undoes_receipt_id is distinct from original.id
  or inverse.binding_id is distinct from original.binding_id or inverse.location_id is distinct from original.location_id
  or inverse.target_ref is distinct from original.target_ref or inverse.authority->>'kind' is distinct from 'owner_undo'
  or coalesce(inverse.authority->>'actor','')='' or inverse.idempotency_key is distinct from 'undo:'||original.id::text then return false; end if;
 original_json:=public.google_listing_receipt_json(original);inverse_json:=public.google_listing_receipt_json(inverse);undo:=original_json->'undo';
 if jsonb_typeof(undo) is distinct from 'object' or coalesce(undo->>'kind','') not in ('delete_post','delete_reply','restore_reply','patch_snapshot')
  or original_json->>'providerPayloadExpired' is distinct from 'false' or inverse_json->>'providerPayloadExpired' is distinct from 'false' then return false; end if;
 inverse_action:=case undo->>'kind' when 'delete_post' then 'post_delete' when 'delete_reply' then 'reply_delete' when 'restore_reply' then 'reply_update' else original.action end;
 inverse_after:=case undo->>'kind' when 'delete_post' then 'null'::jsonb when 'delete_reply' then jsonb_build_object('reply',null) when 'restore_reply' then jsonb_build_object('reply',undo->'previous') else undo->'snapshot' end;
 -- Exactly the metadata-stripped p_input used by record_google_listing_receipt.
 expected_intent:=encode(sha256(convert_to(jsonb_build_object('workspaceId',p_workspace_id,'bindingId',original.binding_id,
  'locationId',original.location_id,'action',inverse_action,'targetRef',original.target_ref,'authority',inverse.authority,'before',original_json->'after','after',inverse_after,'undoesReceiptId',original.id)::text,'UTF8')),'hex');
 return inverse.action is not distinct from inverse_action and inverse.intent_digest is not distinct from expected_intent;
end $$;
create function public.verify_native_google_inverse_intent(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_request jsonb,p_original_id uuid,p_inverse_id uuid,p_service_actor text default null) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare binding public.workspace_account_bindings%rowtype; original public.google_listing_receipts%rowtype; service_parts text[]; service_checked jsonb;
begin
 perform pg_advisory_xact_lock(771904091);
 if p_service_actor is null then perform public.native_google_undo_owner(p_workspace_id,p_user_id,p_verified_email);
 else
  service_parts:=regexp_match(p_service_actor,'^make-real-service:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$');
  if service_parts is null then return false; end if;
  perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for share;
  if not found then return false; end if;
  service_checked:=public.check_google_make_real_service_authority(p_workspace_id,service_parts[1]::uuid,service_parts[2]::uuid,p_request,'undo',null,null);
  if service_checked->>'userId' is distinct from p_user_id::text or lower(service_checked->>'verifiedEmail') is distinct from lower(btrim(p_verified_email))
   or service_checked->>'bindingId' is distinct from p_request->'nativeGrant'->>'bindingId' then return false; end if;
 end if;
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>4096 or p_request->>'tenantId' is distinct from 'workspace-'||p_workspace_id::text
  or (p_request-array['tenantId','locationId','eventId','draftDigest','nativeGrant'])<>'{}'::jsonb
  or jsonb_typeof(p_request->'tenantId') is distinct from 'string' or jsonb_typeof(p_request->'locationId') is distinct from 'string'
  or coalesce(p_request->>'locationId','') !~ '^[A-Za-z0-9_-]{1,64}$' or jsonb_typeof(p_request->'eventId') is distinct from 'string'
  or coalesce(p_request->>'eventId','')='' or length(p_request->>'eventId')>200 or jsonb_typeof(p_request->'draftDigest') is distinct from 'string' or coalesce(p_request->>'draftDigest','') !~ '^[a-f0-9]{64}$'
  or jsonb_typeof(p_request->'nativeGrant') is distinct from 'object'
  or ((p_request->'nativeGrant')-array['bindingId','accountId','grantGeneration'])<>'{}'::jsonb
  or exists(select 1 from unnest(array['bindingId','accountId','grantGeneration']) k where jsonb_typeof(p_request->'nativeGrant'->k) is distinct from 'string')
  or coalesce(p_request->'nativeGrant'->>'bindingId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or coalesce(p_request->'nativeGrant'->>'accountId','') !~ '^accounts/[A-Za-z0-9_-]{1,64}$'
  or coalesce(p_request->'nativeGrant'->>'grantGeneration','') !~ '^[a-f0-9]{64}$' then return false; end if;
 if not exists(select 1 from public.system_possibilities p where p.business_workspace_id=p_workspace_id and p.status in ('ready','made_real')
  and p.activation_id is not null and jsonb_typeof(p.body->'effects')='array' and jsonb_array_length(p.body->'effects')=1
  and p.body->'effects'->0->>'channel'='google_listing' and p.body->'effects'->0->>'kind'='publish' and p.body->'effects'->0->'request'=p_request) then return false; end if;
 select * into binding from public.workspace_account_bindings where workspace_id=p_workspace_id and id=(p_request->'nativeGrant'->>'bindingId')::uuid and provider='google' and origin_tenant_stable_id is null for share;
 if not found or binding.status is distinct from 'connected' or binding.subject is null or binding.refresh_token_ciphertext is null
  or ('https://www.googleapis.com/auth/business.manage'=any(binding.scopes)) is not true
  or encode(digest(convert_to('['||to_jsonb(binding.id)::text||','||coalesce(to_jsonb(binding.subject)::text,'null')||','||coalesce(to_jsonb(binding.refresh_token_ciphertext)::text,'null')||','||(public.account_binding_json(binding,false)->'createdAt')::text||']','UTF8'),'sha256'),'hex') is distinct from p_request->'nativeGrant'->>'grantGeneration'
  or not exists(select 1 from public.workspace_google_locations l where l.binding_id=binding.id and l.account_id=p_request->'nativeGrant'->>'accountId' and l.location_id=p_request->>'locationId') then return false; end if;
 select * into original from public.google_listing_receipts where id=p_original_id and workspace_id=p_workspace_id;
 if not found or original.binding_id is distinct from binding.id or original.location_id is distinct from p_request->>'locationId'
  or original.authority->>'kind' is distinct from 'owner_approval' or original.authority->>'approvalRef' is distinct from p_request->>'eventId'
  or original.idempotency_key is distinct from 'google-draft:'||(p_request->>'eventId') then return false; end if;
 if p_service_actor is not null and not exists(select 1 from public.google_listing_receipts r where r.id=p_inverse_id and r.workspace_id=p_workspace_id
  and r.authority->>'kind'='owner_undo' and r.authority->>'actor'=p_service_actor) then return false; end if;
 return public.native_google_inverse_intent_matches(p_workspace_id,p_original_id,p_inverse_id);
end $$;
revoke all on function public.native_google_inverse_intent_matches(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.verify_native_google_inverse_intent(uuid,uuid,text,jsonb,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.verify_native_google_inverse_intent(uuid,uuid,text,jsonb,uuid,uuid,text) to service_role;

create function public.native_google_undo_frame(p_workspace_id uuid,p_activation jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare plan public.system_possibilities%rowtype; effect jsonb; step jsonb; ref jsonb; request jsonb; canonical text; original public.google_listing_receipts%rowtype; inverse public.google_listing_receipts%rowtype;
begin
 select * into plan from public.system_possibilities where business_workspace_id=p_workspace_id and id=(p_activation->>'possibilityId')::uuid for update;
 if not found or plan.status is distinct from 'made_real' or plan.activation_id is distinct from p_activation->>'id'
  or plan.body->>'status' is distinct from 'made_real' or plan.body->>'activationId' is distinct from plan.activation_id
  or plan.candidate_revision::text is distinct from p_activation->>'candidateRevision'
  or plan.body->>'candidateRevision' is distinct from p_activation->>'candidateRevision'
  or public.make_real_activation_shape_valid(p_activation,p_workspace_id) is not true
  or jsonb_typeof(plan.body->'effects') is distinct from 'array' or jsonb_array_length(plan.body->'effects')<>1 then raise exception 'native_google_undo_plan_invalid'; end if;
 effect:=plan.body->'effects'->0; request:=effect->'request';
 if effect->>'channel' is distinct from 'google_listing' or effect->>'kind' is distinct from 'publish'
  or jsonb_typeof(request) is distinct from 'object' or (request-array['tenantId','locationId','eventId','draftDigest','nativeGrant'])<>'{}'::jsonb
  or request->>'tenantId' is distinct from 'workspace-'||p_workspace_id::text
  or coalesce(request->>'locationId','') !~ '^[A-Za-z0-9_-]{1,64}$'
  or coalesce(request->>'eventId','')='' or length(request->>'eventId')>200
  or coalesce(request->>'draftDigest','') !~ '^[a-f0-9]{64}$'
  or jsonb_typeof(request->'nativeGrant') is distinct from 'object'
  or ((request->'nativeGrant')-array['bindingId','accountId','grantGeneration'])<>'{}'::jsonb
  or coalesce(request->'nativeGrant'->>'bindingId','') !~ '^[0-9a-f-]{36}$'
  or coalesce(request->'nativeGrant'->>'accountId','') !~ '^accounts/[A-Za-z0-9_-]{1,64}$'
  or coalesce(request->'nativeGrant'->>'grantGeneration','') !~ '^[a-f0-9]{64}$' then raise exception 'native_google_undo_plan_invalid'; end if;
 -- Every declared preparation, live pointer and connection remains represented.
 if exists(with expected as (
  select 'stage:'||(c->'baseline'->>'systemId') id,'stage' kind,c->'baseline'->>'systemId' target from jsonb_array_elements(plan.body->'changes') c
  union all select 'activate:'||(c->'baseline'->>'systemId'),'activate',c->'baseline'->>'systemId' from jsonb_array_elements(plan.body->'changes') c
  union all select 'introduce:'||(c->>'key'),'introduce','introduced:'||(c->>'key') from jsonb_array_elements(plan.body->'introduces') c
  union all select 'activate:introduced:'||(c->>'key'),'activate','introduced:'||(c->>'key') from jsonb_array_elements(plan.body->'introduces') c
  union all select 'connect:'||(c->>'id'),'connect',c->>'id' from jsonb_array_elements(plan.body->'connections') c
  union all select 'effect:'||(effect->>'id'),'effect',effect->>'id'
  union all select 'verify','verify',plan.id::text
 ), actual as (select s->>'id' id,s->>'kind' kind,s->>'target' target from jsonb_array_elements(p_activation->'steps') s)
 select 1 from expected full join actual using(id,kind,target) where expected.id is null or actual.id is null)
 or jsonb_array_length(p_activation->'steps')<>2*jsonb_array_length(plan.body->'changes')+2*jsonb_array_length(plan.body->'introduces')+jsonb_array_length(plan.body->'connections')+2 then raise exception 'native_google_undo_plan_invalid'; end if;
 select s into step from jsonb_array_elements(p_activation->'steps') s where s->>'kind'='effect' and s->>'target'=effect->>'id';
 if step->>'effect' is distinct from 'accepted' or step->>'reversibility' is distinct from 'compensable'
  or step->>'effectKind' is distinct from 'publish' or step->'receipt'->>'adapterMode' is distinct from 'live'
  or coalesce(step->'receipt'->>'providerRef','')='' then raise exception 'native_google_undo_receipt_invalid'; end if;
 begin ref:=(step->'receipt'->>'providerRef')::jsonb;
 exception when others then raise exception 'native_google_undo_receipt_invalid'; end;
 if jsonb_typeof(ref) is distinct from 'object' or (ref-array['businessId','request','receiptId'])<>'{}'::jsonb
  or ref->>'businessId' is distinct from p_workspace_id::text or ref->'request' is distinct from request
  or coalesce(ref->>'receiptId','') !~ '^[0-9a-f-]{36}$' then raise exception 'native_google_undo_receipt_invalid'; end if;
 canonical:=format('{"businessId":%s,"request":{"tenantId":%s,"locationId":%s,"eventId":%s,"draftDigest":%s,"nativeGrant":{"bindingId":%s,"accountId":%s,"grantGeneration":%s}},"receiptId":%s}',
  to_json(ref->>'businessId'),to_json(request->>'tenantId'),to_json(request->>'locationId'),to_json(request->>'eventId'),to_json(request->>'draftDigest'),
  to_json(request->'nativeGrant'->>'bindingId'),to_json(request->'nativeGrant'->>'accountId'),to_json(request->'nativeGrant'->>'grantGeneration'),to_json(ref->>'receiptId'));
 if step->'receipt'->>'providerRef' is distinct from canonical then raise exception 'native_google_undo_receipt_invalid'; end if;
 select * into original from public.google_listing_receipts where id=(ref->>'receiptId')::uuid and workspace_id=p_workspace_id;
 if not found or original.binding_id is distinct from (request->'nativeGrant'->>'bindingId')::uuid
  or original.location_id is distinct from request->>'locationId' or original.authority->>'kind' is distinct from 'owner_approval'
  or original.authority->>'approvalRef' is distinct from request->>'eventId' or original.idempotency_key is distinct from 'google-draft:'||(request->>'eventId')
  or original.status not in ('posted','posted_unverified','held_by_google','undone') or original.intent_digest is null
  or not exists(select 1 from jsonb_array_elements(p_activation->'approvals') a where a->>'effectId'=effect->>'id'
   and (not (step->'receipt' ? 'approvalId') or a->>'approvalId'=step->'receipt'->>'approvalId') and public.make_real_activation_is_time(a->'consumedAt')) then raise exception 'native_google_undo_receipt_invalid'; end if;
 if step->>'status'='compensated' then
  -- Settlement owns inverse then original; use that order even on a terminal
  -- checkpoint, and recheck the link after both locks are acquired.
  select * into inverse from public.google_listing_receipts where id=original.undone_by_receipt_id and workspace_id=p_workspace_id for share;
  select * into original from public.google_listing_receipts where id=(ref->>'receiptId')::uuid and workspace_id=p_workspace_id for share;
  if original.status is distinct from 'undone' or step->'compensation'->>'status' is distinct from 'compensated'
   or inverse.id is null or original.undone_by_receipt_id is distinct from inverse.id or inverse.undoes_receipt_id is distinct from original.id or inverse.binding_id is distinct from original.binding_id
   or inverse.location_id is distinct from original.location_id or inverse.target_ref is distinct from original.target_ref
   or inverse.authority->>'kind' is distinct from 'owner_undo' or coalesce(inverse.authority->>'actor','')=''
   or inverse.status is distinct from 'posted' or inverse.readback is distinct from 'matched' or inverse.intent_digest is null
   or inverse.idempotency_key is distinct from 'undo:'||original.id::text then raise exception 'native_google_undo_inverse_unconfirmed'; end if;
  if public.native_google_inverse_intent_matches(p_workspace_id,original.id,inverse.id) is not true then raise exception 'native_google_undo_inverse_unconfirmed'; end if;
 end if;
 -- A restored bookkeeping checkpoint must describe actual restored pointers.
 for step in select value from jsonb_array_elements(p_activation->'steps') where value->>'status'='restored' loop
  if step->>'kind'='activate' then
   if step->>'target' like 'introduced:%' then
    if not exists(select 1 from jsonb_array_elements(p_activation->'introduced') i join public.systems s on s.id=(i->>'systemId')::uuid
      where i->>'key'=substr(step->>'target',12) and s.business_workspace_id=p_workspace_id and s.lifecycle='paused'
        and s.current_revision_id::text=i->>'revisionId') then raise exception 'native_google_undo_restoration_unconfirmed'; end if;
   elsif not exists(select 1 from jsonb_array_elements(p_activation->'pinned') i join public.systems s on s.id=(i->>'systemId')::uuid
      where i->>'systemId'=step->>'target' and s.business_workspace_id=p_workspace_id and s.current_revision_id::text=i->>'baselineRevisionId') then raise exception 'native_google_undo_restoration_unconfirmed'; end if;
  elsif step->>'kind'='connect' and not exists(select 1 from jsonb_array_elements(p_activation->'connections') c join public.system_connections s on s.id=(c->>'connectionId')::uuid
    where c->>'id'=step->>'target' and s.business_workspace_id=p_workspace_id and s.state='disconnected') then raise exception 'native_google_undo_restoration_unconfirmed'; end if;
 end loop;
 return plan.body;
end $$;

create function public.save_native_google_undo_activation(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_activation_id text,
  p_expected_revision integer, p_activation jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing public.saved_product_work;
  prior jsonb; p jsonb := p_activation; event jsonb; event_kind text;
  prior_step jsonb; next_step jsonb; i integer; old_len integer; saved jsonb;
begin
  perform public.native_google_undo_owner(p_workspace_id,p_user_id,p_verified_email);
  select * into existing from public.saved_product_work
    where workspace_id = p_workspace_id and product_id = 'operations' and resource_kind = 'activation'
      and payload->>'id' = p_activation_id
    for update;
  if not found then raise exception 'make_real_activation_not_found'; end if;
  prior := existing.payload;
  if p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 2147483647 then
    raise exception 'make_real_activation_invalid';
  end if;
  if prior->>'revision' is distinct from p_expected_revision::text then
    raise exception 'make_real_activation_revision_conflict';
  end if;
  if prior->>'status'='rolled_back' or (prior->>'status'<>'made_real' and not (prior ? 'rollbackStartedAt')) then raise exception 'make_real_activation_invalid'; end if;
  perform public.native_google_undo_frame(p_workspace_id,prior);
  if p->>'status' not in ('needs_attention','rolled_back') or not public.make_real_activation_is_time(p->'rollbackStartedAt')
    or (p-array['revision','status','updatedAt','history','steps','rollbackStartedAt']) is distinct from (prior-array['revision','status','updatedAt','history','steps','rollbackStartedAt'])
    or exists(select 1 from jsonb_array_elements(p->'steps') s where s->>'status' not in ('completed','restored','compensated')) then raise exception 'make_real_activation_invalid'; end if;
  if prior->>'status'='made_real' and (prior ? 'rollbackStartedAt' or exists(select 1 from jsonb_array_elements(prior->'steps') s where s->>'status'<>'completed')
    or exists(select 1 from jsonb_array_elements(prior->'checks') c where c->>'status' is distinct from 'passed')) then raise exception 'make_real_activation_invalid'; end if;
  if not public.make_real_activation_shape_valid(p, p_workspace_id)
    or p->>'id' is distinct from p_activation_id
    or p->>'revision' is distinct from (p_expected_revision + 1)::text
    or p->'version' is distinct from prior->'version'
    or p->'businessId' is distinct from prior->'businessId'
    or p->'possibilityId' is distinct from prior->'possibilityId'
    or p->'candidateRevision' is distinct from prior->'candidateRevision'
    or p->'actorId' is distinct from prior->'actorId'
    or p->'createdAt' is distinct from prior->'createdAt'
    or (prior ? 'rollbackStartedAt' and p->'rollbackStartedAt' is distinct from prior->'rollbackStartedAt') then
    raise exception 'make_real_activation_invalid';
  end if;

  -- History only grows, by one event from this caller at this revision.
  old_len := jsonb_array_length(prior->'history');
  if jsonb_array_length(p->'history') <> old_len + 1
    or (p->'history') - old_len is distinct from prior->'history' then
    raise exception 'make_real_activation_invalid';
  end if;
  event := p->'history'->old_len;
  event_kind := event->>'kind';
  if jsonb_typeof(event) is distinct from 'object'
    or coalesce(event_kind, '') !~ '^[a-z][a-z_]{0,39}$'
    or event->>'actorId' is distinct from p_user_id::text
    or jsonb_typeof(event->'revision') is distinct from 'number'
    or event->>'revision' is distinct from (p_expected_revision + 1)::text
    or not public.make_real_activation_is_time(event->'at') then
    raise exception 'make_real_activation_invalid';
  end if;

  if event->'at' is distinct from p->'updatedAt' or (event->>'at')::timestamptz<(prior->>'updatedAt')::timestamptz then raise exception 'make_real_activation_invalid'; end if;
  if event_kind not in ('rollback_started','rollback_step','rollback_compensation_claim','reconcile','rollback')
   or (event_kind='rollback_started' and (prior ? 'rollbackStartedAt' or p->'steps' is distinct from prior->'steps'))
   or (not (prior ? 'rollbackStartedAt') and event_kind<>'rollback_started') then raise exception 'make_real_activation_invalid'; end if;
  -- Pins, introductions and connections keep their identity; what each
  -- records about the live world is written once.
  if jsonb_array_length(p->'pinned') <> jsonb_array_length(prior->'pinned')
    or jsonb_array_length(p->'introduced') <> jsonb_array_length(prior->'introduced')
    or jsonb_array_length(p->'connections') <> jsonb_array_length(prior->'connections')
    or jsonb_array_length(p->'approvals') < jsonb_array_length(prior->'approvals')
    or exists(select 1 from jsonb_array_elements(prior->'pinned') with ordinality o(v, n)
      join jsonb_array_elements(p->'pinned') with ordinality x(v, n) using (n)
      where x.v->'systemId' is distinct from o.v->'systemId'
        or x.v->'baselineRevisionId' is distinct from o.v->'baselineRevisionId'
        or (o.v ? 'stagedRevisionId' and x.v->'stagedRevisionId' is distinct from o.v->'stagedRevisionId'))
    or exists(select 1 from jsonb_array_elements(prior->'introduced') with ordinality o(v, n)
      join jsonb_array_elements(p->'introduced') with ordinality x(v, n) using (n)
      where x.v->'key' is distinct from o.v->'key'
        or (o.v ? 'systemId' and x.v->'systemId' is distinct from o.v->'systemId')
        or (o.v ? 'revisionId' and x.v->'revisionId' is distinct from o.v->'revisionId'))
    or exists(select 1 from jsonb_array_elements(prior->'connections') with ordinality o(v, n)
      join jsonb_array_elements(p->'connections') with ordinality x(v, n) using (n)
      where x.v->'id' is distinct from o.v->'id'
        or (o.v ? 'connectionId' and x.v->'connectionId' is distinct from o.v->'connectionId'))
    or exists(select 1 from jsonb_array_elements(prior->'approvals') with ordinality o(v, n)
      join jsonb_array_elements(p->'approvals') with ordinality x(v, n) using (n)
      where (x.v - 'consumedAt') is distinct from (o.v - 'consumedAt')
        or (o.v ? 'consumedAt' and x.v->'consumedAt' is distinct from o.v->'consumedAt')) then
    raise exception 'make_real_activation_invalid';
  end if;

  if jsonb_array_length(p->'steps') <> jsonb_array_length(prior->'steps') then
    raise exception 'make_real_activation_invalid';
  end if;
  if event_kind in ('rollback_step','rollback_compensation_claim') and not (p ? 'rollbackStartedAt') then
    raise exception 'make_real_activation_invalid';
  end if;
  for i in 0..jsonb_array_length(p->'steps') - 1 loop
    prior_step := prior->'steps'->i;
    next_step := p->'steps'->i;
    if public.make_real_activation_step_frame(next_step) is distinct from public.make_real_activation_step_frame(prior_step)
      or (next_step->>'attempts')::integer < (prior_step->>'attempts')::integer then
      raise exception 'make_real_activation_invalid';
    end if;
    if public.make_real_compensation_transition_valid(prior_step,next_step,event_kind,p ? 'rollbackStartedAt') is not true then
      raise exception 'make_real_activation_invalid';
    end if;
    -- An accepted outside effect keeps its result for good.
    if prior_step->>'effect' = 'accepted' and (next_step->>'effect' <> 'accepted'
      or next_step->'receipt' is distinct from prior_step->'receipt'
      or next_step->'readBack' is distinct from prior_step->'readBack') then
      raise exception 'make_real_activation_invalid';
    end if;
    if prior_step->>'status' in ('restored', 'compensated') then
      if next_step is distinct from prior_step then raise exception 'make_real_activation_invalid'; end if;
    elsif prior_step->>'status' = 'completed' then
      if event_kind <> 'rollback_step' and not (event_kind in ('rollback_compensation_claim','reconcile')
        and (prior_step->'compensation') is distinct from (next_step->'compensation')) then
        if next_step is distinct from prior_step then raise exception 'make_real_activation_invalid'; end if;
      elsif next_step->>'status' not in ('completed', 'restored', 'compensated')
        or (next_step - 'status' - 'reason' - 'compensation') is distinct from (prior_step - 'status' - 'reason' - 'compensation')
        or (next_step->>'status' = 'restored' and prior_step->>'kind' = 'effect')
        or (next_step->>'status' = 'compensated' and (prior_step->>'kind' <> 'effect' or prior_step->>'effect' <> 'accepted')) then
        raise exception 'make_real_activation_invalid';
      end if;
    else
      if next_step->>'status' in ('restored', 'compensated')
        or (next_step->>'status' = 'completed' and prior_step->>'status' not in ('running', 'unknown'))
        or (next_step->>'status' = 'unknown' and prior_step->>'status' not in ('running', 'unknown'))
        or (prior_step->>'status' = 'unknown' and next_step->>'status' <> 'unknown'
          and (event_kind <> 'reconcile' or next_step->>'status' not in ('completed', 'failed')))
        or (prior ? 'rollbackStartedAt' and next_step->>'status' = 'running' and prior_step->>'status' <> 'running') then
        raise exception 'make_real_activation_invalid';
      end if;
    end if;
  end loop;

  if p->>'status' = 'made_real' and (
      exists(select 1 from jsonb_array_elements(p->'steps') s where s->>'status' <> 'completed')
      or exists(select 1 from jsonb_array_elements(p->'checks') c where c->>'status' is distinct from 'passed')) then
    raise exception 'make_real_activation_invalid';
  end if;
  if p->>'status' = 'rolled_back' and (event_kind <> 'rollback' or not (p ? 'rollbackStartedAt')
      or exists(select 1 from jsonb_array_elements(p->'steps') s where s->>'status' in ('running', 'unknown')
        or (s->>'kind' in ('activate','connect') and s->>'status'='completed')
        or (s->>'kind'='effect' and s->>'effect'='accepted' and s->>'reversibility'='compensable' and s->>'status'<>'compensated')
        or s->'compensation'->>'status' in ('running','unknown','failed')
        or (s->>'reversibility'='compensable' and s->'compensation'->>'status'='unavailable')
        or (not (s ? 'compensation') and s->>'reason' like 'Compensation failed:%'))) then
    raise exception 'make_real_activation_invalid';
  end if;

  perform public.native_google_undo_frame(p_workspace_id,p);
  perform public.make_real_activation_set_writer(true);
  update public.saved_product_work set payload = p, updated_at = clock_timestamp()
    where id = existing.id
    returning payload into saved;
  perform public.make_real_activation_set_writer(false);
  return saved;
end;
$$;

create function public.finalize_native_google_undo(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_possibility_id uuid,p_expected_revision integer,p_activation_id text,p_body jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare work public.saved_product_work%rowtype; plan public.system_possibilities%rowtype; old_json jsonb; expected jsonb; epochs jsonb; consumed jsonb; event jsonb; step jsonb; event_count integer;
begin
 perform public.native_google_undo_owner(p_workspace_id,p_user_id,p_verified_email);
 select * into work from public.saved_product_work where workspace_id=p_workspace_id and product_id='operations' and resource_kind='activation' and payload->>'id'=p_activation_id for update;
 if not found or work.payload->>'status' is distinct from 'rolled_back' or work.payload->>'possibilityId' is distinct from p_possibility_id::text
  or not public.make_real_activation_is_time(work.payload->'rollbackStartedAt')
  or exists(select 1 from jsonb_array_elements(work.payload->'steps') s where
    (s->>'kind'='verify' and s->>'status' is distinct from 'completed')
    or (s->>'kind'='effect' and (s->>'status' is distinct from 'compensated' or s->'compensation'->>'status' is distinct from 'compensated'))
    or (s->>'kind' not in ('verify','effect') and s->>'status' is distinct from 'restored')
    or s->>'effect'='unknown' or s->'compensation'->>'status' in ('running','unknown','failed','unavailable')) then raise exception 'native_google_undo_finalization_unconfirmed'; end if;
 perform public.native_google_undo_frame(p_workspace_id,work.payload);
 select * into plan from public.system_possibilities where business_workspace_id=p_workspace_id and id=p_possibility_id for update;
 if p_expected_revision is null or p_expected_revision<0 or p_expected_revision>=2147483647 or plan.revision is distinct from p_expected_revision then raise exception 'system_possibility_revision_conflict'; end if;
 old_json:=public.system_possibility_json(plan,200);
 if public.system_possibility_body_valid(p_body,p_workspace_id) is not true or octet_length(p_body::text)>512000
  or jsonb_typeof(p_body->'history') is distinct from 'array' or jsonb_array_length(p_body->'history')<>jsonb_array_length(old_json->'history')+1
  or (p_body->'history')-(jsonb_array_length(p_body->'history')-1) is distinct from old_json->'history' then raise exception 'system_possibility_invalid'; end if;
 event:=p_body->'history'->(jsonb_array_length(p_body->'history')-1);
 if (event-array['revision','kind','actorId','at','detail'])<>'{}'::jsonb
  or event->>'revision' is distinct from (p_expected_revision+1)::text or event->>'kind' is distinct from 'make_real_rolled_back'
  or event->>'actorId' is distinct from p_user_id::text or event->>'detail' is distinct from p_activation_id
  or public.make_real_activation_is_time(event->'at') is not true or event->'at' is distinct from p_body->'updatedAt'
  or (event->>'at')::timestamptz<(plan.body->>'updatedAt')::timestamptz then raise exception 'system_possibility_invalid'; end if;
 epochs:=coalesce(plan.body->'keyEpochs','{}'::jsonb);
 for step in select value from jsonb_array_elements(work.payload->'steps') where value->>'status' in ('restored','compensated') loop
  epochs:=jsonb_set(epochs,array[step->>'id'],to_jsonb(coalesce((epochs->>(step->>'id'))::integer,0)+1),true);
 end loop;
 select coalesce(jsonb_agg(to_jsonb(id) order by first_position),'[]'::jsonb) into consumed from (
  select value#>>'{}' id,min(ordinality) first_position from jsonb_array_elements(coalesce(plan.body->'consumedApprovalIds','[]'::jsonb)||
   coalesce((select jsonb_agg(a->'approvalId' order by ordinal) from jsonb_array_elements(work.payload->'approvals') with ordinality aa(a,ordinal) where a ? 'consumedAt'),'[]'::jsonb)) with ordinality group by value#>>'{}'
 ) unique_ids;
 expected:=(plan.body-'activationId')||jsonb_build_object('status','withdrawn','revision',p_expected_revision+1,'updatedAt',event->'at','keyEpochs',epochs,'consumedApprovalIds',consumed);
 if p_body-'history' is distinct from expected then raise exception 'system_possibility_invalid'; end if;
 insert into public.system_possibility_events(possibility_id,business_workspace_id,revision,kind,actor_id,at,detail)
  values(plan.id,p_workspace_id,p_expected_revision+1,'make_real_rolled_back',p_user_id::text,(event->>'at')::timestamptz,p_activation_id);
 update public.system_possibilities set status='withdrawn',revision=p_expected_revision+1,body=expected,activation_id=null,updated_at=clock_timestamp(),last_activity_at=clock_timestamp() where id=plan.id returning * into plan;
 return public.system_possibility_json(plan,200);
end $$;
revoke all on function public.native_google_undo_owner(uuid,uuid,text),public.native_google_undo_frame(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.save_native_google_undo_activation(uuid,uuid,text,text,integer,jsonb),public.finalize_native_google_undo(uuid,uuid,text,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_native_google_undo_activation(uuid,uuid,text,text,integer,jsonb),public.finalize_native_google_undo(uuid,uuid,text,uuid,integer,text,jsonb) to service_role;

create function public.native_google_recovery_frame(p_workspace_id uuid,p_activation jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare plan public.system_possibilities%rowtype; effect jsonb; step jsonb; ref jsonb; request jsonb; canonical text; original public.google_listing_receipts%rowtype; inverse public.google_listing_receipts%rowtype;
begin
 select * into plan from public.system_possibilities where business_workspace_id=p_workspace_id and id=(p_activation->>'possibilityId')::uuid for update;
 if not found or plan.status is distinct from 'ready' or plan.activation_id is distinct from p_activation->>'id'
  or plan.body->>'status' is distinct from 'ready' or plan.body->>'activationId' is distinct from plan.activation_id
  or plan.candidate_revision::text is distinct from p_activation->>'candidateRevision'
  or plan.body->>'candidateRevision' is distinct from p_activation->>'candidateRevision'
  or public.make_real_activation_shape_valid(p_activation,p_workspace_id) is not true
  or jsonb_typeof(plan.body->'effects') is distinct from 'array' or jsonb_array_length(plan.body->'effects')<>1 then raise exception 'native_google_undo_plan_invalid'; end if;
 effect:=plan.body->'effects'->0; request:=effect->'request';
 if effect->>'channel' is distinct from 'google_listing' or effect->>'kind' is distinct from 'publish'
  or jsonb_typeof(request) is distinct from 'object' or (request-array['tenantId','locationId','eventId','draftDigest','nativeGrant'])<>'{}'::jsonb
  or request->>'tenantId' is distinct from 'workspace-'||p_workspace_id::text
  or coalesce(request->>'locationId','') !~ '^[A-Za-z0-9_-]{1,64}$'
  or coalesce(request->>'eventId','')='' or length(request->>'eventId')>200
  or coalesce(request->>'draftDigest','') !~ '^[a-f0-9]{64}$'
  or jsonb_typeof(request->'nativeGrant') is distinct from 'object'
  or ((request->'nativeGrant')-array['bindingId','accountId','grantGeneration'])<>'{}'::jsonb
  or coalesce(request->'nativeGrant'->>'bindingId','') !~ '^[0-9a-f-]{36}$'
  or coalesce(request->'nativeGrant'->>'accountId','') !~ '^accounts/[A-Za-z0-9_-]{1,64}$'
  or coalesce(request->'nativeGrant'->>'grantGeneration','') !~ '^[a-f0-9]{64}$' then raise exception 'native_google_undo_plan_invalid'; end if;
 -- Every declared preparation, live pointer and connection remains represented.
 if exists(with expected as (
  select 'stage:'||(c->'baseline'->>'systemId') id,'stage' kind,c->'baseline'->>'systemId' target from jsonb_array_elements(plan.body->'changes') c
  union all select 'activate:'||(c->'baseline'->>'systemId'),'activate',c->'baseline'->>'systemId' from jsonb_array_elements(plan.body->'changes') c
  union all select 'introduce:'||(c->>'key'),'introduce','introduced:'||(c->>'key') from jsonb_array_elements(plan.body->'introduces') c
  union all select 'activate:introduced:'||(c->>'key'),'activate','introduced:'||(c->>'key') from jsonb_array_elements(plan.body->'introduces') c
  union all select 'connect:'||(c->>'id'),'connect',c->>'id' from jsonb_array_elements(plan.body->'connections') c
  union all select 'effect:'||(effect->>'id'),'effect',effect->>'id'
  union all select 'verify','verify',plan.id::text
 ), actual as (select s->>'id' id,s->>'kind' kind,s->>'target' target from jsonb_array_elements(p_activation->'steps') s)
 select 1 from expected full join actual using(id,kind,target) where expected.id is null or actual.id is null)
 or jsonb_array_length(p_activation->'steps')<>2*jsonb_array_length(plan.body->'changes')+2*jsonb_array_length(plan.body->'introduces')+jsonb_array_length(plan.body->'connections')+2 then raise exception 'native_google_undo_plan_invalid'; end if;
 select s into step from jsonb_array_elements(p_activation->'steps') s where s->>'kind'='effect' and s->>'target'=effect->>'id';
 if step->>'effect' is distinct from 'accepted' or step->>'reversibility' is distinct from 'compensable'
  or step->>'effectKind' is distinct from 'publish' or step->'receipt'->>'adapterMode' is distinct from 'live'
  or coalesce(step->'receipt'->>'providerRef','')='' then raise exception 'native_google_undo_receipt_invalid'; end if;
 begin ref:=(step->'receipt'->>'providerRef')::jsonb;
 exception when others then raise exception 'native_google_undo_receipt_invalid'; end;
 if jsonb_typeof(ref) is distinct from 'object' or (ref-array['businessId','request','receiptId'])<>'{}'::jsonb
  or ref->>'businessId' is distinct from p_workspace_id::text or ref->'request' is distinct from request
  or coalesce(ref->>'receiptId','') !~ '^[0-9a-f-]{36}$' then raise exception 'native_google_undo_receipt_invalid'; end if;
 canonical:=format('{"businessId":%s,"request":{"tenantId":%s,"locationId":%s,"eventId":%s,"draftDigest":%s,"nativeGrant":{"bindingId":%s,"accountId":%s,"grantGeneration":%s}},"receiptId":%s}',
  to_json(ref->>'businessId'),to_json(request->>'tenantId'),to_json(request->>'locationId'),to_json(request->>'eventId'),to_json(request->>'draftDigest'),
  to_json(request->'nativeGrant'->>'bindingId'),to_json(request->'nativeGrant'->>'accountId'),to_json(request->'nativeGrant'->>'grantGeneration'),to_json(ref->>'receiptId'));
 if step->'receipt'->>'providerRef' is distinct from canonical then raise exception 'native_google_undo_receipt_invalid'; end if;
 select * into original from public.google_listing_receipts where id=(ref->>'receiptId')::uuid and workspace_id=p_workspace_id for share;
 if not found or original.binding_id is distinct from (request->'nativeGrant'->>'bindingId')::uuid
  or original.location_id is distinct from request->>'locationId' or original.authority->>'kind' is distinct from 'owner_approval'
  or original.authority->>'approvalRef' is distinct from request->>'eventId' or original.idempotency_key is distinct from 'google-draft:'||(request->>'eventId')
  or original.status not in ('posted','posted_unverified','held_by_google') or original.intent_digest is null
  or not exists(select 1 from jsonb_array_elements(p_activation->'approvals') a where a->>'effectId'=effect->>'id'
   and (not (step->'receipt' ? 'approvalId') or a->>'approvalId'=step->'receipt'->>'approvalId') and public.make_real_activation_is_time(a->'consumedAt')) then raise exception 'native_google_undo_receipt_invalid'; end if;
 return plan.body;
end $$;

create function public.save_native_google_recovered_activation(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_activation_id text,p_expected_revision integer,p_activation jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare work public.saved_product_work%rowtype; prior jsonb; event jsonb; old_step jsonb; new_step jsonb; changed integer:=0; i integer; old_length integer;
begin
 perform public.native_google_undo_owner(p_workspace_id,p_user_id,p_verified_email);
 select * into work from public.saved_product_work where workspace_id=p_workspace_id and product_id='operations' and resource_kind='activation' and payload->>'id'=p_activation_id for update;
 if not found then raise exception 'make_real_activation_not_found'; end if;
 prior:=work.payload;
 if p_expected_revision is null or p_expected_revision<0 or p_expected_revision>=2147483647 or prior->>'revision' is distinct from p_expected_revision::text then raise exception 'make_real_activation_revision_conflict'; end if;
 if prior->>'status' not in ('in_progress','needs_attention') or prior ? 'rollbackStartedAt'
  or public.make_real_activation_shape_valid(p_activation,p_workspace_id) is not true
  or (p_activation-array['revision','status','updatedAt','history','steps']) is distinct from (prior-array['revision','status','updatedAt','history','steps'])
  or p_activation->>'revision' is distinct from (p_expected_revision+1)::text
  or p_activation->>'status' not in ('in_progress','needs_attention','made_real')
  or jsonb_array_length(p_activation->'steps')<>jsonb_array_length(prior->'steps') then raise exception 'make_real_activation_invalid'; end if;
 old_length:=jsonb_array_length(prior->'history');event:=p_activation->'history'->old_length;
 if jsonb_array_length(p_activation->'history')<>old_length+1 or (p_activation->'history')-old_length is distinct from prior->'history'
  or event->>'kind' is distinct from 'reconcile' or event->>'actorId' is distinct from p_user_id::text
  or event->>'revision' is distinct from (p_expected_revision+1)::text or public.make_real_activation_is_time(event->'at') is not true
  or event->'at' is distinct from p_activation->'updatedAt' or (event->>'at')::timestamptz<(prior->>'updatedAt')::timestamptz then raise exception 'make_real_activation_invalid'; end if;
 for i in 0..jsonb_array_length(prior->'steps')-1 loop
  old_step:=prior->'steps'->i;new_step:=p_activation->'steps'->i;
  if old_step is not distinct from new_step then continue; end if;
  changed:=changed+1;
  if old_step->>'kind' is distinct from 'effect' or old_step->>'status' is distinct from 'unknown' or old_step->>'effect' is distinct from 'accepted'
   or old_step ? 'compensation' or coalesce(old_step->'receipt'->>'providerRef','')<>''
   or old_step->'receipt'->>'adapterMode' is distinct from 'live'
   or new_step->>'status' is distinct from 'completed' or new_step->>'effect' is distinct from 'accepted'
   or (new_step-array['status','reason','receipt','readBack','finishedAt']) is distinct from (old_step-array['status','reason','receipt','readBack','finishedAt'])
   or new_step->'finishedAt' is distinct from event->'at' or (old_step ? 'finishedAt' and (new_step->>'finishedAt')::timestamptz<(old_step->>'finishedAt')::timestamptz)
   or (new_step->'receipt'-array['providerRef','reconciledBy']) is distinct from (old_step->'receipt'-array['providerRef','reconciledBy'])
   or new_step->'receipt'->>'reconciledBy' is distinct from 'provider_lookup'
   or new_step->'readBack'->>'status' is distinct from 'confirmed' or public.make_real_activation_is_time(new_step->'readBack'->'at') is not true
   or jsonb_typeof(new_step->'readBack'->'detail') is distinct from 'string' or length(new_step->'readBack'->>'detail')>1000 then raise exception 'make_real_activation_invalid'; end if;
 end loop;
 if changed<>1 or (p_activation->>'status'='made_real' and (exists(select 1 from jsonb_array_elements(p_activation->'steps') s where s->>'status'<>'completed')
  or exists(select 1 from jsonb_array_elements(p_activation->'checks') c where c->>'status' is distinct from 'passed'))) then raise exception 'make_real_activation_invalid'; end if;
 perform public.native_google_recovery_frame(p_workspace_id,p_activation);
 perform public.make_real_activation_set_writer(true);
 update public.saved_product_work set payload=p_activation,updated_at=clock_timestamp() where id=work.id;
 perform public.make_real_activation_set_writer(false);
 return p_activation;
end $$;
revoke all on function public.native_google_recovery_frame(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.save_native_google_recovered_activation(uuid,uuid,text,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_native_google_recovered_activation(uuid,uuid,text,text,integer,jsonb) to service_role;

-- Finish only the metadata checkpoint lost after actual whole-plan completion.
create function public.finalize_native_google_completion(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_possibility_id uuid,p_expected_revision integer,p_activation_id text,p_body jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare work public.saved_product_work%rowtype; plan public.system_possibilities%rowtype; old_json jsonb; event jsonb; expected jsonb;
begin
 perform public.native_google_undo_owner(p_workspace_id,p_user_id,p_verified_email);
 select * into work from public.saved_product_work where workspace_id=p_workspace_id and product_id='operations' and resource_kind='activation' and payload->>'id'=p_activation_id for update;
 if not found or work.payload->>'status' is distinct from 'made_real' or work.payload->>'possibilityId' is distinct from p_possibility_id::text
  or work.payload ? 'rollbackStartedAt' or exists(select 1 from jsonb_array_elements(work.payload->'steps') s where s->>'status' is distinct from 'completed' or s ? 'compensation')
  or exists(select 1 from jsonb_array_elements(work.payload->'checks') c where c->>'status' is distinct from 'passed') then raise exception 'native_google_completion_unconfirmed'; end if;
 perform public.native_google_recovery_frame(p_workspace_id,work.payload);
 select * into plan from public.system_possibilities where id=p_possibility_id and business_workspace_id=p_workspace_id for update;
 if p_expected_revision is null or p_expected_revision<0 or p_expected_revision>=2147483647 or plan.revision is distinct from p_expected_revision then raise exception 'system_possibility_revision_conflict'; end if;
 old_json:=public.system_possibility_json(plan,200);
 if public.system_possibility_body_valid(p_body,p_workspace_id) is not true or octet_length(p_body::text)>512000
  or jsonb_array_length(p_body->'history')<>jsonb_array_length(old_json->'history')+1
  or (p_body->'history')-(jsonb_array_length(p_body->'history')-1) is distinct from old_json->'history' then raise exception 'system_possibility_invalid'; end if;
 event:=p_body->'history'->(jsonb_array_length(p_body->'history')-1);
 if (event-array['revision','kind','actorId','at','detail'])<>'{}'::jsonb or event->>'revision' is distinct from (p_expected_revision+1)::text
  or event->>'kind' is distinct from 'made_real' or event->>'actorId' is distinct from p_user_id::text or event->>'detail' is distinct from p_activation_id
  or public.make_real_activation_is_time(event->'at') is not true or event->'at' is distinct from p_body->'updatedAt'
  or (event->>'at')::timestamptz<(plan.body->>'updatedAt')::timestamptz
  or (event->>'at')::timestamptz<(work.payload->>'updatedAt')::timestamptz then raise exception 'system_possibility_invalid'; end if;
 expected:=plan.body||jsonb_build_object('status','made_real','revision',p_expected_revision+1,'updatedAt',event->'at');
 if p_body-'history' is distinct from expected then raise exception 'system_possibility_invalid'; end if;
 return public.save_system_possibility(p_workspace_id,p_user_id,p_verified_email,p_possibility_id,p_expected_revision,p_body);
end $$;
revoke all on function public.finalize_native_google_completion(uuid,uuid,text,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.finalize_native_google_completion(uuid,uuid,text,uuid,integer,text,jsonb) to service_role;

commit;
