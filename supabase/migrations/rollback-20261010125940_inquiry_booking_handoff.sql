-- Disable STRELVA_INQUIRY_BOOKING_HANDOFF first. Existing booking records stay.
begin;
set local lock_timeout='3s';
-- Keep the exact signed offer and its chosen booking alongside booking records.
revoke execute on function public.choose_inquiry_booking_slot(uuid,integer),
  public.read_inquiry_booking_offer(uuid),public.prepare_inquiry_booking_offer(text,text,jsonb,uuid,jsonb,uuid,text),
  public.read_inquiry_booking_handoff(text,text,uuid,uuid,uuid,text),public.resolve_workspace_inquiry_booking_lead(uuid,uuid,uuid,text),
  public.record_workspace_inquiry_booking(uuid,uuid,jsonb,jsonb,text,text),
  public.read_inquiry_workspace_bookings(uuid,date,date),public.read_inquiry_workspace_booking_context(uuid) from service_role;
commit;
