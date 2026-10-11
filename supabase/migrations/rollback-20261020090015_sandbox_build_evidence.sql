begin;
select public.sandbox_build_rollback_assert_unused();
drop function public.read_sandbox_build_attempt(uuid,uuid,text),public.reconcile_sandbox_build_billing(uuid),public.record_sandbox_build_billing_evidence(uuid,text,text,text,text,text,text),public.record_sandbox_build_observation(uuid,text,text,text,text,text,jsonb),public.begin_sandbox_build_attempt(uuid,uuid,text),public.prepare_sandbox_build_attempt(uuid,integer,integer,text,text,text,text,text,uuid,text),public.sandbox_build_rollback_assert_unused();
drop table public.sandbox_build_billing_evidence,public.sandbox_build_observations,public.sandbox_build_attempts;
drop function public.sandbox_build_immutable();
commit;
