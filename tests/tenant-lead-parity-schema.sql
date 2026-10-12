\set ON_ERROR_STOP on
begin;
create function pg_temp.lp_assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is distinct from true then raise exception 'lead parity assertion: %',p_message; end if; end $$;
insert into public.tenants(id,site_name) values('parity-completeness-one','Parity one'),('parity-completeness-two','Parity two');
delete from public.tenant_client_record_parity where store='tenant_leads';
-- Include every tenant in the local cluster; production tenant coverage is the rule.
insert into public.tenant_client_record_parity(store,tenant_stable_id,checked_on,ok,redis_count,postgres_count,missing,mismatched)
select 'tenant_leads',t.stable_id,(clock_timestamp() at time zone 'UTC')::date-d,true,0,0,0,0
from public.tenants t cross join generate_series(0,6) d;
select pg_temp.lp_assert((public.tenant_lead_read_parity_streak()->>'days')::integer=7,'seven complete days');
delete from public.tenant_client_record_parity where store='tenant_leads'
  and tenant_stable_id=(select stable_id from public.tenants where id='parity-completeness-two')
  and checked_on=(clock_timestamp() at time zone 'UTC')::date-3;
select pg_temp.lp_assert((public.tenant_lead_read_parity_streak()->>'days')::integer=3,'one missing tenant breaks an otherwise successful day');
insert into public.tenant_client_record_parity(store,tenant_stable_id,checked_on,ok,redis_count,postgres_count,missing,mismatched)
select 'tenant_leads',stable_id,(clock_timestamp() at time zone 'UTC')::date-3,true,0,0,0,0 from public.tenants where id='parity-completeness-two';
select public.record_tenant_lead_read_parity('parity-completeness-two',0,0,1,0);
select pg_temp.lp_assert((public.tenant_lead_read_parity_streak()->>'days')::integer=0,'failed check breaks today');
select pg_temp.lp_assert((public.record_tenant_lead_read_parity('parity-completeness-two',0,0,0,0)->>'ok')::boolean=false,'repair cannot erase same-day failure');
select pg_temp.lp_assert((public.tenant_lead_read_parity_streak()->>'days')::integer=0,'failed day remains failed');
-- No checks today allows the preceding completed day to end the window.
delete from public.tenant_client_record_parity where store='tenant_leads' and checked_on=(clock_timestamp() at time zone 'UTC')::date;
select pg_temp.lp_assert((public.tenant_lead_read_parity_streak()->>'days')::integer=6,'completed window may end yesterday');
select public.record_tenant_lead_read_parity('parity-completeness-one',0,0,0,0);
select pg_temp.lp_assert((public.tenant_lead_read_parity_streak()->>'days')::integer=0,'partial today cannot use yesterday to bypass coverage');
select pg_temp.lp_assert(not has_function_privilege('anon','public.tenant_lead_read_parity_streak()','execute')
  and not has_function_privilege('authenticated','public.record_tenant_lead_read_parity(text,integer,integer,integer,integer)','execute')
  and has_function_privilege('service_role','public.tenant_lead_read_parity_streak()','execute'),'service-role-only parity');
rollback;
