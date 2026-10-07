-- Restore the pre-#511 catalog API when rolling back its caller together.
-- The earlier email-based authority is restored; do not keep the new caller.
begin;
set local lock_timeout = '3s';

drop function public.backfill_newsletter_contacts(text, uuid, boolean, text, integer);

create function public.backfill_newsletter_contacts(
  p_operator_email text, p_tenant_id text, p_workspace_id uuid,
  p_apply boolean default false, p_after text default null, p_limit integer default 500
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_stable uuid; v_sub record; v_total integer := 0; v_creates integer := 0; v_merges integer := 0;
  v_invalid integer := 0; v_unsubscribed integer := 0; v_linked integer := 0; v_failed integer := 0;
  v_last text; v_state text;
begin
  perform public.workspace_release_assert_operator(p_operator_email);
  v_stable := public.newsletter_contact_assert_link(p_tenant_id, p_workspace_id);
  if p_apply is null or p_limit is null or p_limit not between 1 and 500 then raise exception 'newsletter_contact_invalid'; end if;
  if p_apply then
    select state into v_state from public.workspace_release_flags
      where workspace_id = p_workspace_id and flag = 'newsletter_contacts' for share;
    if v_state is distinct from 'on' then raise exception 'newsletter_contact_release_off'; end if;
    perform 1 from public.business_records where workspace_id = p_workspace_id for update;
  end if;
  for v_sub in select s.* from public.newsletter_subscribers s
    where s.tenant_id = p_tenant_id and (p_after is null or s.email > p_after)
    order by s.email limit p_limit loop
    v_total := v_total + 1; v_last := v_sub.email;
    if v_sub.status = 'unsubscribed' then v_unsubscribed := v_unsubscribed + 1; end if;
    if not public.business_record_email_valid(lower(btrim(v_sub.email))) then
      v_invalid := v_invalid + 1; continue;
    end if;
    if exists (select 1 from public.business_contacts c where c.workspace_id = p_workspace_id and c.email = lower(btrim(v_sub.email))) then
      v_merges := v_merges + 1;
    else v_creates := v_creates + 1; end if;
    if p_apply then
      if public.newsletter_contact_project(v_stable, p_workspace_id, v_sub.email, v_sub.name, v_sub.subscribed_at) = 'linked' then
        v_linked := v_linked + 1;
      else v_failed := v_failed + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('workspaceId', p_workspace_id, 'tenantId', p_tenant_id, 'dryRun', not p_apply,
    'examined', v_total, 'creates', v_creates, 'merges', v_merges, 'invalid', v_invalid,
    'unsubscribed', v_unsubscribed, 'linked', v_linked, 'failed', v_failed,
    'nextAfter', case when exists(select 1 from public.newsletter_subscribers where tenant_id = p_tenant_id and email > v_last) then v_last else null end);
end;
$$;

revoke all on function public.backfill_newsletter_contacts(text, text, uuid, boolean, text, integer)
  from public, anon, authenticated;
grant execute on function public.backfill_newsletter_contacts(text, text, uuid, boolean, text, integer) to service_role;
commit;
