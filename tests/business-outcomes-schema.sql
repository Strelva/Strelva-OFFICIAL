\set ON_ERROR_STOP on
-- Outcome loop per business per month (20261007183000_business_outcomes.sql).
-- Fictional data. Linked figures appear only where the join exists.
begin;
create or replace function pg_temp.oc_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'outcome assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.oc_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

insert into public.users(id, email, verified_at) values
  ('0c000000-0000-4000-8000-000000000001', 'oc-operator@strelva.example.test', now()),
  ('0c000000-0000-4000-8000-000000000004', 'oc-stranger@example.test', now());
insert into public.super_admins(user_id, email) values ('0c000000-0000-4000-8000-000000000001', 'oc-operator@strelva.example.test');
insert into public.tenants(id, stable_id, site_name, active, owner_email) values
  ('oc-law', '0c000000-0000-4000-8000-0000000000a1', 'Mooney Fixture Firm', true, 'owner@law.example.test'),
  ('oc-quiet', '0c000000-0000-4000-8000-0000000000a2', 'Quiet Site', true, null);
create temporary table oc_w(name text primary key, id uuid);
insert into oc_w select 'law', (public.convert_tenant_to_business('oc-operator@strelva.example.test', 'oc-law',
  jsonb_build_object('tenantId', 'oc-law', 'tenantStableId', '0c000000-0000-4000-8000-0000000000a1', 'workspaceName', 'Mooney Fixture Firm',
    'billing', null, 'account', null, 'patch', '{}'::jsonb, 'contacts', '[]'::jsonb), gen_random_uuid(), encode(sha256('oc-1'::bytea), 'hex'))->>'workspaceId')::uuid;
insert into oc_w select 'quiet', (public.convert_tenant_to_business('oc-operator@strelva.example.test', 'oc-quiet',
  jsonb_build_object('tenantId', 'oc-quiet', 'tenantStableId', '0c000000-0000-4000-8000-0000000000a2', 'workspaceName', 'Quiet Site',
    'billing', null, 'account', null, 'patch', '{}'::jsonb, 'contacts', '[]'::jsonb), gen_random_uuid(), encode(sha256('oc-2'::bytea), 'hex'))->>'workspaceId')::uuid;
create or replace function pg_temp.oc(p_name text, p_month date default '2026-09-01') returns jsonb language sql as $$
  select public.business_outcome_month((select id from oc_w where name = p_name), '0c000000-0000-4000-8000-000000000001', 'oc-operator@strelva.example.test', p_month)
$$;

-- A business with no reply times, bookings, reviews or visit tables: plain counts, linked figures null with reasons.
select pg_temp.oc_assert(pg_temp.oc('quiet')#>>'{inquiries,value}' = '0' and pg_temp.oc('quiet')#>'{answered,value}' = 'null'::jsonb
  and pg_temp.oc('quiet')#>>'{answered,reason}' is not null and pg_temp.oc('quiet')#>'{bookingsFromInquiry,value}' = 'null'::jsonb
  and pg_temp.oc('quiet')#>'{visits,value}' = 'null'::jsonb and pg_temp.oc('quiet')#>'{reviews,value}' = 'null'::jsonb, 'nothing claimed without data');

create table public.bookings (id text primary key, tenant_id text not null references public.tenants(id) on update cascade on delete cascade,
  client_name text not null, client_email text not null, status text not null, created_at timestamptz not null default now());
create table public.reviews (id uuid primary key default gen_random_uuid(), tenant_id text not null references public.tenants(id) on update cascade on delete cascade,
  text text not null, source text not null, review_date timestamptz, created_at timestamptz not null default now());
create table public.site_metrics (tenant_id text not null, metric text not null, day text not null, count integer not null);

-- September: 3 inquiries (one in August), 2 answered (1 within a day), 3 bookings (2 from an inquiry), 2 reviews, 412 visits.
select public.record_tenant_lead('oc-law', jsonb_build_object('leadId', 'lead_1', 'submissionHash', 'a1', 'name', 'A', 'email', 'a@example.test', 'capturedAt', '2026-09-02T10:00:00Z'), 'dual_write');
select public.record_tenant_lead('oc-law', jsonb_build_object('leadId', 'lead_2', 'submissionHash', 'a2', 'name', 'B', 'email', 'b@example.test', 'capturedAt', '2026-09-03T10:00:00Z'), 'dual_write');
select public.record_tenant_lead('oc-law', jsonb_build_object('leadId', 'lead_3', 'submissionHash', 'a3', 'name', 'C', 'capturedAt', '2026-09-20T10:00:00Z'), 'dual_write');
select public.record_tenant_lead('oc-law', jsonb_build_object('leadId', 'lead_aug', 'submissionHash', 'a4', 'name', 'D', 'capturedAt', '2026-08-31T23:00:00Z'), 'dual_write');
select public.record_tenant_client_record('oc-law', 'inquiry_reply', 'lead_1', '{"firstReplyAt":"2026-09-02T12:00:00Z","by":"strelva"}', repeat('a', 64), '2026-09-02T12:00:00Z', 'dual_write', 'keep_first');
select public.record_tenant_client_record('oc-law', 'inquiry_reply', 'lead_2', '{"firstReplyAt":"2026-09-05T12:00:00Z","by":"owner"}', repeat('b', 64), '2026-09-05T12:00:00Z', 'dual_write', 'keep_first');
insert into public.bookings(id, tenant_id, client_name, client_email, status, created_at) values
  ('bk_1', 'oc-law', 'A', 'A@Example.test', 'confirmed', '2026-09-04T00:00:00Z'),
  ('bk_2', 'oc-law', 'Walk-in', 'walkin@example.test', 'confirmed', '2026-09-10T00:00:00Z'),
  ('bk_early', 'oc-law', 'B', 'b@example.test', 'confirmed', '2026-09-01T00:00:00Z'),
  ('bk_x', 'oc-law', 'Gone', 'a@example.test', 'cancelled', '2026-09-11T00:00:00Z');
insert into public.reviews(tenant_id, text, source, review_date) values ('oc-law', 'Great', 'google', '2026-09-08T00:00:00Z'),
  ('oc-law', 'Helpful', 'google', '2026-09-28T00:00:00Z'), ('oc-law', 'Old', 'google', '2026-08-01T00:00:00Z');
insert into public.site_metrics values ('oc-law', 'page_view', '2026-09-01', 400), ('oc-law', 'page_view', '2026-09-30', 12),
  ('oc-law', 'cta_click', '2026-09-02', 50), ('oc-law', 'page_view', '2026-10-01', 7), ('oc-quiet', 'page_view', '2026-09-02', 99);

-- A native booking linked by inquiry id (constraints of the grant tables are
-- bypassed for this read-only fixture; the join is what is tested).
set local session_replication_role = replica;
insert into public.public_website_bookings(id, grant_id, tenant_stable_id, tenant_id_at_reservation, business_workspace_id, work_id,
  capability_id, capability_version, provider, inquiry_id, request_id_hash, calendar_request_id, management_token_hash,
  management_token_ciphertext, expected_revision, title, start_at, end_at, time_zone, status)
values (gen_random_uuid(), gen_random_uuid(), '0c000000-0000-4000-8000-0000000000a1', 'oc-law', (select id from oc_w where name = 'law'), gen_random_uuid(),
  'booking', 1, 'google', 'lead_3', repeat('c', 64), 'calendar-request-1', repeat('d', 64), 'ciphertext-fixture', 0, 'Consult',
  '2026-09-22T15:00:00Z', '2026-09-22T16:00:00Z', 'America/New_York', 'confirmed');
set local session_replication_role = origin;

select pg_temp.oc_assert(pg_temp.oc('law')#>>'{inquiries,value}' = '3', 'inquiries counted in the month');
select pg_temp.oc_assert(pg_temp.oc('law')#>>'{answered,value}' = '2' and pg_temp.oc('law')#>>'{answered,withinDay}' = '1', 'answered and within a day are linked');
select pg_temp.oc_assert(pg_temp.oc('law')#>>'{bookings,value}' = '4' and pg_temp.oc('law')#>>'{bookings,native}' = '1', 'bookings counted, cancelled excluded');
select pg_temp.oc_assert(pg_temp.oc('law')#>>'{bookingsFromInquiry,value}' = '2', 'native by inquiry id plus legacy by earlier lead email; a booking before the lead is not linked');
select pg_temp.oc_assert(pg_temp.oc('law')#>>'{reviews,value}' = '2', 'reviews by review date');
select pg_temp.oc_assert(pg_temp.oc('law')#>>'{visits,value}' = '412', 'page views in the month only');
select pg_temp.oc_assert(pg_temp.oc('law')#>>'{answered,kind}' = 'linked' and pg_temp.oc('law')#>>'{inquiries,kind}' = 'counted', 'each figure says counted or linked');
select pg_temp.oc_assert(pg_temp.oc('law', '2026-08-15')#>>'{inquiries,value}' = '1', 'any day in the month selects the month');
select pg_temp.oc_assert(pg_temp.oc('quiet')#>>'{visits,value}' = '99' and pg_temp.oc('quiet')#>>'{inquiries,value}' = '0', 'businesses stay separate');
select pg_temp.oc_expect(format($$select public.business_outcome_month(%L, '0c000000-0000-4000-8000-000000000004', 'oc-stranger@example.test', '2026-09-01')$$,
  (select id from oc_w where name = 'law')), 'business_outcome_denied');
select pg_temp.oc_expect(format($$select public.business_outcome_month(%L, '0c000000-0000-4000-8000-000000000001', 'oc-operator@strelva.example.test', null)$$,
  (select id from oc_w where name = 'law')), 'business_outcome_invalid');
select pg_temp.oc_assert(not has_function_privilege('authenticated', 'public.business_outcome_month(uuid,uuid,text,date)', 'execute')
  and has_function_privilege('service_role', 'public.business_outcome_month(uuid,uuid,text,date)', 'execute'), 'service role only');
rollback;
