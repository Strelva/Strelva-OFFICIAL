begin;
do $$
begin
  if exists (select 1 from public.provider_disconnect_receipts) then
    raise exception 'rollback_provider_disconnect_receipts_have_evidence';
  end if;
end;
$$;
drop function public.disconnect_workspace_calendar_connection(uuid, uuid, text, text, text);
drop function public.record_tenant_provider_disconnect(text, text, uuid, text, text, text, text[]);
drop table public.provider_disconnect_receipts;

create or replace function public.revoke_workspace_calendar_connection(
  p_workspace_id uuid,
  p_user_id uuid,
  p_provider text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  changed integer;
begin
  perform public.workspace_require(p_workspace_id, p_user_id, 'manage_calendar');
  update public.workspace_calendar_connections
  set status = 'revoked',
      access_token_ciphertext = null,
      refresh_token_ciphertext = null,
      last_error = 'Disconnected by a workspace member.',
      updated_at = now()
  where workspace_id = p_workspace_id and provider = p_provider;
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;
commit;
