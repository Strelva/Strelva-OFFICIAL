\set ON_ERROR_STOP on
-- Dental intake (20261028100500-100700). Fictional rows on a disposable cluster, inside one transaction.
begin;
create function pg_temp.vi_assert(ok boolean, note text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'vertical intake assertion: %', note; end if; end $$;
create function pg_temp.vi_refuse(statement text, reason text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if position(reason in sqlerrm) = 0 then raise exception 'expected %, got % (%)', reason, sqlerrm, statement; end if;
    return;
  end;
  raise exception 'expected refusal %, succeeded: %', reason, statement;
end $$;

create function pg_temp.vi_q(q text) returns text language plpgsql security definer as $$
declare r text; begin execute q into r; return r; end $$;
create function pg_temp.vi_install() returns uuid language sql security definer as $$ select id from public.app_intake_installs $$;
create function pg_temp.vi_submission() returns uuid language sql security definer as $$ select id from public.app_intake_submissions $$;
create function pg_temp.vi_lead(p_lead_id text) returns uuid language sql security definer as $$ select id from public.tenant_leads where lead_id = p_lead_id $$;

-- ---- (a) the flag ----
select pg_temp.vi_assert('vertical_intake' = any(public.workspace_release_flag_names()), '(a) vertical_intake is a known release flag');

-- ---- (b) insurance_accepted ----
select pg_temp.vi_assert(public.business_record_fact_valid('insurance_accepted', '{"carriers":["Delta Dental PPO","Cigna"]}'), '(b) a plan list is valid');
select pg_temp.vi_assert(public.business_record_fact_valid('insurance_accepted', '{"carriers":["Cigna"],"summary":"Most plans."}'), '(b) a summary is valid');
select pg_temp.vi_assert(not public.business_record_fact_valid('insurance_accepted', '{"carriers":["Delta","delta"]}'), '(b) repeats in any case are refused');
select pg_temp.vi_assert(not public.business_record_fact_valid('insurance_accepted', '{"carriers":[]}'), '(b) an empty list is refused');
select pg_temp.vi_assert(not public.business_record_fact_valid('insurance_accepted', '{"carriers":["x"],"extra":1}'), '(b) unknown keys are refused');
select pg_temp.vi_assert(not public.business_record_fact_valid('insurance_accepted', jsonb_build_object('carriers', (select jsonb_agg('p' || n) from generate_series(1,61) n))), '(b) 61 plans are refused');
select pg_temp.vi_assert(public.business_record_fact_valid('phone', '"716-555-0100"'), '(b) other keys still use the old rules');
select pg_temp.vi_assert(not public.business_record_fact_valid('phone', '"12"'), '(b) other keys still refuse bad values');
select pg_temp.vi_assert(not exists (
  select 1 from pg_constraint c where c.contype = 'c' and pg_get_constraintdef(c.oid) like '%business_record_fact_valid_before_insurance(%'),
  '(b) no CHECK constraint still calls the renamed validator');
select pg_temp.vi_assert((select count(*) from pg_constraint c where c.contype = 'c' and pg_get_constraintdef(c.oid) like '%business_record_fact_valid(%') >= 2,
  '(b) the facts table and the inquiry fact proposals call the wrapper');
select pg_temp.vi_assert((select pg_get_constraintdef(oid) from pg_constraint where conname = 'business_record_facts_fact_key_check') like '%insurance_accepted%',
  '(b) the fact key check lists insurance_accepted');

insert into public.users(id, email, verified_at) values ('28100500-0000-4000-8000-000000000001', 'vi-owner@example.test', now());
insert into public.workspaces(id, kind, name, created_by) values ('28100500-0000-4000-8000-000000000010', 'customer', 'North Dental', '28100500-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('28100500-0000-4000-8000-000000000010', '28100500-0000-4000-8000-000000000001', 'owner', '28100500-0000-4000-8000-000000000001');
select pg_temp.vi_refuse($$insert into public.business_record_facts(workspace_id, fact_key, value, source, verified, updated_by, updated_at)
  values ('28100500-0000-4000-8000-000000000010', 'insurance_accepted', '{"carriers":["A","a"]}', 'owner', true, '28100500-0000-4000-8000-000000000001', now())$$, 'violates check constraint');
select public.patch_business_record('28100500-0000-4000-8000-000000000010', '28100500-0000-4000-8000-000000000001', 'vi-owner@example.test', 'owner', 0,
  '{"facts":{"insurance_accepted":{"value":{"carriers":["Delta Dental PPO","Cigna"]},"verified":true}}}', gen_random_uuid(), repeat('a', 64));
select pg_temp.vi_assert((select value->'carriers'->>0 from public.business_record_facts where workspace_id = '28100500-0000-4000-8000-000000000010' and fact_key = 'insurance_accepted') = 'Delta Dental PPO',
  '(b) an owner can record the plans');
select pg_temp.vi_assert((public.business_confirmed_public_facts('28100500-0000-4000-8000-000000000010') #> '{facts,insurance_accepted,carriers,1}') = '"Cigna"',
  '(b) business_confirmed_public_facts already carries it');
select pg_temp.vi_assert(not exists (select 1 from public.business_policies where workspace_id = '28100500-0000-4000-8000-000000000010' and policy_key = 'insurance_accepted'),
  '(b) it is not a policy');


-- ---- (c) grants ----
select pg_temp.vi_assert(not has_table_privilege('service_role', 'public.app_intake_installs', 'select')
  and not has_table_privilege('service_role', 'public.app_intake_releases', 'select')
  and not has_table_privilege('service_role', 'public.app_intake_submissions', 'select')
  and not has_table_privilege('service_role', 'public.app_intake_sensitive', 'select')
  and not has_table_privilege('authenticated', 'public.app_intake_sensitive', 'select')
  and not has_table_privilege('anon', 'public.app_intake_sensitive_reads', 'select'), '(c) no table privilege for any role');
select pg_temp.vi_assert((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.proname = any(array['read_app_intake','save_app_intake_draft','request_app_intake_live','pause_app_intake','read_app_intake_sensitive',
      'make_app_intake_live','withdraw_app_intake_live_request','list_app_intake_live_requests','record_app_intake_live_check','resolve_public_app_intake',
      'record_app_intake_submission','list_open_app_intake_visits','read_app_intake_visit','decide_app_intake_visit','purge_app_intake_sensitive'])
    and has_function_privilege('service_role', p.oid, 'execute') and not has_function_privilege('authenticated', p.oid, 'execute')
    and not has_function_privilege('anon', p.oid, 'execute')) = 15, '(c) 15 RPCs, service_role only');
select pg_temp.vi_assert(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.proname in ('app_intake_json','app_intake_assert_writer','app_intake_assert_customer_role','app_intake_config_valid','app_intake_visit_json')
    and (has_function_privilege('service_role', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))), '(c) helpers have no grants');
select pg_temp.vi_assert((select bool_and(relrowsecurity) from pg_class where relname in ('app_intake_installs','app_intake_releases','app_intake_submissions','app_intake_sensitive','app_intake_sensitive_reads')), '(c) RLS on all five tables');
select pg_temp.vi_assert((select bool_and(provolatile = 'v') from pg_proc where proname in ('read_app_intake','read_app_intake_sensitive','save_app_intake_draft','make_app_intake_live')),
  '(c) the actor-checked RPCs are volatile: assert_actor takes a row lock');

-- ---- seed ----
insert into public.users(id, email, verified_at) values
 ('28100500-0000-4000-8000-000000000002', 'vi-admin@example.test', now()),
 ('28100500-0000-4000-8000-000000000003', 'vi-member@example.test', now()),
 ('28100500-0000-4000-8000-000000000004', 'vi-outsider@example.test', now()),
 ('28100500-0000-4000-8000-000000000005', 'vi-operator@example.test', now());
insert into public.super_admins(user_id, email) values ('28100500-0000-4000-8000-000000000005', 'vi-operator@example.test');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
 ('28100500-0000-4000-8000-000000000010', '28100500-0000-4000-8000-000000000002', 'admin', '28100500-0000-4000-8000-000000000001'),
 ('28100500-0000-4000-8000-000000000010', '28100500-0000-4000-8000-000000000003', 'member', '28100500-0000-4000-8000-000000000001');
insert into public.connected_sites(id, business_workspace_id, public_key, label, site_url, site_host, allowed_origins, verification_token, created_by)
  values ('28100500-0000-4000-8000-0000000000b2', '28100500-0000-4000-8000-000000000010', 'sk_pub_' || repeat('a', 24), 'Site', 'https://north.example.test',
    'north.example.test', array['https://north.example.test'], repeat('a', 32), '28100500-0000-4000-8000-000000000001');
update public.connected_sites set verified_at = now(), verified_by = '28100500-0000-4000-8000-000000000001' where id = '28100500-0000-4000-8000-0000000000b2';
set local role service_role;

-- ---- (d) draft, revision and writer checks ----
select pg_temp.vi_refuse($$select public.save_app_intake_draft('28100500-0000-4000-8000-000000000010', '28100500-0000-4000-8000-000000000003', 'vi-member@example.test', 'dental_intake', '{}', 0)$$, 'business_record_access_denied');
select pg_temp.vi_refuse($$select public.save_app_intake_draft('28100500-0000-4000-8000-000000000010', '28100500-0000-4000-8000-000000000004', 'vi-outsider@example.test', 'dental_intake', '{}', 0)$$, 'business_record_access_denied');
select pg_temp.vi_refuse($$select public.save_app_intake_draft('28100500-0000-4000-8000-000000000010', '28100500-0000-4000-8000-000000000002', 'wrong@example.test', 'dental_intake', '{}', 0)$$, 'business_record_access_denied');
select pg_temp.vi_refuse($$select public.save_app_intake_draft('28100500-0000-4000-8000-000000000010', '28100500-0000-4000-8000-000000000002', 'vi-admin@example.test', 'dental_intake', '{"surprise":1}', 0)$$, 'app_intake_invalid');
select pg_temp.vi_refuse($$select public.save_app_intake_draft('28100500-0000-4000-8000-000000000010', '28100500-0000-4000-8000-000000000002', 'vi-admin@example.test', 'dental_intake', '{}', 3)$$, 'app_intake_conflict');
select pg_temp.vi_refuse($$select public.request_app_intake_live('28100500-0000-4000-8000-000000000010', '28100500-0000-4000-8000-000000000002', 'vi-admin@example.test', 'dental_intake')$$, 'app_intake_not_found');
select pg_temp.vi_assert((public.save_app_intake_draft('28100500-0000-4000-8000-000000000010', '28100500-0000-4000-8000-000000000002', 'vi-admin@example.test', 'dental_intake',
  '{"bookingServiceId":null,"collectMemberId":false,"pageUrl":null,"formLabel":"Send"}', 0)->>'draftRevision')::int = 1, '(d) the first save is revision 1');
select pg_temp.vi_refuse($$select public.save_app_intake_draft('28100500-0000-4000-8000-000000000010', '28100500-0000-4000-8000-000000000002', 'vi-admin@example.test', 'dental_intake', '{}', 0)$$, 'app_intake_conflict');
select pg_temp.vi_assert((public.save_app_intake_draft('28100500-0000-4000-8000-000000000010', '28100500-0000-4000-8000-000000000002', 'vi-admin@example.test', 'dental_intake',
  '{"collectMemberId":true}', 1)->>'draftRevision')::int = 2, '(d) a later save bumps the revision');
select pg_temp.vi_refuse($$select public.pause_app_intake('28100500-0000-4000-8000-000000000010', '28100500-0000-4000-8000-000000000002', 'vi-admin@example.test', 'dental_intake', false)$$, 'app_intake_never_live');

-- ---- (e) go live: only the actual owner, once per decision, never against a stale draft ----
select public.request_app_intake_live('28100500-0000-4000-8000-000000000010', '28100500-0000-4000-8000-000000000002', 'vi-admin@example.test', 'dental_intake');
select pg_temp.vi_assert(jsonb_array_length(public.list_app_intake_live_requests('28100500-0000-4000-8000-000000000010')->'requests') = 1, '(e) the request is listed');
select pg_temp.vi_assert(public.list_app_intake_live_requests('28100500-0000-4000-8000-000000000010')->'facts' ? 'insurance_accepted', '(e) the list carries the confirmed facts');
select pg_temp.vi_refuse($$select public.make_app_intake_live('28100500-0000-4000-8000-000000000010', pg_temp.vi_install(), 2, '28100500-0000-4000-8000-0000000000d1', '28100500-0000-4000-8000-000000000002', 'vi-admin@example.test')$$, 'workspace_access_denied');
select pg_temp.vi_refuse($$select public.make_app_intake_live('28100500-0000-4000-8000-000000000010', pg_temp.vi_install(), 1, '28100500-0000-4000-8000-0000000000d1', '28100500-0000-4000-8000-000000000001', 'vi-owner@example.test')$$, 'app_intake_conflict');
select pg_temp.vi_assert(public.resolve_public_app_intake('sk_pub_' || repeat('a', 24), 'dental_intake') is null, '(e) nothing resolves before it is live');
select pg_temp.vi_assert((public.make_app_intake_live('28100500-0000-4000-8000-000000000010', pg_temp.vi_install(), 2, '28100500-0000-4000-8000-0000000000d1', '28100500-0000-4000-8000-000000000001', 'vi-owner@example.test')->>'release')::int = 1, '(e) Release 1');
select pg_temp.vi_assert((public.make_app_intake_live('28100500-0000-4000-8000-000000000010', pg_temp.vi_install(), 2, '28100500-0000-4000-8000-0000000000d1', '28100500-0000-4000-8000-000000000001', 'vi-owner@example.test')->>'release')::int = 1, '(e) the same decision is idempotent');
select pg_temp.vi_assert(pg_temp.vi_q('select count(*) from public.app_intake_releases') = '1', '(e) one Release row');
select pg_temp.vi_assert((public.resolve_public_app_intake('sk_pub_' || repeat('a', 24), 'dental_intake')->>'release')::int = 1
  and (public.resolve_public_app_intake('sk_pub_' || repeat('a', 24), 'dental_intake')->'config'->>'collectMemberId') = 'true', '(e) the public form resolves from the Release');
select pg_temp.vi_assert(public.resolve_public_app_intake('sk_pub_' || repeat('b', 24), 'dental_intake') is null, '(e) an unknown key resolves to nothing');
select pg_temp.vi_refuse($$update public.app_intake_releases set config = '{}'$$, 'permission denied');
reset role;
select pg_temp.vi_refuse($$update public.app_intake_releases set config = '{}'$$, 'app_intake_release_immutable');
set local role service_role;
-- A later draft edit does not change the Release that is live.
select public.save_app_intake_draft('28100500-0000-4000-8000-000000000010', '28100500-0000-4000-8000-000000000002', 'vi-admin@example.test', 'dental_intake', '{"collectMemberId":false}', 2);
select pg_temp.vi_assert((public.resolve_public_app_intake('sk_pub_' || repeat('a', 24), 'dental_intake')->'config'->>'collectMemberId') = 'true', '(e) the live Release does not follow the draft');

-- ---- (f) a public submission ----
select pg_temp.vi_refuse($$select public.record_app_intake_submission('sk_pub_' || repeat('a', 24), 'https://evil.example.test', 'dental_intake', gen_random_uuid(), '{}', 'routine', '[]')$$, 'connected_site_origin_denied');
select pg_temp.vi_assert((public.record_connected_site_inquiry_v2('sk_pub_' || repeat('a', 24), 'https://north.example.test', jsonb_build_object(
  'leadId', 'lead_intake_one', 'submissionHash', 'h1', 'name', 'Pat Lee', 'email', 'pat@example.test', 'message', 'New patient · Checkup and cleaning',
  'source', 'app:dental_intake', 'fields', jsonb_build_object('phone', '716 555 0111', 'triage', 'routine'), 'capturedAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))->>'status') = 'recorded', '(f) the lead lands in tenant_leads');
select pg_temp.vi_refuse($$select public.record_app_intake_submission('sk_pub_' || repeat('a', 24), 'https://north.example.test', 'dental_intake', gen_random_uuid(), '{}', 'routine', '[]')$$, 'connected_site_invalid');
select pg_temp.vi_refuse($$select public.record_app_intake_submission('sk_pub_' || repeat('a', 24), 'https://north.example.test', 'dental_intake', pg_temp.vi_lead('lead_intake_one'), '{}', 'maybe', '[]')$$, 'connected_site_invalid');
select pg_temp.vi_refuse($$select public.record_app_intake_submission('sk_pub_' || repeat('a', 24), 'https://north.example.test', 'dental_intake', pg_temp.vi_lead('lead_intake_one'), '{}', 'routine',
  '[{"fieldId":"insurance_member_id","ciphertext":"plain text"}]')$$, 'connected_site_invalid');
-- The live Release says collectMemberId is true, so one ciphertext is accepted.
select pg_temp.vi_assert((public.record_app_intake_submission('sk_pub_' || repeat('a', 24), 'https://north.example.test', 'dental_intake', pg_temp.vi_lead('lead_intake_one'),
  '{"reason":"checkup","patient_status":"new","preferred_days":"tue,thu"}', 'routine', '[{"fieldId":"insurance_member_id","ciphertext":"enc:v1:abcdef"}]')->>'status') = 'recorded', '(f) the submission is recorded');
select pg_temp.vi_assert((public.record_app_intake_submission('sk_pub_' || repeat('a', 24), 'https://north.example.test', 'dental_intake', pg_temp.vi_lead('lead_intake_one'),
  '{}', 'routine', '[]')->>'status') = 'exists', '(f) a second call for the same lead is a no-op');
select pg_temp.vi_assert(pg_temp.vi_q('select count(*) from public.app_intake_submissions') = '1', '(f) one submission row');
select pg_temp.vi_assert(pg_temp.vi_q('select count(*) from public.tenant_leads where fields::text like ''%enc:v1:%'' or message like ''%enc:v1:%''') = '0', '(f) no ciphertext in the lead');
-- A Release without member IDs refuses a sensitive value.
reset role;
update public.app_intake_installs set status = 'paused';
set local role service_role;
select pg_temp.vi_assert(public.resolve_public_app_intake('sk_pub_' || repeat('a', 24), 'dental_intake') is null, '(f) paused resolves to nothing');
select pg_temp.vi_refuse($$select public.record_app_intake_submission('sk_pub_' || repeat('a', 24), 'https://north.example.test', 'dental_intake', pg_temp.vi_lead('lead_intake_one'), '{}', 'routine', '[]')$$, 'app_intake_unavailable');
select public.pause_app_intake('28100500-0000-4000-8000-000000000010', '28100500-0000-4000-8000-000000000001', 'vi-owner@example.test', 'dental_intake', false);
select pg_temp.vi_assert(public.resolve_public_app_intake('sk_pub_' || repeat('a', 24), 'dental_intake') is not null, '(f) unpausing resolves again');

-- ---- (g) reads, sensitive audit ----
select pg_temp.vi_assert((public.read_app_intake('28100500-0000-4000-8000-000000000010', '28100500-0000-4000-8000-000000000003', 'vi-member@example.test', 'dental_intake')->'submissions'->0->>'hasSensitive') = 'true', '(g) a member sees that there is a value');
select pg_temp.vi_assert(public.read_app_intake('28100500-0000-4000-8000-000000000010', '28100500-0000-4000-8000-000000000003', 'vi-member@example.test', 'dental_intake')::text not like '%enc:v1:%', '(g) the read never carries ciphertext');
select pg_temp.vi_refuse($$select public.read_app_intake('28100500-0000-4000-8000-000000000010', '28100500-0000-4000-8000-000000000004', 'vi-outsider@example.test', 'dental_intake')$$, 'business_record_access_denied');
select pg_temp.vi_refuse($$select public.read_app_intake_sensitive('28100500-0000-4000-8000-000000000010', '28100500-0000-4000-8000-000000000003', 'vi-member@example.test', pg_temp.vi_submission())$$, 'workspace_access_denied');
select pg_temp.vi_refuse($$select public.read_app_intake_sensitive('28100500-0000-4000-8000-000000000010', '28100500-0000-4000-8000-000000000005', 'vi-operator@example.test', pg_temp.vi_submission())$$, 'workspace_access_denied');
select pg_temp.vi_assert(pg_temp.vi_q('select count(*) from public.app_intake_sensitive_reads') = '0', '(g) refused reads leave no audit row');
select pg_temp.vi_assert(public.read_app_intake_sensitive('28100500-0000-4000-8000-000000000010', '28100500-0000-4000-8000-000000000002', 'vi-admin@example.test', pg_temp.vi_submission())->0->>'ciphertext' = 'enc:v1:abcdef', '(g) an admin member can read it');
select pg_temp.vi_assert(pg_temp.vi_q('select count(*) from public.app_intake_sensitive_reads where user_id = ''28100500-0000-4000-8000-000000000002'' and field_ids = array[''insurance_member_id'']') = '1', '(g) the read is audited');
select pg_temp.vi_refuse($$select public.read_app_intake_sensitive('28100500-0000-4000-8000-000000000010', '28100500-0000-4000-8000-000000000001', 'vi-owner@example.test', gen_random_uuid())$$, 'app_intake_not_found');

-- ---- (h) visits ----
select pg_temp.vi_assert(jsonb_array_length(public.list_open_app_intake_visits('28100500-0000-4000-8000-000000000010')->'visits') = 1, '(h) one open visit');
select pg_temp.vi_assert((public.list_open_app_intake_visits('28100500-0000-4000-8000-000000000010')->'visits'->0->>'phone') = '716 555 0111'
  and public.list_open_app_intake_visits('28100500-0000-4000-8000-000000000010')->'facts' ? 'insurance_accepted', '(h) the visit carries the phone and the facts');
select pg_temp.vi_assert(public.read_app_intake_visit('28100500-0000-4000-8000-000000000010', pg_temp.vi_submission()) ? 'facts', '(h) a single visit carries the facts');
select pg_temp.vi_assert(public.read_app_intake_visit('28100500-0000-4000-8000-000000000011', pg_temp.vi_submission()) is null, '(h) another business sees nothing');
select pg_temp.vi_refuse($$select public.decide_app_intake_visit('28100500-0000-4000-8000-000000000010', pg_temp.vi_submission(), 'maybe', null, gen_random_uuid())$$, 'app_intake_invalid');
select pg_temp.vi_assert((public.decide_app_intake_visit('28100500-0000-4000-8000-000000000010', pg_temp.vi_submission(), 'visit_booked', '28100500-0000-4000-8000-0000000000e1', '28100500-0000-4000-8000-0000000000f1')->>'state') = 'visit_booked', '(h) approved');
select pg_temp.vi_assert((public.decide_app_intake_visit('28100500-0000-4000-8000-000000000010', pg_temp.vi_submission(), 'visit_booked', '28100500-0000-4000-8000-0000000000e1', '28100500-0000-4000-8000-0000000000f1')->>'state') = 'visit_booked', '(h) the same decision is idempotent');
select pg_temp.vi_refuse($$select public.decide_app_intake_visit('28100500-0000-4000-8000-000000000010', pg_temp.vi_submission(), 'not_booked', null, gen_random_uuid())$$, 'app_intake_conflict');
select pg_temp.vi_assert(jsonb_array_length(public.list_open_app_intake_visits('28100500-0000-4000-8000-000000000010')->'visits') = 0, '(h) decided visits leave the list');

-- ---- (i) live check, purge ----
select public.record_app_intake_live_check(pg_temp.vi_install(), '{"state":"found","checkedAt":"2026-10-20T00:00:00Z","url":"https://north.example.test","release":1}');
select pg_temp.vi_refuse($$select public.record_app_intake_live_check(pg_temp.vi_install(), '[]')$$, 'app_intake_invalid');
select pg_temp.vi_assert(public.purge_app_intake_sensitive(100) = 0, '(i) nothing is due yet');
reset role;
update public.app_intake_sensitive set purge_after = clock_timestamp() - interval '1 second';
set local role service_role;
select pg_temp.vi_assert(public.read_app_intake_sensitive('28100500-0000-4000-8000-000000000010', '28100500-0000-4000-8000-000000000001', 'vi-owner@example.test', pg_temp.vi_submission()) = '[]'::jsonb, '(i) an expired value reads as gone before the purge runs');
select pg_temp.vi_assert(public.purge_app_intake_sensitive(100) = 1, '(i) the purge removes the expired value');
select pg_temp.vi_assert(pg_temp.vi_q('select count(*) from public.app_intake_sensitive') = '0', '(i) no ciphertext remains');
select pg_temp.vi_assert(pg_temp.vi_q('select count(*) from public.app_intake_submissions') = '1', '(i) the submission itself stays');
reset role;

-- ---- (j) the Events outbox sees an intake as an ordinary inquiry (no data of its own) ----
select pg_temp.vi_assert(to_regclass('public.app_events') is not null, '(j) app_events exists in this stack');
select set_config('request.jwt.claim.sub', '', true);
set local role service_role;
select public.set_app_event_capture('vi-operator@example.test', true, 'Fixture turns capture on');
reset role;
select pg_temp.vi_assert((public.record_connected_site_inquiry_v2('sk_pub_' || repeat('a', 24), 'https://north.example.test', jsonb_build_object(
  'leadId', 'lead_intake_two', 'submissionHash', 'h2', 'name', 'Sam Roe', 'email', 'sam@example.test', 'message', 'Returning patient',
  'source', 'app:dental_intake', 'fields', jsonb_build_object('phone', '716 555 0122', 'reason', 'urgent'), 'capturedAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))->>'status') = 'recorded', '(j) a second intake lead');
select pg_temp.vi_assert((select count(*) from public.app_events where workspace_id = '28100500-0000-4000-8000-000000000010' and type = 'inquiry.received') = 1, '(j) exactly one inquiry.received');
select pg_temp.vi_assert((select payload->>'source' from public.app_events where workspace_id = '28100500-0000-4000-8000-000000000010' and type = 'inquiry.received') = 'app:dental_intake', '(j) its source is app:dental_intake');
select pg_temp.vi_assert((select not (payload ? 'name' or payload ? 'email' or payload ? 'phone' or payload ? 'answers' or payload ? 'message' or payload ? 'fields')
  from public.app_events where workspace_id = '28100500-0000-4000-8000-000000000010' and type = 'inquiry.received'), '(j) the event has no name, email, phone or answers');

rollback;
