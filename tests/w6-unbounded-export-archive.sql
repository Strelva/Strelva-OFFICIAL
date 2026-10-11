\set ON_ERROR_STOP on
begin;
insert into public.users(id,email,verified_at) values
 ('e6580000-0000-4000-8000-000000000001','archive-owner@example.test',now()),
 ('e6580000-0000-4000-8000-000000000002','archive-operator@example.test',now()),
 ('e6580000-0000-4000-8000-000000000003','archive-member@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('e6580000-0000-4000-8000-000000000010','customer','Large archive','e6580000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('e6580000-0000-4000-8000-000000000010','e6580000-0000-4000-8000-000000000001','owner','e6580000-0000-4000-8000-000000000001'),
 ('e6580000-0000-4000-8000-000000000010','e6580000-0000-4000-8000-000000000002','admin','e6580000-0000-4000-8000-000000000001'),
 ('e6580000-0000-4000-8000-000000000010','e6580000-0000-4000-8000-000000000003','member','e6580000-0000-4000-8000-000000000001');
insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values
 ('e6580000-0000-4000-8000-000000000020','e6580000-0000-4000-8000-000000000010','documents','document','Large document',jsonb_build_object('text',repeat('x',2100000)),'e6580000-0000-4000-8000-000000000001'),
 ('e6580000-0000-4000-8000-000000000021','e6580000-0000-4000-8000-000000000010','onboarding','case','Onboarding',jsonb_build_object('requirements','[]'::jsonb),'e6580000-0000-4000-8000-000000000001');
-- Native booking grants and receipts have no mirrored business_booking row.
insert into public.tenants(id,stable_id,site_name,active) values
 ('archive-site','e6580000-0000-4000-8000-000000000030','Archive site',true);
insert into public.memberships(user_id,tenant_id,role,tenant_stable_id) values
 ('e6580000-0000-4000-8000-000000000001','archive-site','owner','e6580000-0000-4000-8000-000000000030');
insert into public.offering_website_bindings(id,business_workspace_id,tenant_stable_id,tenant_id_at_binding,
 site_name_at_binding,idempotency_key,command_digest,created_by,updated_by) values
 ('e6580000-0000-4000-8000-000000000031','e6580000-0000-4000-8000-000000000010','e6580000-0000-4000-8000-000000000030',
 'archive-site','Archive site','archive-booking-binding',repeat('a',64),'e6580000-0000-4000-8000-000000000001','e6580000-0000-4000-8000-000000000001');
insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values
 ('e6580000-0000-4000-8000-000000000032','e6580000-0000-4000-8000-000000000010','scheduling','schedule','Archive bookings',
 '{"version":1,"revision":0,"title":"Archive bookings","history":[],"availability":[],"reservations":[]}',
 'e6580000-0000-4000-8000-000000000001');
insert into public.public_website_booking_grants(id,tenant_stable_id,business_workspace_id,work_id,capability_id,
 capability_version,inquiry_capability_id,inquiry_version,provider,display_name,time_zone,published_by) values
 ('e6580000-0000-4000-8000-000000000033','e6580000-0000-4000-8000-000000000030','e6580000-0000-4000-8000-000000000010',
 'e6580000-0000-4000-8000-000000000032','consultations',1,'inquiries',1,'google','Consultations','UTC','e6580000-0000-4000-8000-000000000001');
insert into public.public_website_bookings(id,grant_id,tenant_stable_id,tenant_id_at_reservation,business_workspace_id,
 work_id,capability_id,capability_version,provider,inquiry_id,request_id_hash,request_fingerprint,slot_id,slot_start_at,slot_end_at,
 calendar_request_id,management_token_hash,management_token_ciphertext,expected_revision,title,start_at,end_at,time_zone,status) values
 ('e6580000-0000-4000-8000-000000000034','e6580000-0000-4000-8000-000000000033','e6580000-0000-4000-8000-000000000030',
 'archive-site','e6580000-0000-4000-8000-000000000010','e6580000-0000-4000-8000-000000000032','consultations',1,'google','archive-inquiry',
 repeat('a',64),repeat('b',64),'archive-slot','2026-11-16T15:00:00Z','2026-11-16T15:30:00Z','archive-request',repeat('c',64),
 'encrypted-management-secret',1,'Consultation','2026-11-16T15:00:00Z','2026-11-16T15:30:00Z','UTC','confirmed');
do $$declare result jsonb;begin
  begin
    perform public.export_workspace_snapshot('e6580000-0000-4000-8000-000000000010','e6580000-0000-4000-8000-000000000001','archive-owner@example.test');
    raise exception 'original size boundary missing';
  exception when others then if sqlerrm <> 'workspace_export_too_large' then raise; end if; end;
  result:=public.export_workspace_archive_snapshot('e6580000-0000-4000-8000-000000000010','e6580000-0000-4000-8000-000000000001','archive-owner@example.test');
  if octet_length(result::text)<=2000000 or jsonb_array_length(result->'savedResults')<>1 then raise exception 'archive lost large document';end if;
  result:=public.export_workspace_archive_snapshot('e6580000-0000-4000-8000-000000000010','e6580000-0000-4000-8000-000000000002','archive-operator@example.test');
  if jsonb_array_length(result#>'{onboarding,cases}')<>1 or not (result ? 'economics') then raise exception 'operator archive lost native facets';end if;
  if jsonb_array_length(result#>'{publicBookings,grants}')<>1 or jsonb_array_length(result#>'{publicBookings,receipts}')<>1 then raise exception 'native public bookings missing';end if;
  if result#>>'{publicBookings,receipts,0,reservationId}'<>'e6580000-0000-4000-8000-000000000034' then raise exception 'wrong booking receipt';end if;
  if result::text like '%encrypted-management-secret%' or (result#>'{publicBookings,receipts,0}') ? 'managementTokenHash' then raise exception 'booking credentials leaked';end if;
  if not exists(select 1 from public.workspace_export_receipts where id=(result->>'exportId')::uuid and byte_size>2000000) then raise exception 'archive receipt missing';end if;
  begin
    perform public.export_workspace_archive_snapshot('e6580000-0000-4000-8000-000000000010','e6580000-0000-4000-8000-000000000003','archive-member@example.test');
    raise exception 'member exported';
  exception when others then if sqlerrm <> 'workspace_export_denied' then raise; end if; end;
  begin
    perform public.export_workspace_archive_snapshot('e6580000-0000-4000-8000-000000000099','e6580000-0000-4000-8000-000000000001','archive-owner@example.test');
    raise exception 'other business exported';
  exception when others then if sqlerrm <> 'workspace_export_denied' then raise; end if; end;
  if has_function_privilege('authenticated','public.export_workspace_archive_snapshot(uuid,uuid,text)','execute')
    or has_function_privilege('service_role','public.export_workspace_archive_snapshot_base(uuid,uuid,text)','execute') then raise exception 'archive exposed';end if;
end $$;
rollback;
