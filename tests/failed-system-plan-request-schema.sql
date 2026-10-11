\set ON_ERROR_STOP on
begin;
update public.workspace_delegations set status='active',revoked_at=null,revoked_by=null where id='d7000000-0000-4000-8000-000000000030';
create temp table failed_plan_request as select public.file_failed_system_plan_request(
  'd7000000-0000-4000-8000-000000000010','d7000000-0000-4000-8000-000000000006','make-agency@example.test','Track clients',repeat('a',64)) id;
do $$ begin
  if (select id from failed_plan_request) is distinct from public.file_failed_system_plan_request(
    'd7000000-0000-4000-8000-000000000010','d7000000-0000-4000-8000-000000000006','make-agency@example.test','Track clients',repeat('a',64)) then raise exception 'retry duplicated Request'; end if;
  if not exists(select 1 from public.service_requests where id=(select id from failed_plan_request)
    and status='requested' and provider_acceptance='pending' and provider_kind='strelva' and delivery_id is null
    and context->>'source'='failed_system_plan') then raise exception 'Request claimed accepted work'; end if;
  begin perform public.file_failed_system_plan_request('d7000000-0000-4000-8000-000000000010',
    'd7000000-0000-4000-8000-000000000001','make-owner@example.test','Track clients',repeat('b',64));
    raise exception 'owner allowed maker fallback'; exception when others then if sqlerrm<>'workspace_make_systems_required' then raise; end if; end;
  begin perform public.file_failed_system_plan_request('d7000000-0000-4000-8000-000000000012',
    'd7000000-0000-4000-8000-000000000006','make-agency@example.test','Track clients',repeat('b',64));
    raise exception 'cross-workspace fallback'; exception when others then if sqlerrm<>'workspace_membership_required' then raise; end if; end;
  begin perform public.file_failed_system_plan_request('d7000000-0000-4000-8000-000000000010',
    'd7000000-0000-4000-8000-000000000006','wrong@example.test','Track clients',repeat('b',64));
    raise exception 'unverified actor fallback'; exception when others then if sqlerrm<>'workspace_access_denied' then raise; end if; end;
end $$;
update public.workspace_delegations set status='revoked',revoked_at=clock_timestamp() where id='d7000000-0000-4000-8000-000000000030';
do $$ begin
  begin perform public.file_failed_system_plan_request('d7000000-0000-4000-8000-000000000010',
    'd7000000-0000-4000-8000-000000000006','make-agency@example.test','Track clients',repeat('a',64));
    raise exception 'revoked agency replay'; exception when others then if sqlerrm<>'workspace_membership_required' then raise; end if; end;
  if has_function_privilege('authenticated','public.file_failed_system_plan_request(uuid,uuid,text,text,text)','execute') then raise exception 'browser bypasses release'; end if;
end $$;
rollback;
