\set ON_ERROR_STOP on
-- Approval records are private, immutable except for one-time consumption,
-- and reachable only through the service-role server functions.
begin;
create or replace function pg_temp.oa_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'operator approval assertion failed: %', message; end if; end; $$;
select pg_temp.oa_assert((select relrowsecurity from pg_class where oid = 'public.operator_action_approvals'::regclass), 'RLS is enabled');
select pg_temp.oa_assert(not has_table_privilege('anon', 'public.operator_action_approvals', 'select')
  and not has_table_privilege('authenticated', 'public.operator_action_approvals', 'select')
  and not has_table_privilege('service_role', 'public.operator_action_approvals', 'select')
  and not has_table_privilege('service_role', 'public.operator_action_approvals', 'insert'), 'no direct table grants');
select pg_temp.oa_assert((select relrowsecurity from pg_class where oid = 'public.workspace_operator_audit_events'::regclass)
  and not has_table_privilege('service_role', 'public.workspace_operator_audit_events', 'select')
  and not has_table_privilege('service_role', 'public.workspace_operator_audit_events', 'insert'), 'agency-safe audit table is private');
select pg_temp.oa_assert(has_function_privilege('service_role', 'public.create_operator_action_approval(uuid,uuid,text,jsonb,jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.create_operator_owner_invitation_approved(uuid,uuid,text,text,timestamptz,uuid,boolean,jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.revoke_operator_owner_invitation_audited(uuid,uuid,jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.set_workspace_release_flag_approved(uuid,uuid,text,text,text,bigint,uuid)', 'execute')
  and has_function_privilege('service_role', 'public.designate_strelva_agency_workspace_audited(uuid,uuid,jsonb)', 'execute')
  and not has_function_privilege('service_role', 'public.consume_operator_action_approval(uuid,uuid,uuid,text,jsonb)', 'execute')
  and not has_function_privilege('service_role', 'public.create_operator_owner_invitation(text,uuid,text,text,timestamptz)', 'execute'),
  'identity-bound, approval-aware service RPCs only');
select pg_temp.oa_assert(exists (select 1 from pg_trigger where tgrelid = 'public.operator_action_approvals'::regclass
  and tgname = 'operator_action_approvals_immutable_trg' and not tgisinternal), 'approval records are immutable after creation');
rollback;
