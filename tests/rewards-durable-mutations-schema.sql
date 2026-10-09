\set ON_ERROR_STOP on
-- Execute only in the parent-owned qualified disposable schema containing 1750.
begin;
set local statement_timeout='15s';
set local lock_timeout='3s';
insert into public.users(id,email,verified_at) values
 ('17500000-0000-4000-8000-000000000001','reward-owner-proof@example.test',now()),
 ('17500000-0000-4000-8000-000000000002','reward-outsider-proof@example.test',now());
insert into public.tenants(id,site_name) values ('fictional-rewards-proof','Fictional reward proof');
insert into public.memberships(user_id,tenant_id,tenant_stable_id,role)
 select '17500000-0000-4000-8000-000000000001',id,stable_id,'owner' from public.tenants where id='fictional-rewards-proof';
create temporary table reward_test_input(member jsonb,actor jsonb);
insert into reward_test_input values ('{"email":"reward-member-proof@example.test","starsAvailable":"100","starsLifetime":"490","tier":"snapper","tierOverride":"","displayName":"Fictional member","birthday":"01-01","favoriteFruit":"Apple","badges":"[]","subscriptionBonusClaimed":"true","createdAt":"2026-01-01T00:00:00Z","unknownFutureField":{"preserved":true}}',
 '{"userId":"17500000-0000-4000-8000-000000000001","verifiedEmail":"reward-owner-proof@example.test"}');
do $$
declare m jsonb; a jsonb; r jsonb; before_payload jsonb; count_before integer; txn jsonb; f boolean;
begin
 select member,actor into m,a from reward_test_input;
 if has_function_privilege('anon','public.mutate_tenant_reward_record(text,text,jsonb)','execute') or has_function_privilege('authenticated','public.mutate_tenant_reward_record(text,text,jsonb)','execute')
 or not has_function_privilege('service_role','public.mutate_tenant_reward_record(text,text,jsonb)','execute') or has_table_privilege('service_role','public.tenant_reward_mutations','select') then raise exception 'rewards_exposure'; end if;
 r:=public.mutate_tenant_reward_record('fictional-rewards-proof','reward-member-proof@example.test',jsonb_build_object('operation','save','commandId','create','member',m,'tierThreshold',500));
 if r->>'status'<>'saved' then raise exception 'rewards_create'; end if;
 txn:=jsonb_build_object('id','txn_proof-credit','type','admin-credit','amount',20,'reason','Owner correction','timestamp','2026-10-09T00:00:00Z');
 r:=public.mutate_tenant_reward_record('fictional-rewards-proof','reward-member-proof@example.test',jsonb_build_object('operation','adjust','commandId','credit','delta',20,'tierThreshold',500,'actor',a,'transaction',txn));
 if r->'member'->>'starsAvailable'<>'120' or r->'member'->>'starsLifetime'<>'510' or r->'member'->>'tier'<>'super-snapper'
 or r->'member'->'unknownFutureField'<>m->'unknownFutureField' or r->'transaction'->>'reason'<>'Owner correction' then raise exception 'rewards_credit_preservation'; end if;
 if (select payload_hash from public.tenant_client_records where store='reward_members' and record_id='reward-member-proof@example.test')<>encode(sha256(convert_to(public.reward_record_canonical_json(r->'member'),'UTF8')),'hex') then raise exception 'rewards_parity_hash'; end if;
 before_payload:=r;
 r:=public.mutate_tenant_reward_record('fictional-rewards-proof','reward-member-proof@example.test',jsonb_build_object('operation','adjust','commandId','credit','delta',20,'tierThreshold',500,'actor',a,'transaction',txn||'{"timestamp":"2026-10-10T00:00:00Z"}'));
 if r is distinct from before_payload then raise exception 'rewards_replay_receipt'; end if;
 if (select count(*) from public.tenant_client_records where store='reward_transactions' and record_id='txn_proof-credit')<>1 then raise exception 'rewards_duplicate_transaction'; end if;
 f:=false;begin perform public.mutate_tenant_reward_record('fictional-rewards-proof','reward-member-proof@example.test',jsonb_build_object('operation','adjust','commandId','credit','delta',21,'tierThreshold',500,'actor',a,'transaction',txn||'{"amount":21}'));exception when others then if sqlerrm<>'rewards_command_conflict' then raise;end if; f:=true;end;
 if not f then raise exception 'rewards_changed_retry_accepted';end if;
 r:=public.mutate_tenant_reward_record('fictional-rewards-proof','reward-member-proof@example.test','{"operation":"adjust","commandId":"debit","delta":-100,"tierThreshold":500}');
 if r->'member'->>'starsAvailable'<>'20' or r->'member'->>'starsLifetime'<>'510' then raise exception 'rewards_debit_lifetime'; end if;
 r:=public.mutate_tenant_reward_record('fictional-rewards-proof','reward-member-proof@example.test','{"operation":"adjust","commandId":"overspend","delta":-21,"tierThreshold":500}');
 if r->>'status'<>'insufficient' or r->>'available'<>'20' or r->>'requested'<>'21' then raise exception 'rewards_overspend';end if;
 -- The original stale full profile cannot resurrect 100 stars or lose lifetime.
 r:=public.mutate_tenant_reward_record('fictional-rewards-proof','reward-member-proof@example.test',jsonb_build_object('operation','save','commandId','profile','member',m||'{"displayName":"Changed","tierOverride":"snapper"}','tierThreshold',500));
 if r->'member'->>'starsAvailable'<>'20' or r->'member'->>'starsLifetime'<>'510' or r->'member'->>'tier'<>'snapper' or r->'member'->>'createdAt'<>m->>'createdAt' then raise exception 'rewards_profile_overwrite';end if;
 r:=public.mutate_tenant_reward_record('fictional-rewards-proof','reward-member-proof@example.test',jsonb_build_object('operation','save','commandId','clear-override','member',m,'tierThreshold',500));
 if r->'member'->>'tier'<>'super-snapper' then raise exception 'rewards_override_clear';end if;
 select payload into before_payload from public.tenant_client_records where store='reward_members' and record_id='reward-member-proof@example.test';
 select count(*) into count_before from public.tenant_reward_mutations;
 f:=false;begin perform public.mutate_tenant_reward_record('fictional-rewards-proof','reward-member-proof@example.test',jsonb_build_object('operation','adjust','commandId','transaction-conflict','delta',1,'tierThreshold',500,'actor',a,'transaction',txn||'{"amount":1}'));exception when others then if sqlerrm<>'rewards_transaction_conflict' then raise;end if;f:=true;end;
 if not f or (select payload from public.tenant_client_records where store='reward_members' and record_id='reward-member-proof@example.test') is distinct from before_payload or (select count(*) from public.tenant_reward_mutations)<>count_before then raise exception 'rewards_partial_transaction';end if;
 f:=false;begin perform public.mutate_tenant_reward_record('fictional-rewards-proof','reward-member-proof@example.test','{"operation":"adjust","commandId":"unsafe","delta":9007199254740992,"tierThreshold":500}');exception when others then if sqlerrm<>'rewards_invalid_delta' then raise;end if;f:=true;end;
 if not f then raise exception 'rewards_unsafe_accepted';end if;
 -- Even a forward-dated delayed copy cannot overwrite native financial state.
 f:=false;begin perform public.record_tenant_client_record('fictional-rewards-proof','reward_members','reward-member-proof@example.test',m,encode(sha256(convert_to(public.reward_record_canonical_json(m),'UTF8')),'hex'),'2099-01-01','repair','replace');exception when others then if sqlerrm<>'rewards_native_authority_required' then raise;end if;f:=true;end;
 if not f then raise exception 'rewards_future_copy_overwrote_native';end if;
 if coalesce(current_setting('strelva.reward_record_native',true),'')<>'' then raise exception 'rewards_native_flag_leaked';end if;
 f:=false;begin perform public.mutate_tenant_reward_record('fictional-rewards-proof','reward-member-proof@example.test',jsonb_build_object('operation','adjust','commandId','foreign' ,'delta',1,'tierThreshold',500,'actor',a||'{"userId":"17500000-0000-4000-8000-000000000002","verifiedEmail":"reward-outsider-proof@example.test"}'));exception when others then if sqlerrm<>'rewards_access_denied' then raise;end if;f:=true;end;
 if not f then raise exception 'rewards_foreign_accepted';end if;
 delete from public.memberships where user_id='17500000-0000-4000-8000-000000000001' and tenant_id='fictional-rewards-proof';
 f:=false;begin perform public.mutate_tenant_reward_record('fictional-rewards-proof','reward-member-proof@example.test',jsonb_build_object('operation','adjust','commandId','credit','delta',20,'tierThreshold',500,'actor',a,'transaction',txn));exception when others then if sqlerrm<>'rewards_access_denied' then raise;end if;f:=true;end;
 if not f then raise exception 'rewards_revoked_replay_accepted';end if;
 r:=public.mutate_tenant_reward_record('fictional-rewards-proof','absent@example.test','{"operation":"adjust","commandId":"missing","delta":1,"tierThreshold":500}');
 if r->>'status'<>'missing' then raise exception 'rewards_missing_created';end if;
end $$;
rollback;
\echo GREEN rewards atomic balance/reason/replay/profile/permission/overflow contract
