\set ON_ERROR_STOP on
begin;
create function pg_temp.ns_assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'publishing assertion failed: %',label; end if; end; $$;
create function pg_temp.ns_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if sqlerrm not like expected then raise exception 'expected % got %',expected,sqlerrm; end if;
    return;
  end;
  raise exception 'expected failure %',expected;
end; $$;
insert into public.users(id,email,verified_at) values('cf000000-0000-4000-8000-000000000001','content-fixture@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('cf000000-0000-4000-8000-000000000010','customer','Content Fixture','cf000000-0000-4000-8000-000000000001'),
 ('cf000000-0000-4000-8000-000000000011','customer','Other Fixture','cf000000-0000-4000-8000-000000000001');
insert into public.tenants(id,stable_id,site_name,active) values('content-fixture','cf000000-0000-4000-8000-0000000000b1','Content Fixture',true);
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt)
 values('cf000000-0000-4000-8000-0000000000b1','content-fixture','cf000000-0000-4000-8000-000000000010','cf000000-0000-4000-8000-000000000001','cf000000-0000-4000-8000-0000000000c1',repeat('a',64),'{}');
insert into public.newsletter_subscribers(tenant_id,email,status)
 select 'content-fixture','reader'||lpad(n::text,3,'0')||'@example.test','active' from generate_series(1,150) n;
insert into public.newsletter_subscribers(tenant_id,email,status) values('content-fixture','gone@example.test','unsubscribed');
create temp table ns_issue as select public.approve_workspace_newsletter_issue(jsonb_build_object(
 'workspaceId','cf000000-0000-4000-8000-000000000010','systemId','cf000000-0000-4000-8000-000000000020','tenantId','content-fixture',
 'eventId','evt-newsletter-sender','actor','owner-link:fixture','draftHash',repeat('a',64),'subject','Frozen issue','body','Approved body'))->>'receiptId' id;
create temp table ns_batch as select public.workspace_newsletter_sender('claim',(select id::uuid from ns_issue)) doc;
select pg_temp.ns_assert((select jsonb_array_length(doc->'recipients')=100 from ns_batch),'first batch has 100 recipients');
select pg_temp.ns_assert((select count(*)=2 from public.workspace_newsletter_batches),'stable 100/50 batches');
select pg_temp.ns_assert(not has_function_privilege('authenticated','public.workspace_newsletter_sender(text,uuid,jsonb)','execute'),'sender service only');
select pg_temp.ns_assert(not has_table_privilege('service_role','public.workspace_newsletter_batches','update'),'no direct claim mutation');
-- A different worker gets the next batch, never the first worker's claim.
create temp table ns_other as select public.workspace_newsletter_sender('claim',(select id::uuid from ns_issue)) doc;
select pg_temp.ns_assert((select doc->>'id'<>(select doc->>'id' from ns_other) from ns_batch),'claims are exclusive');
select pg_temp.ns_assert(public.workspace_newsletter_sender('claim',(select id::uuid from ns_issue)) is null,'no batch left to double claim');
select pg_temp.ns_expect($$select public.workspace_newsletter_sender('begin',(doc->>'id')::uuid,'{"claimToken":"cf000000-0000-4000-8000-000000000099"}') from ns_batch$$,'newsletter_claim_conflict');
-- Unsubscribes and any non-active suppression state are rechecked at begin.
update public.newsletter_subscribers set status='unsubscribed' where email='reader001@example.test';
update public.newsletter_subscribers set status='suppressed' where email='reader002@example.test';
insert into public.newsletter_subscribers(tenant_id,email,status) values('content-fixture','new-reader@example.test','active');
create temp table ns_send as select public.workspace_newsletter_sender('begin',(doc->>'id')::uuid,jsonb_build_object('claimToken',doc->>'claimToken')) recipients from ns_batch;
select pg_temp.ns_assert((select jsonb_array_length(recipients)=98 and not recipients ? 'reader001@example.test' and not recipients ? 'reader002@example.test' and not recipients ? 'new-reader@example.test' from ns_send),'current unsubscribe and suppression respected, new subscriber excluded');
select pg_temp.ns_assert((select public.workspace_newsletter_sender('begin',(doc->>'id')::uuid,jsonb_build_object('claimToken',doc->>'claimToken')) is null from ns_batch),'begin is one-way');
select pg_temp.ns_expect($$select public.workspace_newsletter_sender('finish',(doc->>'id')::uuid,jsonb_build_object('claimToken',doc->>'claimToken','status','accepted','providerMessageIds','[]'::jsonb)) from ns_batch$$,'newsletter_acceptance_unconfirmed');
create temp table ns_receipt as select public.workspace_newsletter_sender('finish',(doc->>'id')::uuid,jsonb_build_object('claimToken',doc->>'claimToken','status','accepted','detail','accepted, not delivered','providerMessageIds',(select jsonb_agg('message-'||n) from generate_series(1,98) n))) doc from ns_batch;
select pg_temp.ns_assert((select (doc->>'accepted_count')::integer=98 and (doc->>'suppressed_count')::integer=2 from ns_receipt),'receipt records accepted and opted-out recipients');
select pg_temp.ns_assert((select public.workspace_newsletter_sender('finish',(doc->>'id')::uuid,jsonb_build_object('claimToken',doc->>'claimToken','status','accepted'))=(select doc from ns_receipt) from ns_batch),'receipt persistence is idempotent');
select public.workspace_newsletter_sender('finish',(doc->>'id')::uuid,jsonb_build_object('claimToken',doc->>'claimToken','status','gated','detail','not sent: gated')) from ns_other;
select pg_temp.ns_assert((select count(*)=2 from public.workspace_newsletter_batch_receipts),'one receipt per batch attempt');
select pg_temp.ns_assert((public.read_workspace_newsletter_issues('cf000000-0000-4000-8000-000000000010','content-fixture')->0->'delivery'->>'accepted')::integer=98,'read projection exposes acceptance without rewriting approval');
select pg_temp.ns_assert(jsonb_array_length(public.read_workspace_newsletter_issues('cf000000-0000-4000-8000-000000000010','content-fixture')->0->'delivery'->'receipts')=2,'batch receipts readable');
select pg_temp.ns_assert(public.workspace_newsletter_sender('claim',(select id::uuid from ns_issue)) is null,'gated batch backs off');
update public.workspace_newsletter_batches set next_attempt_at=now()-interval '1 second' where state='gated';
update ns_other set doc=public.workspace_newsletter_sender('claim',(select id::uuid from ns_issue));
select pg_temp.ns_assert((select doc->>'id'<>(select doc->>'id' from ns_batch) from ns_other),'retry only gated batch, accepted batch stays terminal');
select public.workspace_newsletter_sender('begin',(doc->>'id')::uuid,jsonb_build_object('claimToken',doc->>'claimToken')) from ns_other;
-- A crashed/ambiguous send remains held even beyond the provider key TTL.
update public.workspace_newsletter_batches set claim_until=now()-interval '2 days' where state='sending';
select pg_temp.ns_assert(public.workspace_newsletter_sender('claim',(select id::uuid from ns_issue)) is null,'sending marker never expires into a duplicate');
select public.workspace_newsletter_sender('finish',(doc->>'id')::uuid,jsonb_build_object('claimToken',doc->>'claimToken','status','unknown','detail','reconcile before retry')) from ns_other;
select pg_temp.ns_assert(public.workspace_newsletter_sender('claim',(select id::uuid from ns_issue)) is null,'unknown outcome remains held');
select pg_temp.ns_expect($$update public.workspace_newsletter_batch_receipts set detail='changed'$$,'newsletter_issue_is_immutable');
select pg_temp.ns_assert((select body='Approved body' and accepted_count=0 from public.workspace_newsletter_issues),'approval snapshot unchanged');
-- Before the one-way marker, an expired claim is safely reclaimable.
update public.newsletter_subscribers set status='unsubscribed' where tenant_id='content-fixture';
insert into public.newsletter_subscribers(tenant_id,email,status) values('content-fixture','MixedCase@example.test','active'),('content-fixture',' spaced@example.test ','active');
create temp table ns_retry_issue as select public.approve_workspace_newsletter_issue(jsonb_build_object(
 'workspaceId','cf000000-0000-4000-8000-000000000010','systemId','cf000000-0000-4000-8000-000000000020','tenantId','content-fixture',
 'eventId','evt-newsletter-reclaim','actor','owner-link:fixture','draftHash',repeat('b',64),'subject','Next issue','body','Approved body'))->>'receiptId' id;
create temp table ns_expired as select public.workspace_newsletter_sender('claim',(select id::uuid from ns_retry_issue)) doc;
select pg_temp.ns_assert((select doc->'recipients'='["MixedCase@example.test"]'::jsonb from ns_expired),'mixed case preserved; noncanonical whitespace never sent');
update public.workspace_newsletter_batches set claim_until=now()-interval '1 minute' where state='claimed';
create temp table ns_reclaimed as select public.workspace_newsletter_sender('claim',(select id::uuid from ns_retry_issue)) doc;
select pg_temp.ns_assert((select doc->>'claimToken'<>(select doc->>'claimToken' from ns_expired) from ns_reclaimed),'expired pre-send claim gets fresh token');
select pg_temp.ns_expect($$select public.workspace_newsletter_sender('begin',(doc->>'id')::uuid,jsonb_build_object('claimToken',doc->>'claimToken')) from ns_expired$$,'newsletter_claim_conflict');
update public.newsletter_subscribers set status='unsubscribed' where email='MixedCase@example.test';
select pg_temp.ns_assert((select public.workspace_newsletter_sender('begin',(doc->>'id')::uuid,jsonb_build_object('claimToken',doc->>'claimToken'))='[]'::jsonb from ns_reclaimed),'exact stored mixed-case unsubscribe honored');
select public.workspace_newsletter_sender('finish',(doc->>'id')::uuid,jsonb_build_object('claimToken',doc->>'claimToken','status','suppressed','detail','not sent: no active subscribers')) from ns_reclaimed;
rollback;
