begin;
set local lock_timeout = '3s';
lock table public.operator_action_approvals, public.workspace_operator_audit_events in access exclusive mode;

-- Refuse rollback after audit/approval data exists or if any object from this
-- migration has drifted. The fingerprint covers function bodies, table shape,
-- constraints, indexes, triggers and direct ACLs.
do $rollback_guard$
declare
  fingerprint text;
begin
  if exists (select 1 from public.operator_action_approvals)
    or exists (select 1 from public.workspace_operator_audit_events) then
    raise exception 'operator_action_approval_rollback_requires_empty_audit';
  end if;

  select md5(
    coalesce((
      select string_agg(p.oid::regprocedure::text || E'\n' || pg_get_functiondef(p.oid) || E'\nACL:' || coalesce(p.proacl::text, ''), E'\n' order by p.oid::regprocedure::text)
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any(array[
        'operator_email_identity','operator_owner_invitation_trusted_recipient','operator_audit_context_valid',
        'workspace_operator_audit_immutable','operator_action_approval_immutable','record_workspace_operator_audit',
        'create_operator_action_approval','consume_operator_action_approval','create_operator_owner_invitation_approved',
        'revoke_operator_owner_invitation_audited','designate_strelva_agency_workspace_audited','set_workspace_release_flag_approved'
      ])
    ), '')
    || coalesce((
      select string_agg(c.relname || ':' || a.attnum || ':' || a.attname || ':' || a.atttypid::regtype::text || ':' || a.attnotnull || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), '') , E'\n' order by c.relname, a.attnum)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
      where n.nspname = 'public' and c.relname = any(array['operator_action_approvals','workspace_operator_audit_events'])
    ), '')
    || coalesce((
      select string_agg(r.relname || ':' || c.conname || ':' || pg_get_constraintdef(c.oid, true), E'\n' order by r.relname, c.conname)
      from pg_constraint c join pg_class r on r.oid = c.conrelid join pg_namespace n on n.oid = r.relnamespace
      where n.nspname = 'public' and r.relname = any(array['operator_action_approvals','workspace_operator_audit_events'])
    ), '')
    || coalesce((
      select string_agg(r.relname || ':' || t.tgname || ':' || pg_get_triggerdef(t.oid, true), E'\n' order by r.relname, t.tgname)
      from pg_trigger t join pg_class r on r.oid = t.tgrelid join pg_namespace n on n.oid = r.relnamespace
      where n.nspname = 'public' and r.relname = any(array['operator_action_approvals','workspace_operator_audit_events']) and not t.tgisinternal
    ), '')
    || coalesce((
      select string_agg(r.relname || ':' || i.relname || ':' || pg_get_indexdef(i.oid), E'\n' order by r.relname, i.relname)
      from pg_index x join pg_class r on r.oid = x.indrelid join pg_class i on i.oid = x.indexrelid join pg_namespace n on n.oid = r.relnamespace
      where n.nspname = 'public' and r.relname = any(array['operator_action_approvals','workspace_operator_audit_events'])
    ), '')
    || coalesce((
      select string_agg(c.relname || ':' || c.relrowsecurity || ':' || c.relforcerowsecurity || ':' || coalesce(c.relacl::text, ''), E'\n' order by c.relname)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = any(array['operator_action_approvals','workspace_operator_audit_events'])
    ), '')
  ) into fingerprint;

  raise notice 'operator_action_approval_rollback_fingerprint=%', fingerprint;
  if fingerprint is distinct from '27c9fce962f7cb088e4746a72b1f32c2' then
    raise exception 'operator_action_approval_rollback_wrong_schema_or_drift';
  end if;
end;
$rollback_guard$;

drop function public.set_workspace_release_flag_approved(uuid, uuid, text, text, text, bigint, uuid);
drop function public.designate_strelva_agency_workspace_audited(uuid, uuid, jsonb);
drop function public.revoke_operator_owner_invitation_audited(uuid, uuid, jsonb);
drop function public.create_operator_owner_invitation_approved(uuid, uuid, text, text, timestamptz, uuid, boolean, jsonb);
drop function public.consume_operator_action_approval(uuid, uuid, uuid, text, jsonb);
drop function public.create_operator_action_approval(uuid, uuid, text, jsonb, jsonb);
drop function public.record_workspace_operator_audit(uuid, text, text, text, uuid, jsonb);
drop function public.operator_audit_context_valid(jsonb);
drop function public.operator_owner_invitation_trusted_recipient(uuid);
drop function public.operator_email_identity(text);

drop trigger workspace_operator_audit_immutable_trg on public.workspace_operator_audit_events;
drop function public.workspace_operator_audit_immutable();
drop table public.workspace_operator_audit_events;
drop trigger operator_action_approvals_immutable_trg on public.operator_action_approvals;
drop function public.operator_action_approval_immutable();
drop table public.operator_action_approvals;

-- Restore the server-only grants from the prior migrations.
grant execute on function public.create_operator_owner_invitation(text, uuid, text, text, timestamptz) to service_role;
grant execute on function public.revoke_operator_owner_invitation(text, uuid) to service_role;
grant execute on function public.designate_strelva_agency_workspace(text, uuid) to service_role;
grant execute on function public.set_workspace_release_flag(text, uuid, text, text, text, bigint) to service_role;
commit;
