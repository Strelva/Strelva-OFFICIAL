-- Keep the immediately previous site key valid for one bounded handoff window
-- so a site can rotate its key without dropping in-flight Stripe deliveries.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

alter table public.tenant_track_signing_keys
  add column previous_public_key text,
  add column previous_valid_until timestamptz,
  add constraint tenant_track_signing_keys_previous_key_size
    check (previous_public_key is null or char_length(btrim(previous_public_key)) between 80 and 512),
  add constraint tenant_track_signing_keys_previous_key_window_pair
    check ((previous_public_key is null) = (previous_valid_until is null));

create function public.rotate_tenant_track_signing_key(
  p_tenant_id text,
  p_public_key text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_public_key is null then
    delete from public.tenant_track_signing_keys where tenant_id = p_tenant_id;
    return;
  end if;

  insert into public.tenant_track_signing_keys as current_key (tenant_id, public_key)
  values (p_tenant_id, p_public_key)
  on conflict (tenant_id) do update set
    previous_public_key = case
      when current_key.public_key is distinct from excluded.public_key then current_key.public_key
      when current_key.previous_valid_until > statement_timestamp() then current_key.previous_public_key
      else null
    end,
    previous_valid_until = case
      when current_key.public_key is distinct from excluded.public_key then statement_timestamp() + interval '24 hours'
      when current_key.previous_valid_until > statement_timestamp() then current_key.previous_valid_until
      else null
    end,
    public_key = excluded.public_key;
end;
$$;

revoke all on function public.rotate_tenant_track_signing_key(text, text) from public, anon, authenticated;
grant execute on function public.rotate_tenant_track_signing_key(text, text) to service_role;

commit;
