\set ON_ERROR_STOP on
-- Run against the complete ordered schema after 20261025110000. Fictional data;
-- all fixture rows and model costs roll back, including conversion triggers.
begin;
create function pg_temp.legacy_ai_assert(condition boolean, detail text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'legacy AI assertion failed: %',detail; end if; end; $$;
insert into public.users(id,email,verified_at) values
 ('da110000-0000-4000-8000-000000000001','done-trust-ai@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('da110000-0000-4000-8000-000000000010','customer','Legacy AI fixture','da110000-0000-4000-8000-000000000001'),
 ('da110000-0000-4000-8000-000000000020','customer','Unpaid AI fixture','da110000-0000-4000-8000-000000000001');
insert into public.tenants(id,stable_id,site_name,subscription_status) values
 ('done-trust-ai-linked','da110000-0000-4000-8000-000000000030','Linked fixture','active'),
 ('done-trust-ai-unlinked','da110000-0000-4000-8000-000000000040','Unlinked fixture','active');
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt)
 values('da110000-0000-4000-8000-000000000030','done-trust-ai-linked','da110000-0000-4000-8000-000000000010',
 'da110000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('a',64),'{}');
select pg_temp.legacy_ai_assert(public.business_ai_budget(null) is null
 and public.business_ai_budget('da110000-0000-4000-8000-000000000099') is null,'unknown workspaces are unavailable');
select pg_temp.legacy_ai_assert((public.business_ai_budget('da110000-0000-4000-8000-000000000010')->>'subscribed')::boolean
 and public.business_ai_budget('da110000-0000-4000-8000-000000000010')->'capCents'='null'::jsonb,'legacy active is subscribed without an invented cap');
select pg_temp.legacy_ai_assert(not (public.business_ai_budget('da110000-0000-4000-8000-000000000020')->>'subscribed')::boolean
 and public.reserve_business_ai_budget('da110000-0000-4000-8000-000000000020',.01,0)->>'status'='paused','another tenant cannot entitle an unpaid workspace');
update public.tenants set subscription_status='trialing' where id='done-trust-ai-linked';
select pg_temp.legacy_ai_assert((public.business_ai_budget('da110000-0000-4000-8000-000000000010')->>'subscribed')::boolean,'legacy trialing is subscribed');
update public.tenants set subscription_status='none', active=true where id='done-trust-ai-linked';
select pg_temp.legacy_ai_assert((public.business_ai_budget('da110000-0000-4000-8000-000000000010')->>'subscribed')::boolean,'active managed client outside Stripe keeps AI');
update public.tenants set active=false where id='done-trust-ai-linked';
select pg_temp.legacy_ai_assert(not (public.business_ai_budget('da110000-0000-4000-8000-000000000010')->>'subscribed')::boolean,'inactive client without a subscription is not entitled');
update public.tenants set active=true where id='done-trust-ai-linked';
do $$ declare status text; begin
 foreach status in array array['past_due','canceled','unpaid','incomplete','incomplete_expired','paused'] loop
  update public.tenants set subscription_status=status where id='done-trust-ai-linked';
  perform pg_temp.legacy_ai_assert(not (public.business_ai_budget('da110000-0000-4000-8000-000000000010')->>'subscribed')::boolean,'non-entitled status '||status);
 end loop;
end $$;
update public.tenants set subscription_status='active' where id='done-trust-ai-linked';
insert into public.work_allowance_subscription_entitlements(workspace_id,payer_id,stripe_subscription_id,config_key,status,
 period_start,period_end,spending_cap_cents,grants,last_event_id,last_event_created,terms_digest)
 values('da110000-0000-4000-8000-000000000010','da110000-0000-4000-8000-000000000001','sub_done_trust_fixture','done-trust','active',
 now()-interval '1 day',now()+interval '1 day',100,'[]','evt_done_trust_fixture',1,repeat('b',32));
select pg_temp.legacy_ai_assert(public.business_ai_budget('da110000-0000-4000-8000-000000000010')->>'capCents'='100'
 and (public.business_ai_budget('da110000-0000-4000-8000-000000000010')->>'resetsAt')::timestamptz=now()+interval '1 day','native cap and period override legacy entitlement');
select pg_temp.legacy_ai_assert(public.reserve_business_ai_budget('da110000-0000-4000-8000-000000000010',.6,0)->>'status'='reserved','native cap admits the first hold despite zero free cap');
select pg_temp.legacy_ai_assert(public.reserve_business_ai_budget('da110000-0000-4000-8000-000000000010',.5,0)->>'status'='paused','native cap includes held costs and ignores free cap');
update public.work_allowance_subscription_entitlements set spending_cap_cents=0 where stripe_subscription_id='sub_done_trust_fixture';
select pg_temp.legacy_ai_assert(public.reserve_business_ai_budget('da110000-0000-4000-8000-000000000010',.01,100)->>'status'='paused','native zero cap stays zero despite legacy payment');
update public.work_allowance_subscription_entitlements set period_start=now()-interval '2 days',period_end=now()-interval '1 day' where stripe_subscription_id='sub_done_trust_fixture';
select pg_temp.legacy_ai_assert(public.business_ai_budget('da110000-0000-4000-8000-000000000010')->'capCents'='null'::jsonb
 and (public.business_ai_budget('da110000-0000-4000-8000-000000000010')->>'subscribed')::boolean,'expired native cap falls back to paid legacy');
-- An uncapped budget is consumed by the app's uncapped path, never admitted
-- against a caller-supplied free cap through this capped-only reservation RPC.
do $$ begin
 begin perform public.reserve_business_ai_budget('da110000-0000-4000-8000-000000000010',.01,100); raise exception 'expected unavailable';
 exception when others then if sqlerrm<>'business_ai_budget_unavailable' then raise; end if; end;
end $$;
select public.record_model_calls(jsonb_build_array(jsonb_build_object('calledAt',clock_timestamp(),'purpose','ask',
 'workspaceId','da110000-0000-4000-8000-000000000020','actorKind','owner','modelLabel','fixture/text','attempt',1,'step',1,
 'latencyMs',1,'outcome','ok','costSource','unknown')));
do $$ begin
 begin perform public.reserve_business_ai_budget('da110000-0000-4000-8000-000000000020',.01,100); raise exception 'expected unknown-cost refusal';
 exception when others then if sqlerrm<>'business_ai_budget_unavailable' then raise; end if; end;
end $$;
select pg_temp.legacy_ai_assert(not has_function_privilege('anon','public.business_ai_budget(uuid)','execute')
 and not has_function_privilege('authenticated','public.business_ai_budget(uuid)','execute')
 and not has_function_privilege('authenticated','public.reserve_business_ai_budget(uuid,numeric,numeric)','execute')
 and has_function_privilege('service_role','public.business_ai_budget(uuid)','execute')
 and not has_table_privilege('service_role','public.business_ai_budget_reservations','insert'),'service-only RPC and no direct holds');
rollback;
