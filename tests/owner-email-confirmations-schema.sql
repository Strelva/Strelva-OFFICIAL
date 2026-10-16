\set ON_ERROR_STOP on
-- Owner email confirmations (20261028120000) on fictional rows: only service_role
-- reads or writes them, only an operator confirms, an address on file is not a
-- confirmation, a staff address never is, revoke ends it, and the business's
-- own signed-in owner counts. Runs inside a transaction that is rolled back.
begin;
create or replace function pg_temp.oc_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'owner email confirmation assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.oc_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

select pg_temp.oc_assert(
  has_function_privilege('service_role', 'public.owner_email_confirmed(uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.confirm_owner_email(uuid,text,uuid,text,text)', 'execute')
  and has_function_privilege('service_role', 'public.revoke_owner_email_confirmation(uuid,text,uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.owner_email_confirmed(uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.confirm_owner_email(uuid,text,uuid,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.revoke_owner_email_confirmation(uuid,text,uuid,text)', 'execute')
  and not has_table_privilege('authenticated', 'public.owner_email_confirmations', 'select')
  and not has_table_privilege('anon', 'public.owner_email_confirmations', 'select'),
  'only service_role runs the confirmation functions and nobody reads the table directly');

insert into public.users(id, email, verified_at) values
  ('0c000000-0000-4000-8000-000000000001', 'op@oc-platform.example.test', now()),
  ('0c000000-0000-4000-8000-000000000002', 'owner@oc-bakery.example.test', now()),
  ('0c000000-0000-4000-8000-000000000003', 'unverified@oc-bakery.example.test', null),
  ('0c000000-0000-4000-8000-000000000004', 'member@oc-bakery.example.test', now());
insert into public.super_admins(user_id, email) values ('0c000000-0000-4000-8000-000000000001', 'op@oc-platform.example.test');
insert into public.workspaces(id, kind, name, created_by) values
  ('0c000000-0000-4000-8000-000000000011', 'customer', 'OC Bakery', '0c000000-0000-4000-8000-000000000002'),
  ('0c000000-0000-4000-8000-000000000012', 'customer', 'OC Florist', '0c000000-0000-4000-8000-000000000002');

-- Nothing is confirmed by being on file.
select pg_temp.oc_assert(not public.owner_email_confirmed('0c000000-0000-4000-8000-000000000012', 'contact@oc-florist.example.test'), 'an address on file is not confirmed');
select pg_temp.oc_assert(not public.owner_email_confirmed(null, 'contact@oc-florist.example.test'), 'no business, no confirmation');
select pg_temp.oc_assert(not public.owner_email_confirmed('0c000000-0000-4000-8000-000000000012', 'not an address'), 'malformed address');

-- Only an operator confirms, with a note, for a real business.
select pg_temp.oc_expect($$select public.confirm_owner_email('0c000000-0000-4000-8000-000000000002', 'owner@oc-bakery.example.test',
  '0c000000-0000-4000-8000-000000000012', 'contact@oc-florist.example.test', 'self')$$, 'owner_email_confirmation_operator_required');
select pg_temp.oc_expect($$select public.confirm_owner_email('0c000000-0000-4000-8000-000000000001', 'op@oc-platform.example.test',
  '0c000000-0000-4000-8000-000000000012', 'contact@oc-florist.example.test', '  ')$$, 'owner_email_confirmation_note_required');
select pg_temp.oc_expect($$select public.confirm_owner_email('0c000000-0000-4000-8000-000000000001', 'op@oc-platform.example.test',
  '0c000000-0000-4000-8000-0000000000ff', 'contact@oc-florist.example.test', 'phone')$$, 'owner_email_confirmation_business_unknown');
select pg_temp.oc_expect($$select public.confirm_owner_email('0c000000-0000-4000-8000-000000000001', 'op@oc-platform.example.test',
  '0c000000-0000-4000-8000-000000000012', 'someone@oc-platform.example.test', 'phone')$$, 'owner_email_confirmation_staff_address');

create temporary table oc_ids on commit drop as
  select public.confirm_owner_email('0c000000-0000-4000-8000-000000000001', 'op@oc-platform.example.test',
    '0c000000-0000-4000-8000-000000000012', ' Contact@OC-Florist.example.test ', 'Jacob confirmed by phone') as first;
select pg_temp.oc_assert(public.owner_email_confirmed('0c000000-0000-4000-8000-000000000012', 'contact@oc-florist.example.test'), 'confirmed address reads true');
select pg_temp.oc_assert(not public.owner_email_confirmed('0c000000-0000-4000-8000-000000000011', 'contact@oc-florist.example.test'), 'confirmation is per business');
select pg_temp.oc_assert(public.confirm_owner_email('0c000000-0000-4000-8000-000000000001', 'op@oc-platform.example.test',
  '0c000000-0000-4000-8000-000000000012', 'contact@oc-florist.example.test', 'again') = (select first from oc_ids), 'confirming twice keeps one row');

-- Revoke ends it and keeps the history.
select pg_temp.oc_assert(public.revoke_owner_email_confirmation('0c000000-0000-4000-8000-000000000001', 'op@oc-platform.example.test',
  '0c000000-0000-4000-8000-000000000012', 'contact@oc-florist.example.test'), 'revoke finds the row');
select pg_temp.oc_assert(not public.owner_email_confirmed('0c000000-0000-4000-8000-000000000012', 'contact@oc-florist.example.test'), 'revoked reads false');
select pg_temp.oc_assert((select count(*) from public.owner_email_confirmations where workspace_id = '0c000000-0000-4000-8000-000000000012') = 1, 'revoked row is kept');
select pg_temp.oc_expect($$select public.revoke_owner_email_confirmation('0c000000-0000-4000-8000-000000000002', 'owner@oc-bakery.example.test',
  '0c000000-0000-4000-8000-000000000012', 'contact@oc-florist.example.test')$$, 'owner_email_confirmation_operator_required');

-- The business's own verified owner counts; an unverified owner or a plain member does not.
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('0c000000-0000-4000-8000-000000000011', '0c000000-0000-4000-8000-000000000002', 'owner', '0c000000-0000-4000-8000-000000000002'),
  ('0c000000-0000-4000-8000-000000000011', '0c000000-0000-4000-8000-000000000003', 'owner', '0c000000-0000-4000-8000-000000000002'),
  ('0c000000-0000-4000-8000-000000000011', '0c000000-0000-4000-8000-000000000004', 'member', '0c000000-0000-4000-8000-000000000002');
select pg_temp.oc_assert(public.owner_email_confirmed('0c000000-0000-4000-8000-000000000011', 'OWNER@oc-bakery.example.test'), 'signed-in owner counts');
select pg_temp.oc_assert(not public.owner_email_confirmed('0c000000-0000-4000-8000-000000000011', 'unverified@oc-bakery.example.test'), 'unverified owner does not');
select pg_temp.oc_assert(not public.owner_email_confirmed('0c000000-0000-4000-8000-000000000011', 'member@oc-bakery.example.test'), 'a member is not the owner');
select pg_temp.oc_assert(not public.owner_email_confirmed('0c000000-0000-4000-8000-000000000012', 'owner@oc-bakery.example.test'), 'owner of another business does not count');

-- The rows go with the business.
delete from public.workspaces where id = '0c000000-0000-4000-8000-000000000012';
select pg_temp.oc_assert(not exists (select 1 from public.owner_email_confirmations where workspace_id = '0c000000-0000-4000-8000-000000000012'), 'deleted business forgets its confirmations');
rollback;
