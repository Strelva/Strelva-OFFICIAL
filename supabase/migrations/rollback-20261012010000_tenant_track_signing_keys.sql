-- Keep active site identity keys until an explicit preservation/rotation plan
-- exists. An empty key table can be reversed and safely recreated.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

do $$
begin
  if exists (select 1 from public.tenant_track_signing_keys) then
    raise exception using
      errcode = '55000',
      message = 'tenant_track_signing_keys_rollback_requires_data_preservation';
  end if;
end
$$;

drop table public.tenant_track_signing_keys;
commit;
