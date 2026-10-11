begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

do $$
begin
  if exists (
    select 1 from public.tenant_track_signing_keys
    where previous_public_key is not null or previous_valid_until is not null
  ) then
    raise exception using
      errcode = '55000',
      message = 'track_signing_key_rotation_rollback_requires_data_preservation';
  end if;
end
$$;

drop function public.rotate_tenant_track_signing_key(text, text);
alter table public.tenant_track_signing_keys
  drop constraint tenant_track_signing_keys_previous_key_size,
  drop constraint tenant_track_signing_keys_previous_key_window_pair,
  drop column previous_public_key,
  drop column previous_valid_until;

commit;
