\set ON_ERROR_STOP on
begin;
insert into public.users(id,email,verified_at) values ('e8210000-0000-4000-8000-000000000071','retention@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values ('e8210000-0000-4000-8000-000000000072','customer','Retention fixture','e8210000-0000-4000-8000-000000000071');
do $$ declare input jsonb; active jsonb; expired jsonb; n integer; begin
 input := '{"workspaceId":"e8210000-0000-4000-8000-000000000072","bindingId":null,"locationId":"fixture-location","action":"hours_patch","targetRef":null,"authority":{"kind":"owner_approval","actor":"owner","approvalRef":"exact-event"},"before":{"hours":"fictional-provider-prior"},"after":{"hours":"owner-authored"},"undo":null,"undoesReceiptId":null,"idempotencyKey":"google-draft:retention-fixture","afterOrigin":"authored"}';
 active := public.record_google_listing_receipt(input);
 active := public.settle_google_listing_receipt((active->>'id')::uuid,(input->>'workspaceId')::uuid,'{"status":"posted","readback":"matched","afterOrigin":"provider","after":{"hours":"fictional-provider-readback"},"undo":{"kind":"patch_snapshot","updateMask":["hours"],"snapshot":{"hours":"fictional-provider-prior"}}}');
 if active->'authoredInput' <> input->'after' or active->'after' <> '{"hours":"fictional-provider-readback"}'::jsonb then raise exception 'retention_provenance_wrong'; end if;
 if exists(select 1 from public.google_listing_receipts where id=(active->>'id')::uuid and (before_state is not null or after_state is not null or undo is not null)) then raise exception 'provider_content_left_in_history'; end if;
 -- Synthetic old rows exercise native wall-clock projection and physical purge.
 insert into public.google_listing_receipts(id,workspace_id,location_id,action,status,authority,idempotency_key,intent_digest,before_origin,after_origin,undo_origin,provider_payload_expires_at,authored_input)
 values('e8210000-0000-4000-8000-000000000073',(input->>'workspaceId')::uuid,'fixture-location','hours_patch','posted',input->'authority','expired-retention-fixture',repeat('a',64),'provider','provider','provider',clock_timestamp()-interval '1 second',input->'after');
 insert into public.google_listing_receipt_payloads(receipt_id,workspace_id,payload,expires_at)
 values('e8210000-0000-4000-8000-000000000073',(input->>'workspaceId')::uuid,'{"before":{"hours":"expired-provider-prior"},"after":{"hours":"expired-provider-readback"},"undo":{"kind":"patch_snapshot","snapshot":{"hours":"expired-provider-prior"},"updateMask":["hours"]}}',clock_timestamp()-interval '1 second');
 expired := public.read_google_listing_receipt('e8210000-0000-4000-8000-000000000073',(input->>'workspaceId')::uuid);
 if expired->'before'<>'null'::jsonb or expired->'after'<>'null'::jsonb or expired->'undo'<>'null'::jsonb or expired->>'status'<>'posted' or expired->'authoredInput'<>input->'after' or expired->>'providerPayloadExpired'<>'true' then raise exception 'expired_payload_visible'; end if;
 if expired::text like '%expired-provider%' then raise exception 'expired_read_export_payload_leaked'; end if;
 n:=public.purge_expired_google_receipt_payloads(10000);
 if exists(select 1 from public.google_listing_receipt_payloads where receipt_id='e8210000-0000-4000-8000-000000000073') or not exists(select 1 from public.google_listing_receipts where id='e8210000-0000-4000-8000-000000000073' and status='posted') then raise exception 'purge_deleted_history_or_retained_payload'; end if;
 if has_table_privilege('service_role','public.google_listing_receipt_payloads','select') or has_table_privilege('authenticated','public.google_listing_receipt_payloads','select') or has_function_privilege('authenticated','public.purge_expired_google_receipt_payloads(integer)','execute') then raise exception 'retention_acl_wrong'; end if;
 begin
  update public.google_listing_receipts set provider_payload_expires_at=clock_timestamp()+interval '29 days' where id=(active->>'id')::uuid;
  raise exception 'retention_deadline_renewed';
 exception when others then if sqlerrm<>'google_receipt_immutable' then raise; end if; end;
end $$;
rollback;
