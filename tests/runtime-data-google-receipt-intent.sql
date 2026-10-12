\set ON_ERROR_STOP on
begin;
insert into public.users(id,email,verified_at) values ('e8210000-0000-4000-8000-000000000061','intent@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values ('e8210000-0000-4000-8000-000000000062','customer','Intent fixture','e8210000-0000-4000-8000-000000000061');
do $$ declare first jsonb; terminal jsonb; input jsonb; begin
 input := '{"workspaceId":"e8210000-0000-4000-8000-000000000062","bindingId":null,"locationId":"test-location","action":"hours_patch","targetRef":null,"authority":{"kind":"owner_approval","actor":"intent-owner","approvalRef":"exact-approved-event"},"before":{"hours":"old"},"after":{"hours":"authored"},"undo":null,"undoesReceiptId":null,"idempotencyKey":"google-draft:intent-fixture"}';
 first := public.record_google_listing_receipt(input);
 if first->>'intentDigest' !~ '^[a-f0-9]{64}$' then raise exception 'intent_not_captured'; end if;
 perform public.settle_google_listing_receipt((first->>'id')::uuid,(input->>'workspaceId')::uuid,'{"status":"failed","undo":null}');
 terminal := public.record_google_listing_receipt(input || jsonb_build_object('idempotencyKey','google-draft:intent-fixture:retry:'||(first->>'id')));
 if terminal->>'intentDigest' <> first->>'intentDigest' then raise exception 'retry_intent_changed'; end if;
 terminal := public.settle_google_listing_receipt((terminal->>'id')::uuid,(input->>'workspaceId')::uuid,'{"status":"posted","readback":"matched","after":{"hours":"Google readback"}}');
 if terminal->>'intentDigest' <> first->>'intentDigest' or terminal->'after' <> '{"hours":"Google readback"}'::jsonb then raise exception 'readback_overwrote_intent'; end if;
 begin
  update public.google_listing_receipts set intent_digest=repeat('f',64) where id=(first->>'id')::uuid;
  raise exception 'intent_mutation_allowed';
 exception when others then if sqlerrm <> 'google_receipt_immutable' then raise; end if; end;
end $$;
rollback;
