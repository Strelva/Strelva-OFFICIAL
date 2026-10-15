\set ON_ERROR_STOP on
-- Care plan reports: facts, scope, immutable Releases, share links, held delivery, time. Fictional rows only.
begin;
create function pg_temp.cr_assert(v boolean, m text) returns void language plpgsql as $$begin if v is not true then raise exception 'care reports: %', m; end if; end$$;
create function pg_temp.cr_raises(q text, expected text) returns void language plpgsql as $$begin
  begin execute q; exception when others then if sqlerrm = expected then return; end if; raise exception 'care reports: expected %, got %', expected, sqlerrm; end;
  raise exception 'care reports: % did not raise', expected; end$$;

do $$declare
 ag constant uuid := 'c0100000-0000-4000-8000-000000000020';
 a constant uuid := 'c0100000-0000-4000-8000-000000000010'; ended constant uuid := 'c0100000-0000-4000-8000-000000000011';
 uo constant uuid := 'c0100000-0000-4000-8000-000000000001'; us constant uuid := 'c0100000-0000-4000-8000-000000000002';
 uother constant uuid := 'c0100000-0000-4000-8000-000000000003'; ucl constant uuid := 'c0100000-0000-4000-8000-000000000004';
 ustr constant uuid := 'c0100000-0000-4000-8000-000000000005';
 eo constant text := 'cr-owner@example.test'; es constant text := 'cr-staff@example.test'; eother constant text := 'cr-other-owner@example.test';
 ecl constant text := 'cr-client-owner@example.test'; estr constant text := 'cr-stranger@example.test';
 m date := date_trunc('month', now())::date;
 r jsonb; rep uuid; rev int; view jsonb; facts jsonb; rel jsonb; tok text := repeat('ab', 32); tok2 text := repeat('cd', 32); tok3 text := repeat('ef', 32);
 rid uuid; items jsonb; t jsonb; t1 uuid := gen_random_uuid(); fn regprocedure; checked int := 0;
begin
 perform pg_temp.cr_assert('care_reports' = any(public.workspace_release_flag_names()), 'flag name is known');

 -- Generation: facts from records only.
 r := public.generate_care_reports(ag, uo, eo, m, array[a], null);
 perform pg_temp.cr_assert(jsonb_array_length(r->'reports') = 1 and jsonb_array_length(r->'skipped') = 0, 'one report generated');
 rep := (r->'reports'->0->>'reportId')::uuid;
 select draft into facts from public.care_reports where id = rep;
 perform pg_temp.cr_assert((facts#>>'{changes,total}')::int = 4 and (facts#>>'{changes,confirmed}')::int = 3 and (facts#>>'{changes,notChecked}')::int = 1
   and (facts#>>'{changes,notConfirmed}')::int = 0, 'changes: baseline excluded, deploy, document and code confirmed, content not checked');
 select jsonb_object_agg(x->>'source', x->>'check') into items from jsonb_array_elements(facts#>'{changes,items}') x;
 perform pg_temp.cr_assert(items = '{"website_deploy":"confirmed","website_document":"confirmed","website_code":"confirmed","website_content":"not_checked"}', 'each Release reads its own read-back');
 perform pg_temp.cr_assert((facts#>>'{requests,doneCount}')::int = 2 and (facts#>>'{requests,openCount}')::int = 1 and (facts#>>'{requests,askedCount}')::int = 3,
   'requests: delivery accepted and confirmed website change are done; one is open');
 perform pg_temp.cr_assert((facts#>>'{usage,calls}')::int = 2 and facts#>'{usage,byPurpose}' = '{"ask":1,"report":1}', 'usage counts calls, no cost');
 perform pg_temp.cr_assert(not (facts::text like '%cost%'), 'no cost in the report');
 perform pg_temp.cr_assert((facts#>>'{outcomes,available}')::boolean is true, 'outcomes read through the existing month');
 perform pg_temp.cr_assert((facts#>>'{siteChecks,hosted,checks}')::int = 1 and (facts#>>'{siteChecks,readBacks,confirmed}')::int = 1, 'site checks from stored rows');
 perform pg_temp.cr_assert((facts#>>'{time,minutes}')::int = 0, 'no time yet');

 -- Scope.
 r := public.generate_care_reports(ag, us, es, m, array[a], null);
 perform pg_temp.cr_assert(r#>>'{skipped,0,reason}' = 'not_allowed', 'staff cannot generate');
 perform pg_temp.cr_raises(format('select public.generate_care_reports(%L,%L,%L,%L,%L,null)', ag, uother, eother, m, array[a]), 'workspace_access_denied');
 r := public.generate_care_reports(ag, uo, eo, m, array[ended, a], '{}'::jsonb);
 perform pg_temp.cr_assert(jsonb_array_length(r->'skipped') = 1 and r#>>'{skipped,0,workspaceId}' = ended::text, 'a client with an ended seat is skipped');
 perform pg_temp.cr_assert((r->'reports'->0->>'revision')::int = 2, 'regenerating bumps the revision');
 perform pg_temp.cr_raises(format('select public.generate_care_reports(%L,%L,%L,%L,%L,null)', ag, uo, eo, m + 40, array[a]), 'care_report_invalid');
 r := public.generate_care_reports(ag, uo, eo, m, array[a], format('{"%s":[{"host":"x"}]}', a)::jsonb);
 perform pg_temp.cr_assert(r#>>'{skipped,0,reason}' = 'failed' and jsonb_array_length(r->'reports') = 0, 'malformed site checks skip the client');
 r := public.generate_care_reports(ag, uo, eo, m, array[a], format('{"%s":[{"host":"harbor.example.test","state":"up","checkedAt":"2026-10-01T00:00:00Z"}]}', a)::jsonb);
 rep := (r->'reports'->0->>'reportId')::uuid;
 perform pg_temp.cr_assert(jsonb_array_length((select draft#>'{siteChecks,latest}' from public.care_reports where id = rep)) = 1, 'latest site check stored');

 -- List: staff see their client read-only; another agency's owner is denied.
 r := public.list_care_reports(ag, us, es, m);
 perform pg_temp.cr_assert(not (r->>'canGenerate')::boolean and jsonb_array_length(r->'clients') = 1 and not (r#>>'{clients,0,canWrite}')::boolean, 'staff list is read-only');
 r := public.list_care_reports(ag, uo, eo, m);
 perform pg_temp.cr_assert((r->>'canGenerate')::boolean and jsonb_array_length(r->'clients') = 1 and (r#>>'{clients,0,soFar,releasesRecorded}')::int = 4
   and (r#>>'{clients,0,soFar,changesVerified}')::int = 3, 'owner list: one active client with so-far counts');
 perform pg_temp.cr_raises(format('select public.list_care_reports(%L,%L,%L,%L)', ag, uother, eother, m), 'workspace_access_denied');

 -- Note and revision conflict.
 view := public.read_care_report(rep, uo, eo);
 rev := (view#>>'{report,revision}')::int;
 perform pg_temp.cr_assert(view->>'audience' = 'agency' and (view->>'canWrite')::boolean, 'agency view');
 view := public.save_care_report_note(rep, uo, eo, '  Thanks for a good month.  ', rev);
 perform pg_temp.cr_assert(view#>>'{report,agencyNote}' = 'Thanks for a good month.' and (view#>>'{report,revision}')::int = rev + 1, 'note saved, revision bumped');
 perform pg_temp.cr_raises(format('select public.save_care_report_note(%L,%L,%L,%L,%s)', rep, uo, eo, 'late', rev), 'care_report_revision_conflict');
 perform pg_temp.cr_raises(format('select public.save_care_report_note(%L,%L,%L,%L,%s)', rep, us, es, 'staff', rev + 1), 'workspace_access_denied');
 view := public.read_care_report(rep, us, es);
 perform pg_temp.cr_assert(view->>'audience' = 'agency' and not (view->>'canWrite')::boolean, 'staff can read, not write');

 -- The owner sees nothing until a Release is published.
 perform pg_temp.cr_raises(format('select public.read_care_report(%L,%L,%L)', rep, ucl, ecl), 'care_report_not_found');
 perform pg_temp.cr_assert(public.list_owner_care_reports(a, ucl, ecl) = '[]'::jsonb, 'owner list empty before publishing');
 perform pg_temp.cr_raises(format('select public.read_care_report(%L,%L,%L)', rep, ustr, estr), 'workspace_access_denied');

 -- Publish: Release 1, then Release 2; Releases never change.
 rev := (public.read_care_report(rep, uo, eo)#>>'{report,revision}')::int;
 perform pg_temp.cr_raises(format('select public.publish_care_report(%L,%L,%L,%s)', rep, uo, eo, rev - 1), 'care_report_revision_conflict');
 r := public.publish_care_report(rep, uo, eo, rev);
 perform pg_temp.cr_assert((r->>'number')::int = 1, 'Release 1');
 perform pg_temp.cr_raises(format('select public.publish_care_report(%L,%L,%L,%s)', rep, uo, eo, rev), 'care_report_revision_conflict');
 rev := (public.read_care_report(rep, uo, eo)#>>'{report,revision}')::int;
 r := public.publish_care_report(rep, uo, eo, rev);
 perform pg_temp.cr_assert((r->>'number')::int = 2, 'Release 2');
 rid := (r->>'releaseId')::uuid;
 perform pg_temp.cr_raises('update public.care_report_releases set snapshot = ''{}''', 'care_report_append_only');
 perform pg_temp.cr_raises('delete from public.care_report_releases', 'care_report_append_only');
 select snapshot into rel from public.care_report_releases where report_id = rep and number = 2;
 perform pg_temp.cr_assert(rel->>'agencyNote' = 'Thanks for a good month.' and (rel->>'release')::int = 2 and rel ? 'publishedAt' and rel ? 'changes', 'snapshot carries facts, note and Release number');

 -- The owner reads Releases only.
 view := public.read_care_report(rep, ucl, ecl);
 perform pg_temp.cr_assert(view->>'audience' = 'owner' and not (view ? 'deliveries') and not (view ? 'shareLink') and not (view->'report' ? 'draft')
   and not (view->'report' ? 'agencyNote') and jsonb_array_length(view->'releases') = 2, 'owner view has Releases only');
 r := public.list_owner_care_reports(a, ucl, ecl);
 perform pg_temp.cr_assert(jsonb_array_length(r) = 1 and r#>>'{0,agencyName}' = 'North Studio' and (r#>>'{0,latestRelease,number}')::int = 2, 'owner list names the agency and latest Release');
 perform pg_temp.cr_raises(format('select public.list_owner_care_reports(%L,%L,%L)', a, ustr, estr), 'workspace_access_denied');

 -- Share links: one open link, revoke, and the seat ending closes it.
 perform pg_temp.cr_raises(format('select public.issue_care_report_share_link(%L,%L,%L,%L)', rep, uo, eo, 'nothex'), 'care_report_invalid');
 perform public.issue_care_report_share_link(rep, uo, eo, tok);
 r := public.read_shared_care_report(tok, null);
 perform pg_temp.cr_assert((r#>>'{release,number}')::int = 2 and r->>'businessName' = 'Harbor Dental' and jsonb_array_length(r->'releases') = 2, 'shared read gives the latest Release');
 perform pg_temp.cr_assert((public.read_shared_care_report(tok, 1)#>>'{release,number}')::int = 1 and public.read_shared_care_report(tok, 9) is null, 'a named Release, and none for a missing number');
 perform public.issue_care_report_share_link(rep, uo, eo, tok2);
 perform pg_temp.cr_assert(public.read_shared_care_report(tok, null) is null and public.read_shared_care_report(tok2, null) is not null, 'a new link replaces the old one');
 perform pg_temp.cr_assert(public.read_care_report(rep, uo, eo)#>>'{shareLink,createdAt}' is not null, 'agency sees an open link');
 perform pg_temp.cr_assert((public.revoke_care_report_share_link(rep, uo, eo)->>'revoked')::boolean, 'revoke reports it revoked');
 perform pg_temp.cr_assert(public.read_shared_care_report(tok2, null) is null, 'revoked link reads nothing');
 perform pg_temp.cr_assert(not (public.revoke_care_report_share_link(rep, uo, eo)->>'revoked')::boolean, 'revoking again changes nothing');
 perform pg_temp.cr_raises(format('select public.revoke_care_report_share_link(%L,%L,%L)', rep, us, es), 'workspace_access_denied');
 perform public.issue_care_report_share_link(rep, uo, eo, tok3);
 update public.provider_seats set status = 'ended', ended_by = uo, ended_at = now(), end_reason = 'fixture' where customer_workspace_id = a and status = 'active';
 perform pg_temp.cr_assert(public.read_shared_care_report(tok3, null) is null, 'a link stops reading when the seat ends');
 -- The seat returns for the rest of the checks.
 insert into public.provider_seats(customer_workspace_id, agency_workspace_id, granted_by_kind, granted_by) values (a, ag, 'owner', ucl);
 insert into public.agency_client_staff(agency_workspace_id, customer_workspace_id, user_id, assigned_by) values (ag, a, us, uo)
   on conflict do nothing;
 perform pg_temp.cr_assert(public.read_shared_care_report(tok3, null) is not null, 'and reads again with an active seat');

 -- Delivery: held attempts may repeat; one reserved send at a time.
 perform public.record_care_report_delivery(rid, uo, eo, null, null, 'suppressed', 'email_off', null);
 perform public.record_care_report_delivery(rid, uo, eo, null, null, 'suppressed', 'email_off', null);
 perform pg_temp.cr_assert((select count(*) from public.care_report_deliveries where status = 'suppressed') = 2, 'held attempts repeat');
 perform pg_temp.cr_raises(format('select public.record_care_report_delivery(%L,%L,%L,null,null,%L,null,null)', rid, uo, eo, 'accepted'), 'care_report_invalid');
 r := public.reserve_care_report_delivery(rid, uo, eo);
 perform pg_temp.cr_raises(format('select public.reserve_care_report_delivery(%L,%L,%L)', rid, uo, eo), 'care_report_delivery_exists');
 perform pg_temp.cr_raises(format('select public.record_care_report_delivery(%L,%L,%L,%L,%L,%L,null,null)', rid, uo, eo, r->>'deliveryId', gen_random_uuid(), 'accepted'), 'care_report_delivery_unknown');
 perform public.record_care_report_delivery(rid, uo, eo, (r->>'deliveryId')::uuid, (r->>'token')::uuid, 'accepted', null, 'msg_fixture');
 perform pg_temp.cr_raises(format('select public.reserve_care_report_delivery(%L,%L,%L)', rid, uo, eo), 'care_report_delivery_exists');
 perform pg_temp.cr_assert(public.read_care_report(rep, uo, eo)#>>'{deliveries,0,status}' is not null, 'deliveries listed for the agency');
 perform pg_temp.cr_raises(format('select public.reserve_care_report_delivery(%L,%L,%L)', rid, us, es), 'workspace_access_denied');

 -- Agency time: idempotent, conflicting, voidable only by its recorder or an admin.
 t := jsonb_build_object('id', t1, 'minutes', 45, 'category', 'change', 'occurredOn', current_date, 'note', 'Opening hours');
 r := public.record_agency_client_time(ag, a, uo, eo, t);
 perform pg_temp.cr_assert((r->>'minutes')::int = 45, 'time recorded');
 r := public.record_agency_client_time(ag, a, uo, eo, t);
 perform pg_temp.cr_assert((select count(*) from public.agency_client_time_entries) = 1, 'same payload is idempotent');
 perform pg_temp.cr_raises(format('select public.record_agency_client_time(%L,%L,%L,%L,%L::jsonb)', ag, a, uo, eo, (t || '{"minutes":50}')::text), 'care_time_conflict');
 perform pg_temp.cr_raises(format('select public.record_agency_client_time(%L,%L,%L,%L,%L::jsonb)', ag, a, uo, eo, (t || jsonb_build_object('id', gen_random_uuid(), 'extra', 1))::text), 'care_time_invalid');
 perform pg_temp.cr_raises(format('select public.record_agency_client_time(%L,%L,%L,%L,%L::jsonb)', ag, a, uo, eo, (t || jsonb_build_object('id', gen_random_uuid(), 'occurredOn', current_date + 3))::text), 'care_time_invalid');
 perform pg_temp.cr_raises(format('select public.record_agency_client_time(%L,%L,%L,%L,%L::jsonb)', ag, a, uother, eother, t::text), 'workspace_access_denied');
 perform pg_temp.cr_assert(jsonb_array_length(public.list_agency_client_time(ag, a, us, es, date_trunc('month', current_date)::date)) = 1, 'staff reads time for their client');
 perform pg_temp.cr_raises(format('select public.void_agency_client_time(%L,%L,%L,%L,%L)', ag, us, es, t1, 'not mine'), 'workspace_access_denied');
 perform pg_temp.cr_raises('update public.agency_client_time_entries set minutes = 1', 'care_report_append_only');
 facts := public.care_report_facts(ag, a, date_trunc('month', current_date)::date, null);
 perform pg_temp.cr_assert((facts#>>'{time,minutes}')::int = 45 and facts#>'{time,byCategory}' = '{"change":45}', 'time counts in the facts');
 perform public.void_agency_client_time(ag, uo, eo, t1, 'Entered twice');
 perform public.void_agency_client_time(ag, uo, eo, t1, 'Entered twice');
 facts := public.care_report_facts(ag, a, date_trunc('month', current_date)::date, null);
 perform pg_temp.cr_assert((facts#>>'{time,minutes}')::int = 0 and (public.list_agency_client_time(ag, a, uo, eo, date_trunc('month', current_date)::date)#>>'{0,voided}')::boolean, 'a voided entry stops counting but stays listed');

 -- ACLs.
 for fn in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any(array[
   'generate_care_reports','list_care_reports','read_care_report','save_care_report_note','publish_care_report','issue_care_report_share_link',
   'revoke_care_report_share_link','read_shared_care_report','reserve_care_report_delivery','record_care_report_delivery','list_owner_care_reports',
   'record_agency_client_time','void_agency_client_time','list_agency_client_time']) loop
   checked := checked + 1;
   perform pg_temp.cr_assert(not has_function_privilege('anon', fn, 'execute') and not has_function_privilege('authenticated', fn, 'execute')
     and has_function_privilege('service_role', fn, 'execute'), 'RPC ACL: ' || fn::text);
 end loop;
 perform pg_temp.cr_assert(checked = 14, 'all fourteen RPCs checked');
 for fn in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any(array[
   'care_report_ts','care_report_agency_role','care_report_clients','care_report_facts','care_report_append_only']) loop
   perform pg_temp.cr_assert(not has_function_privilege('anon', fn, 'execute') and not has_function_privilege('authenticated', fn, 'execute')
     and not has_function_privilege('service_role', fn, 'execute'), 'helper ACL: ' || fn::text);
 end loop;
 perform pg_temp.cr_assert(not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in
   ('care_reports','care_report_releases','care_report_share_links','care_report_deliveries','agency_client_time_entries','agency_client_time_voids')
   and (not c.relrowsecurity or has_table_privilege('service_role', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))), 'tables: RLS on, no API privilege');
 perform pg_temp.cr_assert((select array_agg(p.proname::text order by p.proname) from pg_proc p where p.pronamespace = 'public'::regnamespace
   and p.provolatile = 's' and (p.proname like '%care_report%' or p.proname like '%agency_client_time%')) = array['read_shared_care_report'], 'the only stable function is read_shared_care_report');
 perform pg_temp.cr_assert(exists (select 1 from pg_proc where proname = 'read_shared_care_report' and prosrc !~* 'for (update|share|no key update|key share)'), 'the shared read takes no row locks');
end $$;
rollback;
