\set ON_ERROR_STOP on
-- Fictional, local-only subscribers. Every fixture write rolls back.
begin;
create function pg_temp.nc_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'newsletter assertion failed: %', message; end if; end; $$;
create function pg_temp.nc_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'expected % got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected error: %', expected;
end; $$;

insert into public.users(id,email,verified_at) values
  ('d8000000-0000-4000-8000-000000000001','newsletter-operator@example.test',now()),
  ('d8000000-0000-4000-8000-000000000002','newsletter-owner@example.test',now());
insert into public.super_admins(user_id,email) values ('d8000000-0000-4000-8000-000000000001','newsletter-operator@example.test');
insert into public.tenants(id,stable_id,site_name,active) values
  ('nc-site','d8000000-0000-4000-8000-000000000003','Newsletter Fixture',true),
  ('nc-other','d8000000-0000-4000-8000-000000000004','Other Newsletter Fixture',true),
  ('nc-plain','d8000000-0000-4000-8000-000000000005','Unconverted Newsletter Fixture',true);
create temp table nc_workspaces(name text primary key,id uuid);
insert into nc_workspaces select 'site', (public.convert_tenant_to_business('newsletter-operator@example.test','nc-site',
  '{"tenantId":"nc-site","tenantStableId":"d8000000-0000-4000-8000-000000000003","workspaceName":"Newsletter Fixture","billing":null,"account":null,"patch":{},"contacts":[]}',
  'd8000000-0000-4000-8000-000000000006',repeat('a',64))->>'workspaceId')::uuid;
insert into nc_workspaces select 'other', (public.convert_tenant_to_business('newsletter-operator@example.test','nc-other',
  '{"tenantId":"nc-other","tenantStableId":"d8000000-0000-4000-8000-000000000004","workspaceName":"Other Newsletter Fixture","billing":null,"account":null,"patch":{},"contacts":[]}',
  'd8000000-0000-4000-8000-000000000007',repeat('b',64))->>'workspaceId')::uuid;

select pg_temp.nc_assert(has_function_privilege('service_role','public.subscribe_newsletter_contact(text,uuid,text,text)','EXECUTE')
  and not has_function_privilege('anon','public.subscribe_newsletter_contact(text,uuid,text,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.subscribe_newsletter_contact(text,uuid,text,text)','EXECUTE')
  and not has_function_privilege('service_role','public.newsletter_contact_project(uuid,uuid,text,text,timestamptz)','EXECUTE')
  and not has_table_privilege('service_role','public.newsletter_contact_sync','SELECT'), 'service RPC boundary; private projection and receipts');
select pg_temp.nc_error($$select public.subscribe_newsletter_contact('nc-site',(select id from nc_workspaces where name='other'),'reader@example.test',null)$$,
  'newsletter_contact_link_denied');
select pg_temp.nc_error($$select public.subscribe_newsletter_contact('nc-plain',(select id from nc_workspaces where name='site'),'reader@example.test',null)$$,
  'newsletter_contact_link_denied');
select pg_temp.nc_assert(not exists(select 1 from public.newsletter_subscribers where tenant_id in ('nc-site','nc-other','nc-plain')),
  'cross-workspace and unconverted denials mutate neither subscriber nor contact');

select public.set_workspace_release_flag('newsletter-operator@example.test',(select id from nc_workspaces where name='site'),
  'newsletter_contacts','off','Silent newsletter release',0);
select pg_temp.nc_assert(public.subscribe_newsletter_contact('nc-site',(select id from nc_workspaces where name='site'),'reader@example.test','Reader')->>'enabled'='false',
  'off is rechecked in SQL before any write');
select pg_temp.nc_assert(not exists(select 1 from public.newsletter_contact_sync),'off creates no receipt');
select public.set_workspace_release_flag('newsletter-operator@example.test',(select id from nc_workspaces where name='site'),
  'newsletter_contacts','operators','Operator trial only',1);
select pg_temp.nc_assert(public.subscribe_newsletter_contact('nc-site',(select id from nc_workspaces where name='site'),'reader@example.test','Reader')->>'enabled'='false',
  'operators row is never public subscribe authority');
select public.set_workspace_release_flag('newsletter-operator@example.test',(select id from nc_workspaces where name='site'),
  'newsletter_contacts','on','Local fictional test release',2);

create temp table nc_results(name text primary key,value jsonb);
insert into nc_results select 'first',public.subscribe_newsletter_contact('nc-site',(select id from nc_workspaces where name='site'),'reader@example.test','Reader');
select pg_temp.nc_assert((select value->>'duplicate'='false' and value->>'contact'='linked' from nc_results where name='first'), 'new subscriber and contact saved together');
select pg_temp.nc_assert((select email='reader@example.test' and name='Reader' and sources=array['newsletter']
  from public.business_contacts where workspace_id=(select id from nc_workspaces where name='site') and email='reader@example.test'), 'converted business contact source is newsletter');
insert into nc_results select 'again',public.subscribe_newsletter_contact('nc-site',(select id from nc_workspaces where name='site'),'reader@example.test',null);
select pg_temp.nc_assert((select value->>'duplicate'='true' from nc_results where name='again')
  and (select count(*)=1 from public.business_contacts where workspace_id=(select id from nc_workspaces where name='site')),
  'repeat uses the same contact and legacy duplicate response');
create temp table nc_timestamp as select subscribed_at from public.newsletter_subscribers where tenant_id='nc-site' and email='reader@example.test';
update public.newsletter_subscribers set status='unsubscribed' where tenant_id='nc-site' and email='reader@example.test';
select pg_temp.nc_assert(public.subscribe_newsletter_contact('nc-site',(select id from nc_workspaces where name='site'),'reader@example.test','New Name')->>'duplicate'='true',
  'explicit re-subscribe reports duplicate as the original store does');
select pg_temp.nc_assert((select s.subscribed_at=t.subscribed_at and s.status='active' and s.name='New Name'
  from public.newsletter_subscribers s cross join nc_timestamp t where s.tenant_id='nc-site' and s.email='reader@example.test'), 're-subscribe preserves first subscribed_at');
select pg_temp.nc_assert((select name='Reader' from public.business_contacts where workspace_id=(select id from nc_workspaces where name='site') and email='reader@example.test'),
  'subscription never overwrites a known business contact name');

-- The same address is another business's own contact, never implicitly shared.
select public.set_workspace_release_flag('newsletter-operator@example.test',(select id from nc_workspaces where name='other'),
  'newsletter_contacts','on','Other local test release',0);
select public.subscribe_newsletter_contact('nc-other',(select id from nc_workspaces where name='other'),'reader@example.test','Other Reader');
select pg_temp.nc_assert((select count(distinct id)=2 from public.business_contacts where email='reader@example.test'
  and workspace_id in (select id from nc_workspaces)), 'same email across tenants has independent identity');

select pg_temp.nc_error($$select public.subscribe_newsletter_contact('nc-site',(select id from nc_workspaces where name='site'),'INVALID@example.test',null)$$,
  'newsletter_contact_invalid');
select pg_temp.nc_error($$select public.subscribe_newsletter_contact('nc-site',(select id from nc_workspaces where name='site'),'invalid-address',null)$$,
  'newsletter_contact_invalid');
-- A newsletter persistence failure rolls the RPC back before contact writes.
create function pg_temp.nc_break_subscriber() returns trigger language plpgsql as $$
begin if new.email='not-saved@example.test' then raise exception 'fictional subscriber failure'; end if; return new; end; $$;
create trigger nc_break_subscriber before insert or update on public.newsletter_subscribers for each row execute function pg_temp.nc_break_subscriber();
select pg_temp.nc_error($$select public.subscribe_newsletter_contact('nc-site',(select id from nc_workspaces where name='site'),'not-saved@example.test',null)$$,
  'fictional subscriber failure');
select pg_temp.nc_assert(not exists(select 1 from public.business_contacts where email='not-saved@example.test')
  and not exists(select 1 from public.newsletter_contact_sync where email='not-saved@example.test'), 'subscriber failure cannot create contact or claim projection');
drop trigger nc_break_subscriber on public.newsletter_subscribers;

-- Contact projection failure must never discard the accepted subscription.
create function pg_temp.nc_break_contact() returns trigger language plpgsql as $$
begin if new.email='repair@example.test' then raise exception 'fictional contact failure'; end if; return new; end; $$;
create trigger nc_break before insert or update on public.business_contacts for each row execute function pg_temp.nc_break_contact();
insert into nc_results select 'failed',public.subscribe_newsletter_contact('nc-site',(select id from nc_workspaces where name='site'),'repair@example.test',null);
select pg_temp.nc_assert((select value->>'contact'='failed' and value->>'duplicate'='false' from nc_results where name='failed')
  and exists(select 1 from public.newsletter_subscribers where tenant_id='nc-site' and email='repair@example.test' and status='active')
  and exists(select 1 from public.newsletter_contact_sync where email='repair@example.test' and status='failed' and failure_code='P0001'),
  'subscriber persists and failed projection has a repair receipt');
drop trigger nc_break on public.business_contacts;

-- The address unsubscribes before repair. Repair/backfill NEVER recreates consent.
update public.newsletter_subscribers set status='unsubscribed' where tenant_id='nc-site' and email in ('repair@example.test','reader@example.test');
insert into public.newsletter_subscribers(tenant_id,email,status) values ('nc-site','bad-address','unsubscribed');
insert into nc_results select 'dry',public.backfill_newsletter_contacts('newsletter-operator@example.test','nc-site',(select id from nc_workspaces where name='site'));
select pg_temp.nc_assert((select value->>'dryRun'='true' and value->>'examined'='3' and value->>'invalid'='1'
  and value->>'unsubscribed'='3' and value->>'linked'='0' from nc_results where name='dry'), 'dry-run counts invalid and unsubscribed rows');
select pg_temp.nc_assert(not exists(select 1 from public.business_contacts where email='repair@example.test'), 'dry run performs zero contact writes');
select pg_temp.nc_error($$select public.backfill_newsletter_contacts('newsletter-owner@example.test','nc-site',(select id from nc_workspaces where name='site'))$$,
  'workspace_release_operator_required');
select pg_temp.nc_error($$select public.backfill_newsletter_contacts('newsletter-operator@example.test','nc-site',(select id from nc_workspaces where name='other'))$$,
  'newsletter_contact_link_denied');

insert into nc_results select 'page',public.backfill_newsletter_contacts('newsletter-operator@example.test','nc-site',(select id from nc_workspaces where name='site'),false,null,1);
select pg_temp.nc_assert((select value->>'examined'='1' and value->>'nextAfter'='bad-address' from nc_results where name='page'), 'bounded dry run emits a continuation cursor');
insert into nc_results select 'apply',public.backfill_newsletter_contacts('newsletter-operator@example.test','nc-site',(select id from nc_workspaces where name='site'),true);
select pg_temp.nc_assert((select value->>'linked'='2' and value->>'failed'='0' from nc_results where name='apply')
  and exists(select 1 from public.newsletter_contact_sync where email='repair@example.test' and status='linked')
  and not exists(select 1 from public.newsletter_subscribers where tenant_id='nc-site' and status='active'), 'repair never re-subscribes unsubscribed addresses');

-- Creating a contact independently cannot grant newsletter subscription.
insert into public.business_contacts(workspace_id,email,sources,first_seen_at,last_seen_at)
  values ((select id from nc_workspaces where name='site'),'contact-only@example.test',array['newsletter'],now(),now());
select pg_temp.nc_assert(not exists(select 1 from public.newsletter_subscribers where tenant_id='nc-site' and email='contact-only@example.test'),
  'contact provenance is not newsletter consent');
select public.set_workspace_release_flag('newsletter-operator@example.test',(select id from nc_workspaces where name='site'),
  'newsletter_contacts','off','Rollback local test release',3);
select pg_temp.nc_error($$select public.backfill_newsletter_contacts('newsletter-operator@example.test','nc-site',(select id from nc_workspaces where name='site'),true)$$,
  'newsletter_contact_release_off');
select pg_temp.nc_assert((public.backfill_newsletter_contacts('newsletter-operator@example.test','nc-site',(select id from nc_workspaces where name='site'))->>'dryRun')='true',
  'read-only planning still works when off');
rollback;
