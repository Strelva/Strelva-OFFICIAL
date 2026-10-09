\set ON_ERROR_STOP on
-- Root-owned native local window only. Read-only catalog contract; no seeds,
-- provider writes, production access or claim of a completed tenant teardown.
begin read only;
do $$
declare table_name text; sweep text[]; purge text;
begin
 select public.tenant_teardown_tables() into sweep;
 foreach table_name in array array['connected_inquiry_owner_notices','operator_google_write_attempts','workspace_newsletter_issues'] loop
  if table_name=any(sweep) then raise exception 'workspace_evidence_slug_swept: %',table_name; end if;
 end loop;
 foreach table_name in array array['connected_inquiry_owner_notices','operator_google_write_attempts'] loop
  if has_table_privilege('service_role','public.'||table_name,'SELECT') then raise exception 'closed_evidence_direct_read: %',table_name; end if;
  if exists(select 1 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
   where c.contype='f' and c.conrelid=('public.'||table_name)::regclass and a.attname='tenant_id') then
   raise exception 'historical_tenant_scope_became_fk: %',table_name;
  end if;
 end loop;
 if not exists(select 1 from pg_constraint where conrelid='public.operator_google_write_attempts'::regclass
  and confrelid='public.outside_write_receipts'::regclass and contype='f' and confdeltype='r') then
  raise exception 'attempt_receipt_retention_lost';
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.workspace_newsletter_issues'::regclass
  and confrelid='public.tenants'::regclass and contype='f' and confdeltype in ('a','r')) then
  raise exception 'newsletter_tenant_hold_lost';
 end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.workspace_newsletter_issues'::regclass
  and not tgisinternal and tgenabled<>'D' and tgname='workspace_newsletter_issue_immutable') then
  raise exception 'newsletter_history_guard_lost';
 end if;
 select pg_get_functiondef('public.purge_expired_tenant_leads(integer)'::regprocedure) into purge;
 if position('workspace_id is null' in purge)=0 or position('delete from public.connected_inquiry_owner_notices' in purge)=0 then
  raise exception 'notice_orphan_retention_owner_lost';
 end if;
 raise notice 'Native catalog confirms workspace newsletter hold, closed historical evidence and orphan notice purge ownership; attempt request expiry remains a separate unresolved policy';
end $$;
rollback;
