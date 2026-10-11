-- Empty by default. A source-reviewed runtime receipt is separate from artifact
-- review, payer acceptance, provider counters, and release permission.
create table public.custom_sandbox_runtime_qualifications(
 id uuid primary key default gen_random_uuid(),work_id uuid not null references public.saved_product_work(id),
 application_version integer not null,candidate_revision integer not null,source_digest text not null,
 team_id text not null,project_id text not null,image text not null,policy_version text not null,
 checks jsonb not null,reviewed_by uuid not null references public.users(id),reviewed_at timestamptz not null default clock_timestamp(),
 unique(work_id,application_version,candidate_revision,source_digest,team_id,project_id,image,policy_version)
);
alter table public.custom_sandbox_runtime_qualifications enable row level security;
revoke all on public.custom_sandbox_runtime_qualifications from public,anon,authenticated,service_role;
create trigger sandbox_runtime_immutable before update or delete on public.custom_sandbox_runtime_qualifications
for each row execute function public.sandbox_build_immutable();
create function public.qualify_custom_sandbox_runtime(p_work uuid,p_revision integer,p_digest text,p_team text,p_project text,p_image text,p_policy text,p_checks jsonb,p_reviewer uuid,p_email text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.custom_application_states%rowtype;r uuid;
begin
 perform 1 from public.users u join public.super_admins a on a.user_id=u.id
 where u.id=p_reviewer and lower(u.email)=lower(btrim(p_email)) and u.verified_at is not null and a.revoked_at is null for share of u,a;
 if not found then raise exception 'sandbox_runtime_reviewer_denied';end if;
 select * into s from public.custom_application_states where work_id=p_work for share;
 if s.work_id is null or s.lifecycle_status='retired' or s.candidate_revision<>p_revision or s.candidate_source_digest<>p_digest
 or public.workspace_exit_resources_stopped(s.workspace_id) then raise exception 'sandbox_runtime_source_changed';end if;
 perform public.custom_application_validate_files(s.candidate_files,s.candidate_source_digest);
 if p_team is null or p_team !~ '^[A-Za-z0-9_-]{1,64}$' or p_project is null or p_project !~ '^[A-Za-z0-9_-]{1,64}$'
 or p_image is null or char_length(p_image)>256 or p_image !~ '^[a-zA-Z0-9_./:-]+@sha256:[a-f0-9]{64}$'
 or p_policy is null or char_length(p_policy) not between 1 and 100
 or p_checks is distinct from '{"sourceReviewed":true,"denyAllNetwork":true,"noGuestCredentials":true,"noPortsOrPersistence":true,"imageHelpersQualified":true,"resource2048MbAccepted":true,"cleanupQualified":true,"commercialProjectApproved":true}'::jsonb
 then raise exception 'sandbox_runtime_qualification_required';end if;
 insert into public.custom_sandbox_runtime_qualifications(work_id,application_version,candidate_revision,source_digest,team_id,project_id,image,policy_version,checks,reviewed_by)
 values(p_work,s.candidate_version,p_revision,p_digest,p_team,p_project,p_image,p_policy,p_checks,p_reviewer)
 on conflict do nothing returning id into r;
 if r is null then select id into r from public.custom_sandbox_runtime_qualifications where work_id=p_work and application_version=s.candidate_version and candidate_revision=p_revision and source_digest=p_digest and team_id=p_team and project_id=p_project and image=p_image and policy_version=p_policy;end if;
 return r;
end;$$;
create function public.assert_custom_sandbox_runtime(p_work uuid,p_version integer,p_revision integer,p_digest text,p_team text,p_project text,p_image text,p_policy text,p_user uuid,p_email text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare w public.saved_product_work%rowtype;s public.custom_application_states%rowtype;
begin
 w:=public.custom_application_assert_identity(p_work,p_user,p_email,true);
 -- Admission/start lock and recheck this state in the existing provider RPC.
 -- Do not take a shared state lock and then upgrade it in parallel preparers.
 select * into s from public.custom_application_states where work_id=p_work;
 if s.work_id is null or s.lifecycle_status='retired' or s.candidate_version<>p_version or s.candidate_revision<>p_revision or s.candidate_source_digest<>p_digest
 or public.workspace_exit_resources_stopped(w.workspace_id) then raise exception 'sandbox_runtime_source_changed';end if;
 if not exists(select 1 from public.custom_sandbox_runtime_qualifications q join public.users u on u.id=q.reviewed_by join public.super_admins a on a.user_id=q.reviewed_by and a.revoked_at is null
 where q.work_id=p_work and q.application_version=p_version and q.candidate_revision=p_revision and q.source_digest=p_digest
 and q.team_id=p_team and q.project_id=p_project and q.image=p_image and q.policy_version=p_policy and u.verified_at is not null)
 then raise exception 'sandbox_runtime_qualification_required';end if;
 return true;
end;$$;
revoke all on function public.qualify_custom_sandbox_runtime(uuid,integer,text,text,text,text,text,jsonb,uuid,text),public.assert_custom_sandbox_runtime(uuid,integer,integer,text,text,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.qualify_custom_sandbox_runtime(uuid,integer,text,text,text,text,text,jsonb,uuid,text),public.assert_custom_sandbox_runtime(uuid,integer,integer,text,text,text,text,text,uuid,text) to service_role;

create table public.sandbox_build_runtime_bindings(attempt_id uuid primary key references public.sandbox_build_attempts(id),qualification_id uuid not null references public.custom_sandbox_runtime_qualifications(id));
alter table public.sandbox_build_runtime_bindings enable row level security;
revoke all on public.sandbox_build_runtime_bindings from public,anon,authenticated,service_role;
create trigger sandbox_runtime_binding_immutable before update or delete on public.sandbox_build_runtime_bindings for each row execute function public.sandbox_build_immutable();
create function public.prepare_qualified_sandbox_build_attempt(p_work uuid,p_version integer,p_revision integer,p_digest text,p_name text,p_team text,p_project text,p_image text,p_user uuid,p_email text,p_policy text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;q uuid;
begin
 perform public.assert_custom_sandbox_runtime(p_work,p_version,p_revision,p_digest,p_team,p_project,p_image,p_policy,p_user,p_email);
 select id into q from public.custom_sandbox_runtime_qualifications where work_id=p_work and application_version=p_version and candidate_revision=p_revision and source_digest=p_digest and team_id=p_team and project_id=p_project and image=p_image and policy_version=p_policy;
 result:=public.prepare_sandbox_build_attempt(p_work,p_version,p_revision,p_digest,p_name,p_team,p_project,p_image,p_user,p_email);
 insert into public.sandbox_build_runtime_bindings values((result->>'id')::uuid,q) on conflict do nothing;
 if not exists(select 1 from public.sandbox_build_runtime_bindings where attempt_id=(result->>'id')::uuid and qualification_id=q) then raise exception 'sandbox_runtime_binding_conflict';end if;
 return result;
end;$$;
create function public.begin_qualified_sandbox_build_attempt(p_attempt uuid,p_user uuid,p_email text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare q public.custom_sandbox_runtime_qualifications%rowtype;
begin
 select receipt.* into q from public.sandbox_build_runtime_bindings b join public.custom_sandbox_runtime_qualifications receipt on receipt.id=b.qualification_id where b.attempt_id=p_attempt;
 if q.id is null then raise exception 'sandbox_runtime_qualification_required';end if;
 perform 1 from public.users u join public.super_admins a on a.user_id=u.id where u.id=q.reviewed_by and u.verified_at is not null and a.revoked_at is null for share of u,a;
 if not found then raise exception 'sandbox_runtime_reviewer_denied';end if;
 perform public.assert_custom_sandbox_runtime(q.work_id,q.application_version,q.candidate_revision,q.source_digest,q.team_id,q.project_id,q.image,q.policy_version,p_user,p_email);
 perform public.begin_sandbox_build_attempt(p_attempt,p_user,p_email);
end;$$;
revoke all on function public.prepare_qualified_sandbox_build_attempt(uuid,integer,integer,text,text,text,text,text,uuid,text,text),public.begin_qualified_sandbox_build_attempt(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_qualified_sandbox_build_attempt(uuid,integer,integer,text,text,text,text,text,uuid,text,text),public.begin_qualified_sandbox_build_attempt(uuid,uuid,text) to service_role;
