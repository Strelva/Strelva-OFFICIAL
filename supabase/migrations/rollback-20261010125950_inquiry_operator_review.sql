-- Disable INQUIRY_RECORDS and OWNER_NOTICES first. Keep all records/receipts.
begin;
set local lock_timeout = '3s';
revoke execute on function public.read_operator_held_inquiries(uuid,text,text,integer,timestamptz,uuid),
 public.decide_operator_held_inquiry(uuid,text,uuid,text),public.read_operator_inquiry_notice_issues(uuid,text,integer,timestamptz,uuid),
 public.claim_connected_inquiry_owner_notice_repair(uuid,text,uuid),public.verify_connected_inquiry_owner_notice_repair(uuid),
 public.finish_connected_inquiry_owner_notice_repair(uuid,text,text,timestamptz),
 public.record_connected_inquiry_owner_notice_repair_event(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text[],text) from service_role;
commit;
