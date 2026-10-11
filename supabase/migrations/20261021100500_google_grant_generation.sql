begin;
-- Refresh and health writes belong to the exact connected grant read before
-- provider I/O. A disconnect, reconnect or competing update invalidates it.
create function public.mutate_google_binding_generation(
  p_binding_id uuid, p_expected_updated_at timestamptz, p_mutation jsonb
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_updated timestamptz;
begin
  if p_expected_updated_at is null or p_mutation is null or jsonb_typeof(p_mutation) <> 'object'
    or p_mutation = '{}'::jsonb
    or exists(select 1 from jsonb_object_keys(p_mutation) k where k not in
      ('accessTokenCiphertext','refreshTokenCiphertext','tokenExpiresAt','status','error','checkedAt')) then
    raise exception 'account_binding_invalid_mutation';
  end if;
  if (p_mutation ? 'accessTokenCiphertext' and
      (p_mutation->>'accessTokenCiphertext' is null or not public.account_binding_ciphertext_valid(p_mutation->>'accessTokenCiphertext')))
    or (p_mutation ? 'refreshTokenCiphertext' and
      (p_mutation->>'refreshTokenCiphertext' is null or not public.account_binding_ciphertext_valid(p_mutation->>'refreshTokenCiphertext')))
    or (p_mutation ? 'status' and coalesce(p_mutation->>'status','') not in ('connected','needs_reauth','error')) then
    raise exception 'account_binding_invalid_mutation';
  end if;
  update public.workspace_account_bindings set
    access_token_ciphertext = case when p_mutation ? 'accessTokenCiphertext' then p_mutation->>'accessTokenCiphertext' else access_token_ciphertext end,
    refresh_token_ciphertext = case when p_mutation ? 'refreshTokenCiphertext' then p_mutation->>'refreshTokenCiphertext' else refresh_token_ciphertext end,
    token_expires_at = case when p_mutation ? 'tokenExpiresAt' then (p_mutation->>'tokenExpiresAt')::timestamptz else token_expires_at end,
    status = coalesce(p_mutation->>'status',status),
    last_error = case when p_mutation ? 'error' then left(p_mutation->>'error',500) else last_error end,
    last_checked_at = case when p_mutation ? 'checkedAt' then coalesce((p_mutation->>'checkedAt')::timestamptz,clock_timestamp()) else last_checked_at end,
    updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
  where id = p_binding_id and provider = 'google' and status = 'connected' and updated_at = p_expected_updated_at
  returning updated_at into v_updated;
  if not found then raise exception 'account_binding_superseded_or_revoked'; end if;
  return v_updated::text;
end;
$$;
revoke all on function public.mutate_google_binding_generation(uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.mutate_google_binding_generation(uuid,timestamptz,jsonb) to service_role;
commit;
