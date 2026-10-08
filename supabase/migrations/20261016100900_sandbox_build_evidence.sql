-- Prepared only. No provider approval, rate, runtime qualification or live call.
begin;
create table public.sandbox_build_attempts (
 id uuid primary key default gen_random_uuid(), work_id uuid not null references public.saved_product_work(id),
 workspace_id uuid not null references public.workspaces(id), application_version integer not null check(application_version>0),
 candidate_revision integer not null check(candidate_revision>=0), source_digest text not null check(source_digest~'^[a-f0-9]{64}$'),
 job_id uuid not null references public.job_economics(id), maximum_cents integer not null check(maximum_cents between 1 and 1000000),
 execution_key text not null, attempt_name text not null unique check(attempt_name~'^strelva-build-[a-f0-9]{48}$'),
 team_id text not null check(team_id~'^[A-Za-z0-9_-]{1,64}$'), project_id text not null check(project_id~'^[A-Za-z0-9_-]{1,64}$'),
 image text not null check(length(image)<=256 and image~'^[A-Za-z0-9_./:-]+@sha256:[a-f0-9]{64}$'),
 admitted_by uuid not null references public.users(id), at timestamptz not null default now(),
 unique(work_id,application_version), foreign key(job_id,execution_key) references public.job_economics_executions(job_id,execution_key)
);
create table public.sandbox_build_observations (
 id uuid primary key default gen_random_uuid(), attempt_id uuid not null references public.sandbox_build_attempts(id),
 kind text not null check(kind in('started','created','stopped','creation_unknown','cleanup_failed','build_failed')),
 session_id text check(session_id~'^[A-Za-z0-9_-]{1,128}$'), payload jsonb not null, at timestamptz not null default now(),
 unique(attempt_id,kind), check(kind not in('created','stopped') or session_id is not null)
);
create table public.sandbox_build_billing_evidence (
 id uuid primary key default gen_random_uuid(), attempt_id uuid not null unique references public.sandbox_build_attempts(id),
 session_id text not null, provider_reference text not null check(length(provider_reference) between 1 and 256),
 currency text not null check(currency='usd'), billable_usd text not null check(length(billable_usd)<=32 and billable_usd~'^(0|[1-9][0-9]*)(\.[0-9]+)?$'),
 at timestamptz not null default now()
);
create function public.sandbox_build_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$begin raise exception 'sandbox_build_immutable';end;$$;
do $$declare t text;begin foreach t in array array['sandbox_build_attempts','sandbox_build_observations','sandbox_build_billing_evidence'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 execute format('create trigger sandbox_build_immutable before update or delete on public.%I for each row execute function public.sandbox_build_immutable()',t);
end loop;end;$$;

create function public.prepare_sandbox_build_attempt(p_work uuid,p_version integer,p_revision integer,p_digest text,p_name text,p_team text,p_project text,p_image text,p_user uuid,p_email text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare w public.saved_product_work;s public.custom_application_states;j public.job_economics;a public.sandbox_build_attempts;k text;claim jsonb;expected_name text;
begin
 w:=public.custom_application_assert_identity(p_work,p_user,p_email,true);
 perform 1 from public.users u join public.workspace_memberships m on m.user_id=u.id where u.id=p_user and u.verified_at is not null and m.workspace_id=w.workspace_id and m.role in('owner','admin') for share of u,m;
 if not found then raise exception 'sandbox_build_access_denied';end if;
 if public.workspace_exit_resources_stopped(w.workspace_id) then raise exception 'sandbox_build_target_stopped';end if;
 select * into s from public.custom_application_states where work_id=p_work for update;
 if not found or s.lifecycle_status='retired' or s.candidate_version<>p_version or s.candidate_revision<>p_revision or s.candidate_source_digest is distinct from p_digest then raise exception 'sandbox_build_target_changed';end if;
 select * into j from public.job_economics where id=s.budget_job_id for update;
 if not found or j.work_id<>p_work or j.workspace_id<>w.workspace_id or j.product_id<>'custom-applications' or j.resource_kind<>'custom-application'
 or j.status not in('accepted','reserved') or j.max_authorized_cents is distinct from s.budget_max_authorized_cents or j.max_authorized_cents<=0
 or j.accepted_by is null or j.accepted_at is null then raise exception 'sandbox_build_budget_required';end if;
 perform 1 from public.users u join public.workspace_memberships m on m.user_id=u.id where u.verified_at is not null and m.workspace_id=coalesce(j.payer_workspace_id,j.workspace_id) and public.work_payer_can_sign(j.payer_kind,j.payer_workspace_id,j.workspace_id,j.payer_id,u.id) for share of u,m;
 if not found then raise exception 'sandbox_build_payer_required';end if;
 expected_name:='strelva-build-'||left(public.custom_application_digest(w.workspace_id,p_work,p_version,p_digest),48);
 if p_name is distinct from expected_name then raise exception 'sandbox_build_attempt_mismatch';end if;
 k:='sandbox-build:'||p_work::text||':'||p_version::text;
 select * into a from public.sandbox_build_attempts where work_id=p_work and application_version=p_version for update;
 if found then
  if a.source_digest<>p_digest or a.job_id<>j.id or a.attempt_name<>p_name or a.team_id is distinct from p_team or a.project_id is distinct from p_project or a.image is distinct from p_image or a.admitted_by<>p_user then raise exception 'sandbox_build_attempt_mismatch';end if;
  return to_jsonb(a);
 end if;
 claim:=public.job_economics_execution_command(jsonb_build_object('action','claim','jobId',j.id,'executionKey',k,'maximumCents',j.max_authorized_cents,'kind','provider','attribution','normal'),p_user,p_email);
 if not (claim->>'claimed')::boolean then raise exception 'sandbox_build_attempt_unresolved';end if;
 insert into public.sandbox_build_attempts(work_id,workspace_id,application_version,candidate_revision,source_digest,job_id,maximum_cents,execution_key,attempt_name,team_id,project_id,image,admitted_by)
 values(p_work,w.workspace_id,p_version,p_revision,p_digest,j.id,j.max_authorized_cents,k,p_name,p_team,p_project,p_image,p_user) returning * into a;
 return to_jsonb(a);
end;$$;

create function public.begin_sandbox_build_attempt(p_attempt uuid,p_user uuid,p_email text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.sandbox_build_attempts;w public.saved_product_work;s public.custom_application_states;j public.job_economics;
begin
 select * into a from public.sandbox_build_attempts where id=p_attempt;if not found then raise exception 'sandbox_build_attempt_missing';end if;
 w:=public.custom_application_assert_identity(a.work_id,p_user,p_email,true);
 perform 1 from public.users u join public.workspace_memberships m on m.user_id=u.id where u.id=p_user and u.verified_at is not null and m.workspace_id=w.workspace_id and m.role in('owner','admin') for share of u,m;
 if not found then raise exception 'sandbox_build_access_denied';end if;
 if a.admitted_by<>p_user or public.workspace_exit_resources_stopped(w.workspace_id) then raise exception 'sandbox_build_access_denied';end if;
 select * into s from public.custom_application_states where work_id=a.work_id for update;
 select * into j from public.job_economics where id=a.job_id for update;
 if s.work_id is null or s.lifecycle_status='retired' or s.candidate_version<>a.application_version or s.candidate_revision<>a.candidate_revision or s.candidate_source_digest<>a.source_digest or s.budget_job_id is distinct from a.job_id or s.budget_max_authorized_cents is distinct from a.maximum_cents then raise exception 'sandbox_build_target_changed';end if;
 if j.id is null or j.status not in('accepted','reserved') or j.accepted_by is null or j.accepted_at is null or j.max_authorized_cents<>a.maximum_cents then raise exception 'sandbox_build_budget_required';end if;
 perform 1 from public.users u join public.workspace_memberships m on m.user_id=u.id where u.verified_at is not null and m.workspace_id=coalesce(j.payer_workspace_id,j.workspace_id) and public.work_payer_can_sign(j.payer_kind,j.payer_workspace_id,j.workspace_id,j.payer_id,u.id) for share of u,m;
 if not found then raise exception 'sandbox_build_payer_required';end if;
 perform 1 from public.sandbox_build_attempts where id=p_attempt for update;
 if exists(select 1 from public.sandbox_build_observations where attempt_id=p_attempt and kind='started') then raise exception 'sandbox_build_attempt_unresolved';end if;
 perform public.job_economics_execution_command(jsonb_build_object('action','start','jobId',a.job_id,'executionKey',a.execution_key),p_user,p_email);
 insert into public.sandbox_build_observations(attempt_id,kind,payload) values(p_attempt,'started','{}');
 return to_jsonb(a);
end;$$;

-- Service-only SDK observations. Counts are not billable amounts or release approval.
create function public.record_sandbox_build_observation(p_attempt uuid,p_team text,p_project text,p_name text,p_kind text,p_session text,p_payload jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.sandbox_build_attempts;o public.sandbox_build_observations;v text;n text;
begin
 select * into a from public.sandbox_build_attempts where id=p_attempt;
 if not found then raise exception 'sandbox_build_attempt_missing';end if;
 perform 1 from public.job_economics where id=a.job_id for update;
 perform 1 from public.sandbox_build_attempts where id=p_attempt for update;
 if a.team_id is distinct from p_team or a.project_id is distinct from p_project or a.attempt_name is distinct from p_name then raise exception 'sandbox_build_scope_mismatch';end if;
 if not exists(select 1 from public.sandbox_build_observations where attempt_id=p_attempt and kind='started') then raise exception 'sandbox_build_not_started';end if;
 if p_kind is null or p_kind not in('created','stopped','creation_unknown','cleanup_failed','build_failed') or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'sandbox_build_observation_invalid';end if;
 if p_kind='stopped' then
  if (select count(*) from jsonb_object_keys(p_payload))<>3 then raise exception 'sandbox_build_observation_invalid';end if;
  foreach n in array array['activeCpuDurationMs','ingressBytes','egressBytes'] loop
   v:=p_payload->>n;if v is null or jsonb_typeof(p_payload->n)<>'number' or v!~'^[0-9]{1,16}$' or v::numeric>9007199254740991 then raise exception 'sandbox_build_observation_invalid';end if;
  end loop;
 else if p_payload<>'{}' then raise exception 'sandbox_build_observation_invalid';end if;end if;
 if p_kind in('created','stopped') and (p_session is null or p_session!~'^[A-Za-z0-9_-]{1,128}$') then raise exception 'sandbox_build_observation_invalid';end if;
 if p_kind='creation_unknown' and p_session is not null then raise exception 'sandbox_build_observation_invalid';end if;
 if p_kind='stopped' and not exists(select 1 from public.sandbox_build_observations where attempt_id=p_attempt and kind='created' and session_id=p_session) then raise exception 'sandbox_build_session_mismatch';end if;
 if p_session is not null and exists(select 1 from public.sandbox_build_observations where attempt_id=p_attempt and session_id is not null and session_id<>p_session) then raise exception 'sandbox_build_session_mismatch';end if;
 insert into public.sandbox_build_observations(attempt_id,kind,session_id,payload) values(p_attempt,p_kind,p_session,p_payload) on conflict do nothing;
 select * into o from public.sandbox_build_observations where attempt_id=p_attempt and kind=p_kind;
 if o.session_id is distinct from p_session or o.payload<>p_payload then raise exception 'sandbox_build_observation_conflict';end if;
 return o.id;
end;$$;

-- Supplied trusted billing authority only; there is no invented Vercel billing API.
-- Persist exact evidence first. Revoked execution identity or overage may prevent
-- settlement, but must not discard the independently observed bill.
create function public.record_sandbox_build_billing_evidence(p_attempt uuid,p_team text,p_project text,p_session text,p_currency text,p_usd text,p_reference text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.sandbox_build_attempts;b public.sandbox_build_billing_evidence;
begin
 select * into a from public.sandbox_build_attempts where id=p_attempt;if not found then raise exception 'sandbox_build_attempt_missing';end if;
 perform 1 from public.job_economics where id=a.job_id for update;perform 1 from public.sandbox_build_attempts where id=p_attempt for update;
 if a.team_id is distinct from p_team or a.project_id is distinct from p_project or not exists(select 1 from public.sandbox_build_observations where attempt_id=p_attempt and kind='stopped' and session_id=p_session) then raise exception 'sandbox_build_scope_mismatch';end if;
 insert into public.sandbox_build_billing_evidence(attempt_id,session_id,currency,billable_usd,provider_reference) values(p_attempt,p_session,p_currency,p_usd,p_reference) on conflict do nothing;
 select * into b from public.sandbox_build_billing_evidence where attempt_id=p_attempt;
 if b.session_id is distinct from p_session or b.currency is distinct from p_currency or b.billable_usd is distinct from p_usd or b.provider_reference is distinct from p_reference then raise exception 'sandbox_build_billing_conflict';end if;return b.id;
end;$$;

create function public.reconcile_sandbox_build_billing(p_evidence uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.sandbox_build_attempts;b public.sandbox_build_billing_evidence;
begin
 select * into b from public.sandbox_build_billing_evidence where id=p_evidence;if not found then raise exception 'sandbox_build_billing_missing';end if;
 select * into a from public.sandbox_build_attempts where id=b.attempt_id;
 return public.record_work_provider_receipt_decimal(jsonb_build_object('provider','vercel-sandbox','requestId',a.team_id||':'||a.project_id||':'||b.session_id,'jobId',a.job_id,'executionKey',a.execution_key,'kind','provider','attribution','normal','maximumCents',a.maximum_cents,'billableUsd',b.billable_usd,'evidenceReference',b.provider_reference));
end;$$;

create function public.read_sandbox_build_attempt(p_attempt uuid,p_user uuid,p_email text) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare a public.sandbox_build_attempts;begin
 select * into a from public.sandbox_build_attempts where id=p_attempt;if not found then raise exception 'sandbox_build_attempt_missing';end if;
 perform public.custom_application_assert_identity(a.work_id,p_user,p_email,true);
 return jsonb_build_object('attempt',to_jsonb(a),'observations',coalesce((select jsonb_agg(to_jsonb(o) order by at,id) from public.sandbox_build_observations o where o.attempt_id=a.id),'[]'),'billingEvidence',(select to_jsonb(b) from public.sandbox_build_billing_evidence b where b.attempt_id=a.id),'execution',(select to_jsonb(e) from public.job_economics_executions e where e.job_id=a.job_id and e.execution_key=a.execution_key));end;$$;

create function public.sandbox_build_rollback_assert_unused() returns void language plpgsql set search_path=public,pg_temp as $$begin if exists(select 1 from public.sandbox_build_attempts) then raise exception 'rollback_sandbox_build_evidence_in_use';end if;end;$$;
revoke all on function public.sandbox_build_immutable(),public.sandbox_build_rollback_assert_unused() from public,anon,authenticated,service_role;
do $$declare f record;begin for f in select p.oid::regprocedure name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('prepare_sandbox_build_attempt','begin_sandbox_build_attempt','record_sandbox_build_observation','record_sandbox_build_billing_evidence','reconcile_sandbox_build_billing','read_sandbox_build_attempt') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.name);execute format('grant execute on function %s to service_role',f.name);
end loop;end;$$;
commit;
