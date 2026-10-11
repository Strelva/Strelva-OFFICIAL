begin;

insert into public.tenants(id, site_name)
values ('track-signing-rotation-fixture', 'Tracking key rotation fixture');
insert into public.tenant_track_signing_keys(tenant_id, public_key)
values ('track-signing-rotation-fixture', repeat('o', 100));

select public.rotate_tenant_track_signing_key('track-signing-rotation-fixture', repeat('n', 100));

do $$
declare
  key_row record;
begin
  select public_key, previous_public_key, previous_valid_until
  into key_row
  from public.tenant_track_signing_keys
  where tenant_id = 'track-signing-rotation-fixture';
  if key_row.public_key <> repeat('n', 100)
     or key_row.previous_public_key <> repeat('o', 100)
     or key_row.previous_valid_until <= statement_timestamp() + interval '23 hours 59 minutes'
     or key_row.previous_valid_until > statement_timestamp() + interval '24 hours 1 minute' then
    raise exception 'rotation must preserve the former key for a 24-hour overlap';
  end if;
end
$$;

select public.rotate_tenant_track_signing_key('track-signing-rotation-fixture', repeat('n', 100));
do $$
begin
  if (select previous_public_key from public.tenant_track_signing_keys where tenant_id = 'track-signing-rotation-fixture') <> repeat('o', 100) then
    raise exception 'setting the current key again must preserve the in-window previous key';
  end if;
end
$$;

select public.rotate_tenant_track_signing_key('track-signing-rotation-fixture', repeat('r', 100));
do $$
begin
  if (select public_key from public.tenant_track_signing_keys where tenant_id = 'track-signing-rotation-fixture') <> repeat('r', 100)
     or (select previous_public_key from public.tenant_track_signing_keys where tenant_id = 'track-signing-rotation-fixture') <> repeat('n', 100) then
    raise exception 'a second rotation must overlap only the immediately previous key';
  end if;
end
$$;

select public.rotate_tenant_track_signing_key('track-signing-rotation-fixture', null);
do $$
begin
  if exists (select 1 from public.tenant_track_signing_keys where tenant_id = 'track-signing-rotation-fixture') then
    raise exception 'clearing the current key must also clear its overlap key';
  end if;
end
$$;

rollback;
