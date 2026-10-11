\set ON_ERROR_STOP on
begin;
create function pg_temp.finite_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'assertion failed: %', message; end if; end;
$$;
create function pg_temp.finite_denied(command text) returns void language plpgsql as $$
begin
  begin execute command;
  exception when others then
    if sqlerrm like '%access_denied%' then return; end if;
    raise;
  end;
  raise exception 'expected finite job access denial';
end;
$$;

select pg_temp.finite_assert(
  not has_function_privilege('anon','public.read_finite_job_sources(uuid,text,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.read_finite_job_sources(uuid,text,uuid)','EXECUTE')
  and has_function_privilege('service_role','public.read_finite_job_sources(uuid,text,uuid)','EXECUTE'),
  'only service role can reach the identity checked snapshot');
select pg_temp.finite_assert('finite_jobs'=any(public.workspace_release_flag_names())
  and 'approval_store'=any(public.workspace_release_flag_names())
  and 'make_real_owner_link'=any(public.workspace_release_flag_names()), 'new flags preserve older keys');
insert into public.users(id,email,verified_at) values
  ('fa640000-0000-4000-8000-000000000001','finite-owner@example.test',now()),
  ('fa640000-0000-4000-8000-000000000002','finite-other@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
  ('fa640000-0000-4000-8000-000000000010','customer','Finite Fixture','fa640000-0000-4000-8000-000000000001'),
  ('fa640000-0000-4000-8000-000000000011','customer','Other Finite Fixture','fa640000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
  ('fa640000-0000-4000-8000-000000000010','fa640000-0000-4000-8000-000000000001','owner','fa640000-0000-4000-8000-000000000001'),
  ('fa640000-0000-4000-8000-000000000011','fa640000-0000-4000-8000-000000000002','owner','fa640000-0000-4000-8000-000000000002');
insert into public.service_requests(id,business_workspace_id,request_text,outcome,scope,provider_kind,created_by) values
  ('fa640000-0000-4000-8000-000000000020','fa640000-0000-4000-8000-000000000010','Fix hours','Correct hours',array['website'],'strelva','fa640000-0000-4000-8000-000000000001'),
  ('fa640000-0000-4000-8000-000000000021','fa640000-0000-4000-8000-000000000011','Private request','Private outcome',array['website'],'strelva','fa640000-0000-4000-8000-000000000002');
insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,payload,created_by) values
  ('fa640000-0000-4000-8000-000000000030','fa640000-0000-4000-8000-000000000010','operations','responsibility','{"status":"proposed"}', 'fa640000-0000-4000-8000-000000000001');

select pg_temp.finite_assert(
  jsonb_array_length(public.read_finite_job_sources('fa640000-0000-4000-8000-000000000001','finite-owner@example.test','fa640000-0000-4000-8000-000000000010')->'requests')=1
  and jsonb_array_length(public.read_finite_job_sources('fa640000-0000-4000-8000-000000000001','finite-owner@example.test','fa640000-0000-4000-8000-000000000010')->'work')=1,
  'snapshot includes the business request and finite work without another business');
select pg_temp.finite_denied($$select public.read_finite_job_sources('fa640000-0000-4000-8000-000000000001','finite-owner@example.test','fa640000-0000-4000-8000-000000000011')$$);
select pg_temp.finite_denied($$select public.read_finite_job_sources('fa640000-0000-4000-8000-000000000001','finite-other@example.test','fa640000-0000-4000-8000-000000000010')$$);

-- No shadow row can lag a native cancellation/update.
update public.service_requests set request_text='Latest hours' where id='fa640000-0000-4000-8000-000000000020';
select pg_temp.finite_assert(
  public.read_finite_job_sources('fa640000-0000-4000-8000-000000000001','finite-owner@example.test','fa640000-0000-4000-8000-000000000010')->'requests'->0->>'request_text'='Latest hours',
  'native updates read back immediately, with no dual-write copy');
rollback;
