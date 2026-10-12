-- ADR 0015 (20261023140000): business entry and the failed-plan fallback file
-- Requests only to the business's single recorded agency, never to Strelva.
\set ON_ERROR_STOP 1
begin;
insert into public.users(id,email,verified_at) values
  ('7d000000-0000-4000-8000-000000000001','owner@two-doors.example.test',now()),
  ('7d000000-0000-4000-8000-000000000002','agent@two-doors.example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
  ('7d000000-0000-4000-8000-0000000000a1','agency','North Studio','7d000000-0000-4000-8000-000000000002'),
  ('7d000000-0000-4000-8000-0000000000a2','agency','Second Agency','7d000000-0000-4000-8000-000000000002');

do $$
declare result jsonb; business uuid;
begin
  -- Door A: a new business with a brief and no agency is created; the brief is held.
  result := public.enter_customer_business('7d000000-0000-4000-8000-000000000001','owner@two-doors.example.test',
    'Direct Bakery',null,'Build a website for my business.','7d000000-0000-4000-8000-0000000000c1',repeat('a',64));
  business := (result->>'workspaceId')::uuid;
  if business is null or result->>'requestId' is not null or (result->>'agencyRequired')::boolean is not true then
    raise exception 'new business entry should create the business and hold the brief: %', result;
  end if;
  if not exists (select 1 from public.workspace_memberships where workspace_id=business and user_id='7d000000-0000-4000-8000-000000000001' and role='owner') then
    raise exception 'new business entry lost ownership';
  end if;
  if exists (select 1 from public.service_requests where business_workspace_id=business) then
    raise exception 'a held brief must not become a Request';
  end if;
  -- Replay is idempotent and still reports the hold.
  result := public.enter_customer_business('7d000000-0000-4000-8000-000000000001','owner@two-doors.example.test',
    'Direct Bakery',null,'Build a website for my business.','7d000000-0000-4000-8000-0000000000c1',repeat('a',64));
  if (result->>'alreadyCreated')::boolean is not true or (result->>'agencyRequired')::boolean is not true then
    raise exception 'replay changed the result: %', result;
  end if;

  -- One active agency: the brief goes to that agency.
  insert into public.provider_seats(customer_workspace_id,agency_workspace_id,granted_by_kind,granted_by)
    values (business,'7d000000-0000-4000-8000-0000000000a1','owner','7d000000-0000-4000-8000-000000000001');
  if public.business_single_agency(business) is distinct from '7d000000-0000-4000-8000-0000000000a1'::uuid then
    raise exception 'single agency not resolved';
  end if;
  result := public.enter_customer_business('7d000000-0000-4000-8000-000000000001','owner@two-doors.example.test',
    null,business,'Add a booking page.','7d000000-0000-4000-8000-0000000000c2',repeat('b',64));
  if result->>'requestId' is null or (result->>'agencyRequired')::boolean then raise exception 'brief not filed to the agency: %', result; end if;
  if not exists (select 1 from public.service_requests where id=(result->>'requestId')::uuid
      and provider_kind='agency' and provider_agency_workspace_id='7d000000-0000-4000-8000-0000000000a1') then
    raise exception 'Request not addressed to the recorded agency';
  end if;

  -- Two agencies: no default; the owner chooses.
  insert into public.provider_seats(customer_workspace_id,agency_workspace_id,granted_by_kind,granted_by)
    values (business,'7d000000-0000-4000-8000-0000000000a2','owner','7d000000-0000-4000-8000-000000000001');
  if public.business_single_agency(business) is not null then raise exception 'two agencies must not resolve to one'; end if;
  result := public.enter_customer_business('7d000000-0000-4000-8000-000000000001','owner@two-doors.example.test',
    null,business,'Redo the site.','7d000000-0000-4000-8000-0000000000c3',repeat('c',64));
  if result->>'requestId' is not null or (result->>'agencyRequired')::boolean is not true then raise exception 'two agencies should hold: %', result; end if;

  if exists (select 1 from public.service_requests where business_workspace_id=business and provider_kind='strelva') then
    raise exception 'a Request was addressed to Strelva';
  end if;
end $$;
rollback;
