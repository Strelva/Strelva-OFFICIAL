\set ON_ERROR_STOP on
-- Agency verification (20261009152000_agency_verifications.sql), on fictional
-- rows: every agency starts unverified for every effect, Strelva's agency
-- included; a platform operator records state with evidence; the latest row
-- per (agency, effect) is the state; history is append-only; self-verification
-- is visible in the record.
-- Runs inside a transaction that is rolled back.
begin;
create or replace function pg_temp.av_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'agency verification assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.av_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

select pg_temp.av_assert((select relrowsecurity from pg_class where oid = 'public.agency_verifications'::regclass), 'rls on');
select pg_temp.av_assert(not has_table_privilege('service_role', 'public.agency_verifications', 'select')
  and not has_table_privilege('authenticated', 'public.agency_verifications', 'insert'), 'no table privileges');
select pg_temp.av_assert(
  has_function_privilege('service_role', 'public.agency_effect_allowed(uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.record_agency_verification(text,uuid,text,text,jsonb,text)', 'execute')
  and has_function_privilege('service_role', 'public.read_agency_verification(uuid,text,uuid)', 'execute')
  and has_function_privilege('service_role', 'public.read_agency_verification_history(text,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.agency_effect_allowed(uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.record_agency_verification(text,uuid,text,text,jsonb,text)', 'execute')
  and not has_function_privilege('service_role', 'public.agency_verification_state(uuid)', 'execute'),
  'service-role functions only');
select pg_temp.av_assert(public.agency_effect_names() = array['publish', 'google', 'email', 'payments'], 'four effects');

insert into public.users(id, email, verified_at) values
  ('5f000000-0000-4000-8000-000000000001', 'av-operator@strelva.example.test', now()),
  ('5f000000-0000-4000-8000-000000000002', 'av-outside-owner@agency.example.test', now()),
  ('5f000000-0000-4000-8000-000000000003', 'av-nobody@example.test', now());
insert into public.super_admins(user_id, email) values ('5f000000-0000-4000-8000-000000000001', 'av-operator@strelva.example.test');
insert into public.workspaces(id, kind, name, created_by) values
  ('5f000000-0000-4000-8000-000000000010', 'agency', 'Strelva agency fixture', '5f000000-0000-4000-8000-000000000001'),
  ('5f000000-0000-4000-8000-000000000020', 'agency', 'Northside Web', '5f000000-0000-4000-8000-000000000002'),
  ('5f000000-0000-4000-8000-000000000030', 'customer', 'Not an agency', '5f000000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-000000000001', 'owner', '5f000000-0000-4000-8000-000000000001'),
  ('5f000000-0000-4000-8000-000000000020', '5f000000-0000-4000-8000-000000000002', 'owner', '5f000000-0000-4000-8000-000000000002');
-- Strelva's agency is designated, which grants no verification.
select public.designate_strelva_agency_workspace('av-operator@strelva.example.test', '5f000000-0000-4000-8000-000000000010');

-- Default: unverified for every effect, for every agency.
select pg_temp.av_assert(not public.agency_effect_allowed('5f000000-0000-4000-8000-000000000010', e)
  and not public.agency_effect_allowed('5f000000-0000-4000-8000-000000000020', e), 'unverified by default: ' || e)
  from unnest(public.agency_effect_names()) e;
select pg_temp.av_assert(not public.agency_effect_allowed(null, 'publish'), 'no agency, not allowed');
select pg_temp.av_assert(not public.agency_effect_allowed('5f000000-0000-4000-8000-000000000030', 'publish'), 'a customer workspace is never allowed');
select pg_temp.av_expect($$select public.agency_effect_allowed('5f000000-0000-4000-8000-000000000010', 'publish_domain')$$, 'agency_effect_unknown');
select pg_temp.av_assert((select bool_and(x->>'status' = 'unverified' and x->>'recorded' = 'false')
  from jsonb_array_elements(public.read_agency_verification('5f000000-0000-4000-8000-000000000001', 'av-operator@strelva.example.test',
    '5f000000-0000-4000-8000-000000000010')->'effects') x), 'Strelva agency reads all four unverified');

-- Only a platform operator records, with evidence to verify and a reason to refuse.
select pg_temp.av_expect($$select public.record_agency_verification('av-outside-owner@agency.example.test', '5f000000-0000-4000-8000-000000000020',
  'publish', 'verified', '{"domainProof":"txt"}', null)$$, 'tenant_conversion_operator_required');
select pg_temp.av_expect($$select public.record_agency_verification('av-operator@strelva.example.test', '5f000000-0000-4000-8000-000000000020',
  'publish', 'verified', '{}', null)$$, 'agency_verification_invalid');
select pg_temp.av_expect($$select public.record_agency_verification('av-operator@strelva.example.test', '5f000000-0000-4000-8000-000000000020',
  'publish', 'unverified', '{}', '  ')$$, 'agency_verification_invalid');
select pg_temp.av_expect($$select public.record_agency_verification('av-operator@strelva.example.test', '5f000000-0000-4000-8000-000000000030',
  'publish', 'verified', '{"domainProof":"txt"}', null)$$, 'agency_verification_invalid');
select pg_temp.av_expect($$select public.record_agency_verification('av-operator@strelva.example.test', '5f000000-0000-4000-8000-000000000020',
  'sms', 'verified', '{"domainProof":"txt"}', null)$$, 'agency_effect_unknown');

-- Strelva's agency through the same record: per effect, and the self-verification shows.
select public.record_agency_verification('av-operator@strelva.example.test', '5f000000-0000-4000-8000-000000000010',
  'publish', 'verified', '{"note":"fixture evidence"}', null);
select pg_temp.av_assert(public.agency_effect_allowed('5f000000-0000-4000-8000-000000000010', 'publish')
  and not public.agency_effect_allowed('5f000000-0000-4000-8000-000000000010', 'email'), 'verified for publish only');
select pg_temp.av_assert((select verifier_is_agency_member from public.agency_verifications
  where agency_workspace_id = '5f000000-0000-4000-8000-000000000010'), 'self-verification is recorded as such');

-- An outside agency, same function, same rule.
select public.record_agency_verification('av-operator@strelva.example.test', '5f000000-0000-4000-8000-000000000020',
  'email', 'verified', '{"note":"fixture evidence"}', null);
select pg_temp.av_assert(public.agency_effect_allowed('5f000000-0000-4000-8000-000000000020', 'email'), 'outside agency verified for email');
select pg_temp.av_assert(not (select verifier_is_agency_member from public.agency_verifications
  where agency_workspace_id = '5f000000-0000-4000-8000-000000000020'), 'not self-verified');
-- Recording the same state again appends nothing; revoking appends.
select public.record_agency_verification('av-operator@strelva.example.test', '5f000000-0000-4000-8000-000000000020',
  'email', 'verified', '{"note":"again"}', null);
select pg_temp.av_assert((select count(*) from public.agency_verifications where agency_workspace_id = '5f000000-0000-4000-8000-000000000020') = 1,
  'same state: no new row');
select public.record_agency_verification('av-operator@strelva.example.test', '5f000000-0000-4000-8000-000000000020',
  'email', 'unverified', '{}', 'Bounce rate over threshold.');
select pg_temp.av_assert(not public.agency_effect_allowed('5f000000-0000-4000-8000-000000000020', 'email'), 'revoked');
select pg_temp.av_assert(jsonb_array_length(public.read_agency_verification_history('av-operator@strelva.example.test',
  '5f000000-0000-4000-8000-000000000020')->'history') = 2, 'history keeps both');
select pg_temp.av_assert((select x->>'reason' from jsonb_array_elements(public.read_agency_verification('5f000000-0000-4000-8000-000000000002',
  'av-outside-owner@agency.example.test', '5f000000-0000-4000-8000-000000000020')->'effects') x where x->>'effect' = 'email')
  = 'Bounce rate over threshold.', 'the agency sees why');

-- Reads: members of the agency only; history: operators only.
select pg_temp.av_expect($$select public.read_agency_verification('5f000000-0000-4000-8000-000000000003', 'av-nobody@example.test',
  '5f000000-0000-4000-8000-000000000020')$$, 'agency_verification_access_denied');
select pg_temp.av_expect($$select public.read_agency_verification_history('av-nobody@example.test',
  '5f000000-0000-4000-8000-000000000020')$$, 'tenant_conversion_operator_required');

-- Append-only.
select pg_temp.av_expect($$update public.agency_verifications set status = 'verified'$$, 'agency_verification_immutable');
select pg_temp.av_expect($$delete from public.agency_verifications$$, 'agency_verification_immutable');

rollback;
