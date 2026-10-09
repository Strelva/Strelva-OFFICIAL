create table public.native_google_oauth_attempts (
 id uuid primary key, workspace_id uuid not null references public.workspaces(id), requested_by uuid not null references public.users(id),
 account_id text not null check(account_id ~ '^accounts/[A-Za-z0-9_-]{1,64}$'), location_id text not null check(location_id ~ '^[A-Za-z0-9_-]{1,64}$'),
 nonce_hash text not null check(nonce_hash ~ '^[a-f0-9]{64}$'), state_hash text not null check(state_hash ~ '^[a-f0-9]{64}$'),
 expected_binding_id uuid, expected_updated_at timestamptz, status text not null check(status in ('pending','exchanging','finished','expired','failed')),
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
 expected_updated_at timestamptz not null, status text not null check(status in ('claimed','settled')),
 remote_outcome text not null default 'not_attempted', remote_error_code text,
 credentials_purged boolean not null default true, created_at timestamptz not null default clock_timestamp(), settled_at timestamptz
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
create trigger native_google_disconnect_lock before insert or update on public.workspace_account_bindings for each statement execute function public.native_google_disconnect_lock();
revoke all on function public.native_google_disconnect_lock() from public,anon,authenticated,service_role;
create trigger native_google_disconnect_fence before insert or update on public.workspace_account_bindings for each row execute function public.native_google_disconnect_fence();
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
  return jsonb_build_object('bindingId',b.id,'status',b.status,'credentialsPurged',b.refresh_token_ciphertext is null and b.access_token_ciphertext is null);
 end if;
 if p_action='qualify' then
  select * into b from public.workspace_account_bindings where id=(p_input->>'bindingId')::uuid and workspace_id=p_workspace_id and provider='google';
  if not found or b.origin_tenant_stable_id is not null or b.status<>'connected' or b.subject is null or exists(select 1 from public.workspace_account_bindings x where x.id<>b.id and x.provider='google' and (x.refresh_token_ciphertext is not null or x.access_token_ciphertext is not null) and (x.subject is null or x.subject=b.subject or x.origin_tenant_stable_id is not null)) then raise exception 'native_google_grant_isolation_unconfirmed'; end if;
  if exists(select 1 from public.tenant_client_records x where x.store='provider_connections' and x.record_id='google' and x.removed_at is null and (coalesce(x.payload->>'refreshToken','')<>'' or coalesce(x.payload->>'accessToken','')<>'')) then raise exception 'native_google_legacy_durable_grant_requires_review'; end if;
  return jsonb_build_object('isolated',true);
 end if;
 if p_action='read_disconnect' then
  select * into r from public.native_google_disconnect_receipts where id=(p_input->>'commandId')::uuid and workspace_id=p_workspace_id;
  if not found then raise exception 'native_google_receipt_unknown'; end if;
  return jsonb_build_object('id',r.id,'bindingId',r.binding_id,'status',r.status,'remoteOutcome',r.remote_outcome,'remoteErrorCode',r.remote_error_code,'credentialsPurged',r.credentials_purged,'remoteRevoked',r.remote_outcome in ('revoked','already_revoked'));
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
  insert into public.native_google_oauth_attempts(id,workspace_id,requested_by,account_id,location_id,nonce_hash,state_hash,expected_binding_id,expected_updated_at,status)
  values((p_input->>'id')::uuid,p_workspace_id,p_user_id,p_input->>'accountId',p_input->>'locationId',p_input->>'nonceHash',p_input->>'stateHash',b.id,b.updated_at,'pending');
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
  saved:=public.upsert_workspace_account_binding(jsonb_build_object('workspaceId',p_workspace_id,'provider','google','originTenantStableId',null,'subject',p_input->>'subject','scopes',p_input->'scopes','accessTokenCiphertext',p_input->>'accessTokenCiphertext','refreshTokenCiphertext',p_input->>'refreshTokenCiphertext','tokenExpiresAt',p_input->>'tokenExpiresAt','status','connected'),'oauth');
  perform public.upsert_workspace_google_location((saved->>'id')::uuid,o.account_id,o.location_id,null);
  update public.native_google_oauth_attempts set status='finished' where id=o.id;
  return jsonb_build_object('bindingId',saved->>'id','workspaceId',p_workspace_id,'accountId',o.account_id,'locationId',o.location_id,'status','connected');
 end if;
 if p_action='claim_disconnect' then
  if (p_input-array['commandId','bindingId','expectedUpdatedAt'])<>'{}'::jsonb then raise exception 'native_google_input_invalid'; end if;
  if exists(select 1 from public.native_google_disconnect_receipts where id=(p_input->>'commandId')::uuid) then raise exception 'native_google_disconnect_already_claimed'; end if;
  select * into b from public.workspace_account_bindings where id=(p_input->>'bindingId')::uuid and workspace_id=p_workspace_id and provider='google' for update;
  if not found or b.status<>'connected' or b.origin_tenant_stable_id is not null or b.subject is null or b.updated_at is distinct from (p_input->>'expectedUpdatedAt')::timestamptz then raise exception 'native_google_grant_changed'; end if;
  -- Unknown/legacy identities or another retained copy of this consent prevent
  -- an exact single-grant disconnect. No broad cleanup of unrelated businesses.
  if exists(select 1 from public.workspace_account_bindings x where x.id<>b.id and x.provider='google' and (x.refresh_token_ciphertext is not null or x.access_token_ciphertext is not null) and (x.subject is null or x.subject=b.subject or x.origin_tenant_stable_id is not null)) then raise exception 'native_google_other_grants_require_review'; end if;
  if exists(select 1 from public.tenant_client_records x where x.store='provider_connections' and x.record_id='google' and x.removed_at is null and (coalesce(x.payload->>'refreshToken','')<>'' or coalesce(x.payload->>'accessToken','')<>'')) then raise exception 'native_google_legacy_durable_grant_requires_review'; end if;
  token_refresh:=b.refresh_token_ciphertext; token_access:=b.access_token_ciphertext;
  if token_refresh is null and token_access is null then raise exception 'native_google_no_token'; end if;
  insert into public.native_google_disconnect_receipts(id,workspace_id,binding_id,requested_by,subject,expected_updated_at,status)
  values((p_input->>'commandId')::uuid,p_workspace_id,b.id,p_user_id,b.subject,b.updated_at,'claimed');
  update public.workspace_account_bindings set refresh_token_ciphertext=null,access_token_ciphertext=null,token_expires_at=null,status='revoked',updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=b.id;
  return jsonb_build_object('id',(p_input->>'commandId')::uuid,'refreshTokenCiphertext',token_refresh,'accessTokenCiphertext',token_access);
 elsif p_action='settle_disconnect' then
  if (p_input-array['commandId','outcome','errorCode'])<>'{}'::jsonb or coalesce(p_input->>'outcome','') not in ('revoked','already_revoked','failed','partial_failure','no_token','not_attempted') then raise exception 'native_google_input_invalid'; end if;
  if p_input ? 'errorCode' and p_input->'errorCode'<>'null'::jsonb and (jsonb_typeof(p_input->'errorCode') is distinct from 'string' or coalesce(p_input->>'errorCode','') !~ '^[a-z][a-z0-9_]{0,79}$') then raise exception 'native_google_input_invalid'; end if;
  select * into r from public.native_google_disconnect_receipts where id=(p_input->>'commandId')::uuid and workspace_id=p_workspace_id and requested_by=p_user_id for update;
  if not found or r.status<>'claimed' then raise exception 'native_google_receipt_not_claimed'; end if;
  if exists(select 1 from public.workspace_account_bindings where id=r.binding_id and (status<>'revoked' or refresh_token_ciphertext is not null or access_token_ciphertext is not null)) then raise exception 'native_google_credential_purge_unconfirmed'; end if;
  update public.native_google_disconnect_receipts set status='settled',remote_outcome=p_input->>'outcome',remote_error_code=left(p_input->>'errorCode',100),settled_at=clock_timestamp() where id=r.id;
  return jsonb_build_object('id',r.id,'bindingId',r.binding_id,'status','settled','remoteOutcome',p_input->>'outcome','credentialsPurged',true,'remoteRevoked',p_input->>'outcome' in ('revoked','already_revoked'));
 elsif p_action='purge' then
  if p_input<>'{}'::jsonb then raise exception 'native_google_input_invalid'; end if;
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
create table public.native_google_lifecycle_prior_functions(signature text primary key,definition text not null,applied_hash text);
revoke all on public.native_google_lifecycle_prior_functions from public,anon,authenticated,service_role;
DO $$ declare definition text; marker text := '  select * into v_binding from public.workspace_account_bindings where id = p_binding_id for update;'; writer_signature text := 'public.upsert_workspace_google_location(uuid,text,text,text)'; begin
 definition:=pg_get_functiondef(to_regprocedure(writer_signature));
 if definition is null or strpos(definition,marker)=0 then raise exception 'native_google_location_writer_source_changed'; end if;
 insert into public.native_google_lifecycle_prior_functions(signature,definition) values(writer_signature,definition);
 execute replace(definition,marker,'  perform pg_advisory_xact_lock(771904091);' || chr(10) || marker);
 update public.native_google_lifecycle_prior_functions set applied_hash=md5(pg_get_functiondef(to_regprocedure(writer_signature))) where native_google_lifecycle_prior_functions.signature=writer_signature;
end $$;
DO $$ declare definition text; marker text := '  perform pg_advisory_xact_lock(hashtextextended(v_workspace::text || ' || quote_literal(':google:') || ' || coalesce(v_tenant::text, ' || quote_literal('-') || '), 9107));'; writer_signature text := 'public.upsert_workspace_account_binding(jsonb,text)'; begin
 definition:=pg_get_functiondef(to_regprocedure(writer_signature));
 if definition is null or strpos(definition,marker)=0 then raise exception 'native_google_binding_writer_source_changed'; end if;
 insert into public.native_google_lifecycle_prior_functions(signature,definition) values(writer_signature,definition);
 execute replace(definition,marker,'  perform pg_advisory_xact_lock(771904091);' || chr(10) || marker);
 update public.native_google_lifecycle_prior_functions set applied_hash=md5(pg_get_functiondef(to_regprocedure(writer_signature))) where native_google_lifecycle_prior_functions.signature=writer_signature;
end $$;
create function public.native_google_legacy_credential_fence() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin
 if new.store='provider_connections' and new.record_id='google' and new.removed_at is null and (coalesce(new.payload->>'refreshToken','')<>'' or coalesce(new.payload->>'accessToken','')<>'') and exists(select 1 from public.native_google_disconnect_receipts r where r.status='claimed' or r.remote_outcome not in ('revoked','already_revoked')) then raise exception 'native_google_disconnect_pending'; end if;
 return new;
end $$;
create trigger native_google_legacy_lock before insert or update on public.tenant_client_records for each statement execute function public.native_google_disconnect_lock();
create trigger native_google_legacy_credential_fence before insert or update on public.tenant_client_records for each row execute function public.native_google_legacy_credential_fence();
revoke all on function public.native_google_legacy_credential_fence() from public,anon,authenticated,service_role;
