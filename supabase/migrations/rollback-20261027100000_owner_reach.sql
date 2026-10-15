-- Roll back owner reach: drop the reads and restore the claim function without the staff refusal.
begin;
set local lock_timeout = '3s';
drop function public.operator_owner_reach_report(uuid, text);
drop function public.read_agency_client_owner_reach(uuid, uuid, text, uuid[]);
create or replace function public.issue_agency_client_owner_claim(
  p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid, p_customer_workspace_id uuid,
  p_recipient_email text, p_token_hash text, p_expires_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  recipient text := lower(btrim(coalesce(p_recipient_email, '')));
  replaced integer;
  created public.agency_client_owner_claims%rowtype;
begin
  perform public.agency_client_assert_actor(p_user_id, p_verified_email, p_agency_workspace_id);
  if p_customer_workspace_id is null then raise exception 'agency_client_access_denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_customer_workspace_id::text, 7415));
  perform 1 from public.agency_client_additions
    where customer_workspace_id = p_customer_workspace_id and agency_workspace_id = p_agency_workspace_id;
  if not found then raise exception 'agency_client_access_denied'; end if;
  perform 1 from public.workspace_providers
    where customer_workspace_id = p_customer_workspace_id and provider_workspace_id = p_agency_workspace_id and status = 'active'
    for share;
  if not found then raise exception 'agency_client_access_denied'; end if;
  perform 1 from public.provider_seats
    where customer_workspace_id = p_customer_workspace_id and agency_workspace_id = p_agency_workspace_id and status = 'active'
    for share;
  if not found then raise exception 'agency_client_access_denied'; end if;
  if public.workspace_exit_completed(p_customer_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  if not public.agency_client_waiting_for_owner(p_customer_workspace_id) then raise exception 'agency_client_owner_exists'; end if;
  if not public.business_record_email_valid(recipient) or char_length(recipient) > 254
    or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_expires_at is null or p_expires_at <= clock_timestamp() or p_expires_at > clock_timestamp() + interval '30 days' then
    raise exception 'agency_client_claim_invalid';
  end if;
  update public.agency_client_owner_claims set status = 'expired'
    where customer_workspace_id = p_customer_workspace_id and status = 'pending' and expires_at <= clock_timestamp();
  update public.agency_client_owner_claims set status = 'revoked', revoked_by = p_user_id, revoked_at = clock_timestamp()
    where customer_workspace_id = p_customer_workspace_id and status = 'pending';
  get diagnostics replaced = row_count;
  insert into public.agency_client_owner_claims(customer_workspace_id, agency_workspace_id, recipient_email, token_hash,
      delivery, created_by, expires_at)
    values (p_customer_workspace_id, p_agency_workspace_id, recipient, p_token_hash,
      jsonb_build_object('status', 'not_sent', 'reason', 'gated', 'decision', 'R08',
        'agencyEmailVerified', public.agency_effect_allowed(p_agency_workspace_id, 'email')),
      p_user_id, p_expires_at)
    returning * into created;
  return jsonb_build_object(
    'claimId', created.id,
    'customerWorkspaceId', created.customer_workspace_id,
    'workspaceName', (select name from public.workspaces where id = created.customer_workspace_id),
    'recipientEmail', created.recipient_email,
    'delivery', created.delivery,
    'expiresAt', to_char(created.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'createdAt', to_char(created.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'replacedPending', replaced > 0);
end;
$$;
drop function public.owner_contact_staff_reason(uuid, text);
drop function public.owner_reach_public_mail_domains();
notify pgrst, 'reload schema';
commit;
