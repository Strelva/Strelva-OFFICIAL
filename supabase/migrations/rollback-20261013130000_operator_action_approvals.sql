begin;
lock table public.operator_action_approvals in access exclusive mode;
do $$
begin
  if exists (select 1 from public.operator_action_approvals) then
    raise exception 'operator_action_approval_rollback_requires_empty_table';
  end if;
end;
$$;

drop function public.create_operator_owner_invitation_approved(text, uuid, text, text, timestamptz, uuid, boolean);
drop function public.revoke_operator_owner_invitation_audited(text, uuid);
drop function public.set_workspace_release_flag_approved(text, uuid, text, text, text, bigint, uuid);
drop function public.create_operator_action_approval(text, uuid, text, jsonb);
drop function public.consume_operator_action_approval(text, uuid, uuid, text, jsonb);
drop function public.record_workspace_operator_audit(uuid, text, text, text, uuid, text, jsonb);
drop trigger operator_action_approvals_immutable_trg on public.operator_action_approvals;
drop function public.operator_action_approval_immutable();
drop table public.operator_action_approvals;

-- Restore the server-only grants from the prior migration. The application
-- rollback restores its matching RPC names at the same release boundary.
grant execute on function public.create_operator_owner_invitation(text, uuid, text, text, timestamptz) to service_role;
grant execute on function public.revoke_operator_owner_invitation(text, uuid) to service_role;
grant execute on function public.set_workspace_release_flag(text, uuid, text, text, text, bigint) to service_role;
commit;
