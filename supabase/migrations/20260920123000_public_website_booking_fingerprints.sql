-- Keep the public booking request intent with the durable receipt. The
-- idempotency digest identifies a request, while this separate digest proves
-- that a replay carries the same capability, slot, and visitor details.
-- Existing rows from the first booking migration remain readable by the
-- database, but the application treats a missing fingerprint as unavailable
-- until it can be reconciled rather than guessing at customer intent.

alter table public.public_website_bookings
  add column if not exists request_fingerprint text;

alter table public.public_website_bookings
  add column if not exists slot_id text;

alter table public.public_website_bookings
  add column if not exists slot_start_at timestamptz;

alter table public.public_website_bookings
  add column if not exists slot_end_at timestamptz;

alter table public.public_website_bookings
  drop constraint if exists public_website_bookings_request_fingerprint_check;

alter table public.public_website_bookings
  add constraint public_website_bookings_request_fingerprint_check
  check (request_fingerprint is null or request_fingerprint ~ '^[a-f0-9]{64}$');

alter table public.public_website_bookings
  drop constraint if exists public_website_bookings_slot_bounds_check;

alter table public.public_website_bookings
  add constraint public_website_bookings_slot_bounds_check
  check (slot_id is null or (char_length(btrim(slot_id)) between 8 and 2048 and slot_start_at is not null and slot_end_at is not null and slot_end_at > slot_start_at));

create or replace function public.guard_public_website_booking_fingerprint() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' and (
    new.request_fingerprint is null
    or new.request_fingerprint !~ '^[a-f0-9]{64}$'
    or new.slot_id is null
    or new.slot_start_at is null
    or new.slot_end_at is null
    or new.slot_end_at <= new.slot_start_at
  ) then
    raise exception 'public_booking_request_fingerprint_required';
  end if;
  if tg_op = 'UPDATE' and (
    old.request_fingerprint is distinct from new.request_fingerprint
    or old.slot_id is distinct from new.slot_id
    or old.slot_start_at is distinct from new.slot_start_at
    or old.slot_end_at is distinct from new.slot_end_at
  ) then
    raise exception 'public_booking_request_fingerprint_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists public_website_booking_fingerprint_trg on public.public_website_bookings;
create trigger public_website_booking_fingerprint_trg
  before insert or update on public.public_website_bookings
  for each row execute function public.guard_public_website_booking_fingerprint();

revoke all on function public.guard_public_website_booking_fingerprint() from public, anon, authenticated;
grant execute on function public.guard_public_website_booking_fingerprint() to service_role;
