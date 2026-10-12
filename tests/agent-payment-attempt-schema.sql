\set ON_ERROR_STOP on
begin;
create function pg_temp.ap_assert(v boolean,m text) returns void language plpgsql as $$begin if v is not true then raise exception 'agent payment fixture: %',m;end if;end;$$;
create function pg_temp.ap_denied(q text,e text) returns void language plpgsql as $$declare caught text;begin begin execute q;exception when others then caught:=sqlerrm;end;perform pg_temp.ap_assert(caught=e,'expected '||e||', got '||coalesce(caught,'success'));end;$$;
do $$declare u uuid='a2921000-0000-4000-8000-000000000001';ws uuid='a2921000-0000-4000-8000-000000000010';p uuid;old_p uuid;begin
 insert into public.users(id,email,verified_at) values(u,'agent-money-owner@example.test',now());
 insert into public.workspaces(id,kind,name,created_by) values(ws,'customer','Fictional SPT merchant',u);
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,u,'owner',u);
 perform public.manage_connected_account(ws,u,'agent-money-owner@example.test','reserve');
 perform public.record_connected_account(ws,'acct_AgentMerchant',array['merchant'],'fixture-profile','{}','{}',true);
 p:=(public.reserve_business_payment(ws,'agent-attempt-fixture','agent',1000,'usd',null)->>'id')::uuid;
 perform public.claim_business_payment_channel(p,'agent');
 perform pg_temp.ap_denied(format('select public.prepare_agent_payment_attempt(%L,''acct_Other'')',p),'agent_payment_attempt_denied');
 perform pg_temp.ap_assert(public.prepare_agent_payment_attempt(p,'acct_AgentMerchant')='{}'::jsonb,'first create attempt has no invented provider object');
 perform pg_temp.ap_denied(format('select public.recover_agent_payment_provider(%L,''acct_AgentMerchant'',''pi_Agent'',1000,''usd'')',p),'agent_payment_provider_observation_mismatch');
 insert into public.agent_payment_reservations(payment_id,workspace_id,amount_cents,currency) values(p,ws,1000,'usd');
 perform pg_temp.ap_denied(format('select public.recover_agent_payment_provider(%L,''acct_AgentMerchant'',''pi_Agent'',999,''usd'')',p),'agent_payment_provider_observation_mismatch');
 perform pg_temp.ap_assert(public.recover_agent_payment_provider(p,'acct_AgentMerchant','pi_Agent',1000,'usd'),'signed exact observation binds reserved intent');
 perform pg_temp.ap_assert(public.prepare_agent_payment_attempt(p,'acct_AgentMerchant')->>'providerObjectId'='pi_Agent','retries require provider readback');
 perform pg_temp.ap_denied(format('select public.recover_agent_payment_provider(%L,''acct_AgentMerchant'',''pi_Other'',1000,''usd'')',p),'payment_provider_binding_conflict');
 old_p:=(public.reserve_business_payment(ws,'agent-old-attempt-fixture','agent',1000,'usd',null)->>'id')::uuid;
 perform public.claim_business_payment_channel(old_p,'agent');
 insert into public.business_payment_attempts(payment_id,started_at) values(old_p,clock_timestamp()-interval '24 hours');
 perform pg_temp.ap_denied(format('select public.prepare_agent_payment_attempt(%L,''acct_AgentMerchant'')',old_p),'payment_attempt_requires_reconciliation');
 perform pg_temp.ap_assert(not has_function_privilege('anon','public.recover_agent_payment_provider(uuid,text,text,bigint,text)','EXECUTE'),'public caller cannot attest provider effects');
end;$$;
rollback;
