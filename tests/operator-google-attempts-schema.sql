\set ON_ERROR_STOP on
-- Local fictional effects only. Every fixture and receipt is rolled back.
begin;
create function pg_temp.google_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'Google attempt assertion failed: %', message; end if; end;
$$;
create function pg_temp.google_error(command text) returns text language plpgsql as $$
begin execute command; return 'no error'; exception when others then return sqlerrm; end;
$$;
create function pg_temp.google_receipt(tenant text, acceptance text, payload jsonb) returns jsonb language sql as $$
  select jsonb_build_object('tenantId', tenant, 'provider', 'google_business', 'writeKind', 'gbp_post',
    'subject', 'Fictional Google post', 'request', payload, 'acceptance', acceptance,
    'undo', 'not_available', 'undoLabel', 'No undo available.', 'actor', 'fixture operator');
$$;

select pg_temp.google_assert(
  (select relrowsecurity from pg_class where oid='public.operator_google_write_attempts'::regclass)
  and not has_table_privilege('anon','public.operator_google_write_attempts','SELECT')
  and not has_table_privilege('authenticated','public.operator_google_write_attempts','SELECT')
  and not has_table_privilege('service_role','public.operator_google_write_attempts','SELECT')
  and has_function_privilege('service_role','public.begin_operator_google_write(jsonb)','EXECUTE')
  and has_function_privilege('service_role','public.complete_operator_google_write(uuid,jsonb)','EXECUTE')
  and has_function_privilege('service_role','public.read_operator_google_uncertainty(uuid,text)','EXECUTE')
  and not has_function_privilege('anon','public.begin_operator_google_write(jsonb)','EXECUTE')
  and not has_function_privilege('authenticated','public.begin_operator_google_write(jsonb)','EXECUTE')
  and not has_function_privilege('anon','public.complete_operator_google_write(uuid,jsonb)','EXECUTE')
  and not has_function_privilege('authenticated','public.complete_operator_google_write(uuid,jsonb)','EXECUTE')
  and not has_function_privilege('anon','public.read_operator_google_uncertainty(uuid,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.read_operator_google_uncertainty(uuid,text)','EXECUTE'),
  'RLS closes direct storage and only service role reaches actor-checked commands');

insert into public.users(id,email,verified_at) values
  ('ea610000-0000-4000-8000-000000000001','google-attempt-operator@example.test',now()),
  ('ea610000-0000-4000-8000-000000000002','google-attempt-owner@example.test',now()),
  ('ea610000-0000-4000-8000-000000000003','google-attempt-revoked@example.test',now());
insert into public.super_admins(user_id,email) values
  ('ea610000-0000-4000-8000-000000000001','google-attempt-operator@example.test');
insert into public.super_admins(user_id,email,revoked_at) values
  ('ea610000-0000-4000-8000-000000000003','google-attempt-revoked@example.test',now());
insert into public.tenants(id,site_name,active,stable_id) values
  ('google-attempt-alpha','Fictional Google Alpha',true,'aa610000-0000-4000-8000-000000000010'),
  ('google-attempt-beta','Fictional Google Beta',true,'aa610000-0000-4000-8000-000000000011');

do $$
declare
  command jsonb; claim jsonb; replay jsonb; receipt jsonb; retried jsonb;
  status text; attempt uuid; first_receipt uuid; evidence jsonb;
begin
  foreach status in array array['pending','accepted','unknown','rejected'] loop
    command := jsonb_build_object('commandKey','google-fixture:'||status, 'tenantId','google-attempt-alpha',
      'writeKind','gbp_post', 'request',jsonb_build_object('summary','Fictional '||status));
    claim := public.begin_operator_google_write(command);
    attempt := (claim->>'attemptId')::uuid;
    perform pg_temp.google_assert((claim->>'claimed')::boolean and claim->>'acceptance'='pending',status||' begins with one reserved dispatch');
    replay := public.begin_operator_google_write(command);
    perform pg_temp.google_assert(not (replay->>'claimed')::boolean and replay->>'attemptId'=attempt::text,
      status||' pending reservation cannot replay');

    perform pg_temp.google_assert(pg_temp.google_error(format('select public.begin_operator_google_write(%L::jsonb)',
      command||jsonb_build_object('tenantId','google-attempt-beta')))='outside_write_receipt_conflict','same key cannot change tenant');
    perform pg_temp.google_assert(pg_temp.google_error(format('select public.begin_operator_google_write(%L::jsonb)',
      command||jsonb_build_object('request',jsonb_build_object('summary','Another payload'))))='outside_write_receipt_conflict','same key cannot change payload');
    perform pg_temp.google_assert(pg_temp.google_error(format('select public.complete_operator_google_write(%L::uuid,%L::jsonb)', attempt,
      pg_temp.google_receipt('google-attempt-beta','accepted',command->'request')))='outside_write_receipt_conflict','settlement cannot change tenant');
    perform pg_temp.google_assert(pg_temp.google_error(format('select public.complete_operator_google_write(%L::uuid,%L::jsonb)', attempt,
      pg_temp.google_receipt('google-attempt-alpha','accepted','{"summary":"Wrong payload"}'::jsonb)))='outside_write_receipt_conflict','settlement must match reserved payload');

    if status <> 'pending' then
      receipt := public.complete_operator_google_write(attempt,pg_temp.google_receipt('google-attempt-alpha',status,command->'request'));
      first_receipt := (receipt->>'id')::uuid;
      perform pg_temp.google_assert(receipt->>'acceptance'=status,'settlement preserves provider acceptance');
      perform pg_temp.google_assert(public.complete_operator_google_write(attempt,
        pg_temp.google_receipt('google-attempt-alpha',status,command->'request'))->>'id'=first_receipt::text,'same settlement returns one receipt');
      replay := public.begin_operator_google_write(command);
      if status = 'rejected' then
        perform pg_temp.google_assert((replay->>'claimed')::boolean and replay->>'attemptId'<>attempt::text
          and replay->>'acceptance'='pending','only an explicit rejection reserves a new attempt');
        perform pg_temp.google_assert((select acceptance='rejected' from public.outside_write_receipts where id=first_receipt),
          'retry retains the rejected receipt');
        perform pg_temp.google_assert(pg_temp.google_error(format('select public.complete_operator_google_write(%L::uuid,%L::jsonb)',attempt,
          pg_temp.google_receipt('google-attempt-alpha','accepted',command->'request')))='outside_write_receipt_invalid','old rejected attempt cannot settle its replacement');
        retried := public.complete_operator_google_write((replay->>'attemptId')::uuid,
          pg_temp.google_receipt('google-attempt-alpha','accepted',command->'request'));
        perform pg_temp.google_assert(retried->>'id'<>first_receipt::text and (select count(*) from public.outside_write_receipts
          where tenant_id='google-attempt-alpha' and request=command->'request')=2,'rejected and accepted attempts retain separate receipts');
      else
        perform pg_temp.google_assert(not (replay->>'claimed')::boolean and replay->>'attemptId'=attempt::text
          and replay->'receipt'->>'id'=first_receipt::text,status||' dispatch never replays');
      end if;
      if status='accepted' then
        perform pg_temp.google_assert(receipt->>'readback'='pending','acceptance is not verification');
        perform pg_temp.google_assert(public.record_outside_write_readback(first_receipt,'matched','Fictional provider read-back matched')->>'readback'='matched',
          'read-back settles independently of provider acceptance');
        replay := public.begin_operator_google_write(command);
        perform pg_temp.google_assert(not (replay->>'claimed')::boolean and replay->'receipt'->>'readback'='matched','verified receipt still cannot resend');
      end if;
    end if;
  end loop;

  evidence := public.read_operator_google_uncertainty('ea610000-0000-4000-8000-000000000001','google-attempt-operator@example.test');
  perform pg_temp.google_assert((select count(*) from jsonb_array_elements(evidence) item where item->>'tenantId'='google-attempt-alpha')=3,
    'uncertainty includes pending, unknown and accepted without read-back; verified write is absent');
  perform pg_temp.google_assert(not exists(select 1 from jsonb_array_elements(evidence) item where item->>'acceptance'='rejected'),
    'rejected effects are not uncertain acceptance');
end;
$$;

select pg_temp.google_assert(pg_temp.google_error($q$select public.read_operator_google_uncertainty('ea610000-0000-4000-8000-000000000002','google-attempt-owner@example.test')$q$)='operator_queue_access_denied','owner is not an operator');
select pg_temp.google_assert(pg_temp.google_error($q$select public.read_operator_google_uncertainty('ea610000-0000-4000-8000-000000000003','google-attempt-revoked@example.test')$q$)='operator_queue_access_denied','revoked operator cannot read uncertainty');
select pg_temp.google_assert(pg_temp.google_error($q$select public.read_operator_google_uncertainty('ea610000-0000-4000-8000-000000000001','google-attempt-owner@example.test')$q$)='operator_queue_access_denied','verified email must match operator identity');
rollback;
