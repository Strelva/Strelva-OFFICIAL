-- Contract checks for 20261024400000 against stub prerequisites.
-- Run only by scripts/check-google-found-facts-sql.sh in a throwaway cluster.
\set ON_ERROR_STOP 1
do $$
declare owner_id uuid := '10000000-0000-4000-8000-000000000001'; member_id uuid := '10000000-0000-4000-8000-000000000002';
  staff_id uuid := '10000000-0000-4000-8000-000000000003'; outsider uuid := '10000000-0000-4000-8000-000000000004';
  biz uuid := '20000000-0000-4000-8000-000000000001'; agency uuid := '20000000-0000-4000-8000-000000000002';
  binding uuid := '30000000-0000-4000-8000-000000000001'; r jsonb; fact uuid; ok boolean;
begin
  -- Owner reads Google; facts stay beside the record, open.
  r := public.record_google_found_facts(owner_id, 'owner@example.test', biz, 'accounts/1/locations/loc1',
    '[{"key":"phone","value":"(716) 555-0100"},{"key":"categories","value":["Bakery"]}]');
  if jsonb_array_length(r) <> 2 then raise exception 'expected two open found facts, got %', r; end if;
  if (select count(*) from public.business_google_found_facts where status <> 'open') <> 0 then raise exception 'import confirmed something'; end if;
  -- A member reads; a member cannot record or settle.
  if jsonb_array_length(public.read_google_found_facts(member_id, 'member@example.test', biz)) <> 2 then raise exception 'member read failed'; end if;
  begin perform public.record_google_found_facts(member_id, 'member@example.test', biz, 'accounts/1/locations/loc1', '[]'); ok := false;
  exception when others then ok := sqlerrm like '%found_fact_denied%'; end;
  if not ok then raise exception 'member recorded found facts'; end if;
  begin perform public.read_google_found_facts(outsider, 'out@example.test', biz); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'outsider read found facts'; end if;
  -- Only a listing this business's connected grant holds.
  begin perform public.record_google_found_facts(owner_id, 'owner@example.test', biz, 'accounts/1/locations/other', '[]'); ok := false;
  exception when others then ok := sqlerrm like '%found_fact_listing_not_connected%'; end;
  if not ok then raise exception 'foreign listing accepted'; end if;
  -- Re-read replaces the open value; never two open rows per key.
  perform public.record_google_found_facts(owner_id, 'owner@example.test', biz, 'accounts/1/locations/loc1', '[{"key":"phone","value":"(716) 555-0199"}]');
  if (select count(*) from public.business_google_found_facts where fact_key = 'phone' and status = 'open') <> 1
    or (select value #>> '{}' from public.business_google_found_facts where fact_key = 'phone' and status = 'open') <> '(716) 555-0199' then raise exception 'reread did not replace'; end if;
  -- Dismiss; the same value is not reopened, a changed one is.
  select id into fact from public.business_google_found_facts where fact_key = 'phone' and status = 'open';
  perform public.settle_google_found_fact(owner_id, 'owner@example.test', biz, fact, 'dismissed');
  perform public.record_google_found_facts(owner_id, 'owner@example.test', biz, 'accounts/1/locations/loc1', '[{"key":"phone","value":"(716) 555-0199"}]');
  if exists (select 1 from public.business_google_found_facts where fact_key = 'phone' and status = 'open') then raise exception 'dismissed value reopened'; end if;
  perform public.record_google_found_facts(owner_id, 'owner@example.test', biz, 'accounts/1/locations/loc1', '[{"key":"phone","value":"(716) 555-0200"}]');
  if not exists (select 1 from public.business_google_found_facts where fact_key = 'phone' and status = 'open') then raise exception 'changed value not reopened'; end if;
  begin perform public.settle_google_found_fact(owner_id, 'owner@example.test', biz, fact, 'confirmed'); ok := false;
  exception when others then ok := sqlerrm like '%found_fact_not_open%'; end;
  if not ok then raise exception 'settled twice'; end if;
  -- Disconnected grant: no new found facts.
  update public.workspace_account_bindings set status = 'needs_reauth' where id = binding;
  begin perform public.record_google_found_facts(owner_id, 'owner@example.test', biz, 'accounts/1/locations/loc1', '[]'); ok := false;
  exception when others then ok := true; end;
  if not ok then raise exception 'recorded from a disconnected grant'; end if;

  -- Agency link: staffed member with the active Google area only.
  r := public.agency_google_connect_link(staff_id, 'staff@example.test', biz);
  if r->>'kind' <> 'reconnect' or r->'target'->>'bindingId' <> binding::text then raise exception 'agency reconnect link: %', r; end if;
  update public.workspace_account_bindings set status = 'connected' where id = binding;
  if public.agency_google_connect_link(staff_id, 'staff@example.test', biz)->>'kind' <> 'connected' then raise exception 'connected kind'; end if;
  delete from public.workspace_google_locations; delete from public.workspace_account_bindings;
  if public.agency_google_connect_link(staff_id, 'staff@example.test', biz)->>'kind' <> 'first_connect' then raise exception 'first connect kind'; end if;
  begin perform public.agency_google_connect_link(owner_id, 'owner@example.test', biz); ok := false; exception when others then ok := sqlerrm like '%agency_google_link_denied%'; end;
  if not ok then raise exception 'non-agency got a link'; end if;
  update public.agency_scope_grants set scope = 'website';
  begin perform public.agency_google_connect_link(staff_id, 'staff@example.test', biz); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'agency without the Google area got a link'; end if;
  update public.agency_scope_grants set scope = 'google'; update public.provider_seats set status = 'ended';
  begin perform public.agency_google_connect_link(staff_id, 'staff@example.test', biz); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'unseated agency got a link'; end if;

  -- Read grant: owner saves/selects/revokes; member reads without secrets.
  perform public.google_read_grant(owner_id, 'owner@example.test', biz, 'save', jsonb_build_object('subject','sub-1','googleEmail','Owner@Gmail.test',
    'scopes', jsonb_build_array('openid','email','https://www.googleapis.com/auth/webmasters.readonly'), 'refreshTokenCiphertext','enc:v1:a:b:c','accessTokenCiphertext','enc:v1:a:b:d','tokenExpiresAt', now()));
  perform public.google_read_grant(owner_id, 'owner@example.test', biz, 'select', '{"gscProperty":"sc-domain:bakery.example"}');
  r := public.google_read_grant(member_id, 'member@example.test', biz, 'read');
  if r ? 'refreshTokenCiphertext' or r->>'gscProperty' <> 'sc-domain:bakery.example' or r->>'googleEmail' <> 'owner@gmail.test' then raise exception 'member read grant: %', r; end if;
  begin perform public.google_read_grant(member_id, 'member@example.test', biz, 'select', '{"gscProperty":"x"}'); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'member selected a property'; end if;
  begin perform public.google_read_grant(owner_id, 'owner@example.test', biz, 'save', jsonb_build_object('subject','s','googleEmail','a@b.c','scopes', jsonb_build_array('https://www.googleapis.com/auth/business.manage'),'refreshTokenCiphertext','enc:v1:a:b:c')); ok := false;
  exception when others then ok := true; end;
  if not ok then raise exception 'read grant accepted business.manage'; end if;
  perform public.google_read_grant(owner_id, 'owner@example.test', biz, 'save', jsonb_build_object('subject','sub-2','googleEmail','other@gmail.test',
    'scopes', jsonb_build_array('https://www.googleapis.com/auth/analytics.readonly'), 'refreshTokenCiphertext','enc:v1:a:b:e'));
  if (public.google_read_grant(owner_id, 'owner@example.test', biz, 'read')->>'gscProperty') is not null then raise exception 'new account kept old property'; end if;
  r := public.google_read_grant(owner_id, 'owner@example.test', biz, 'revoke');
  if r->>'revocationTokenCiphertext' <> 'enc:v1:a:b:e' then raise exception 'revoke token'; end if;
  if exists (select 1 from public.workspace_google_read_grants where refresh_token_ciphertext is not null) then raise exception 'revoked token kept'; end if;
  raise notice 'google found facts and read grant contract: ok';
end $$;
