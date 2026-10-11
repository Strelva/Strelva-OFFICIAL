\set ON_ERROR_STOP on
-- Batch 7A rollback rehearsal fixture. COMMITS fictional rows into every 7A
-- table and column so the rollbacks must archive real data: an owner-chosen
-- provider with a seat and staff, an agency verification, a neutral service
-- session, and an accepted agency payer with a billing home and a job budget.
-- Used only by the throwaway SQL check clusters.
insert into public.users(id, email, verified_at) values
  ('7a7a0000-0000-4000-8000-000000000001', 'b7a-owner@example.test', now()),
  ('7a7a0000-0000-4000-8000-000000000002', 'b7a-agency-owner@agency.example.test', now()),
  ('7a7a0000-0000-4000-8000-000000000003', 'b7a-operator@strelva.example.test', now());
insert into public.super_admins(user_id, email) values ('7a7a0000-0000-4000-8000-000000000003', 'b7a-operator@strelva.example.test');
insert into public.workspaces(id, kind, name, created_by) values
  ('7a7a0000-0000-4000-8000-000000000010', 'customer', 'Rehearsal Client', '7a7a0000-0000-4000-8000-000000000001'),
  ('7a7a0000-0000-4000-8000-000000000020', 'agency', 'Rehearsal Agency', '7a7a0000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('7a7a0000-0000-4000-8000-000000000010', '7a7a0000-0000-4000-8000-000000000001', 'owner', '7a7a0000-0000-4000-8000-000000000001'),
  ('7a7a0000-0000-4000-8000-000000000020', '7a7a0000-0000-4000-8000-000000000002', 'owner', '7a7a0000-0000-4000-8000-000000000002');
insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by) values
  ('7a7a0000-0000-4000-8000-000000000030', '7a7a0000-0000-4000-8000-000000000010', 'tracker', 'tracker', 'Rehearsal job', '{}',
    '7a7a0000-0000-4000-8000-000000000001');
insert into public.accounts(name, workspace_id, billing_type) values ('Rehearsal Client', '7a7a0000-0000-4000-8000-000000000010', 'comped');

select public.choose_business_provider('7a7a0000-0000-4000-8000-000000000001', 'b7a-owner@example.test',
  '7a7a0000-0000-4000-8000-000000000010', '7a7a0000-0000-4000-8000-000000000020');
select public.set_agency_client_staff('7a7a0000-0000-4000-8000-000000000002', 'b7a-agency-owner@agency.example.test',
  '7a7a0000-0000-4000-8000-000000000020', '7a7a0000-0000-4000-8000-000000000010', '7a7a0000-0000-4000-8000-000000000002', true);
select public.record_agency_verification('b7a-operator@strelva.example.test', '7a7a0000-0000-4000-8000-000000000020',
  'email', 'verified', '{"fixture": "rehearsal"}', null);
select public.strelva_service_reader('7a7a0000-0000-4000-8000-000000000010', 'needs_you_sync');
select count(*) from public.workspace_payer_transition_command(jsonb_build_object('action', 'accept', 'transitionId',
  (select id from public.workspace_payer_transition_command(jsonb_build_object('action', 'propose',
    'workspaceId', '7a7a0000-0000-4000-8000-000000000010', 'successorAgencyWorkspaceId', '7a7a0000-0000-4000-8000-000000000020'),
    '7a7a0000-0000-4000-8000-000000000001', 'b7a-owner@example.test'))),
  '7a7a0000-0000-4000-8000-000000000002', 'b7a-agency-owner@agency.example.test');
select count(*) from public.job_economics_create_with_payer_transition(jsonb_build_object('action', 'create',
  'workspaceId', '7a7a0000-0000-4000-8000-000000000010', 'workId', '7a7a0000-0000-4000-8000-000000000030',
  'productId', 'tracker', 'resourceKind', 'tracker', 'payerId', '7a7a0000-0000-4000-8000-000000000001',
  'estimateCents', null, 'maxAuthorizedCents', 300), '7a7a0000-0000-4000-8000-000000000001', 'b7a-owner@example.test');

do $$ begin
  if (select count(*) from public.provider_seats where customer_workspace_id = '7a7a0000-0000-4000-8000-000000000010') <> 1
    or (select count(*) from public.agency_client_staff where customer_workspace_id = '7a7a0000-0000-4000-8000-000000000010') <> 1
    or (select count(*) from public.agency_verifications where agency_workspace_id = '7a7a0000-0000-4000-8000-000000000020') <> 1
    or (select count(*) from public.strelva_service_actions where provider_workspace_id = '7a7a0000-0000-4000-8000-000000000020') <> 1
    or (select payer_kind from public.accounts where workspace_id = '7a7a0000-0000-4000-8000-000000000010') <> 'agency'
    or (select payer_kind from public.job_economics where work_id = '7a7a0000-0000-4000-8000-000000000030') <> 'agency' then
    raise exception 'batch 7A rehearsal fixture is incomplete';
  end if;
end $$;
