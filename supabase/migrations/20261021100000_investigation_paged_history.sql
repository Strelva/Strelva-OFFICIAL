begin;
set local lock_timeout='3s';

-- Preserve full standing-check evidence while current payloads stay bounded.
create table public.investigation_history_events (
 ordinal bigint generated always as identity unique,
 work_id uuid not null references public.saved_product_work(id) on delete cascade,
 revision integer not null,
 event jsonb not null,
 run jsonb,
 primary key(work_id,revision)
);
create unique index investigation_history_request_idx on public.investigation_history_events(work_id, (run->>'requestId')) where run is not null;
alter table public.investigation_history_events enable row level security;
revoke all on public.investigation_history_events from public,anon,authenticated,service_role;
create function public.guard_investigation_history_immutable() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' and not exists(select 1 from public.saved_product_work where id=old.work_id) then return old; end if;
 raise exception 'investigation_history_immutable';
end $$;
create trigger investigation_history_immutable before update or delete on public.investigation_history_events
for each row execute function public.guard_investigation_history_immutable();

create function public.archive_investigation_snapshot(p_work_id uuid,p_payload jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare e jsonb; r jsonb; run_index integer:=0;
begin
 for e in select value from jsonb_array_elements(p_payload->'history') loop
  r:=null;
  if e->>'kind' in ('investigate','investigate_unavailable') then
   r:=p_payload->'runs'->run_index;
   run_index:=run_index+1;
  end if;
  insert into public.investigation_history_events(work_id,revision,event,run)
  values(p_work_id,(e->>'revision')::integer,e,r) on conflict(work_id,revision) do nothing;
 end loop;
end $$;
revoke all on function public.archive_investigation_snapshot(uuid,jsonb) from public,anon,authenticated,service_role;
-- Backfill before any rolling window exists; no issued output is rewritten.
do $$ declare w record; begin
 for w in select id,payload from public.saved_product_work where product_id='investigations' loop
  perform public.archive_investigation_snapshot(w.id,w.payload);
 end loop;
end $$;

create function public.persist_investigation_history(p_work_id uuid,p_existing jsonb,p_payload jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare latest jsonb; expected jsonb; prior_runs jsonb; latest_run jsonb;
begin
 latest:=p_payload->'history'->-1;
 select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into expected
 from jsonb_array_elements((p_existing->'history')||jsonb_build_array(latest)) with ordinality a(value,ord)
 where ord>greatest(0,jsonb_array_length(p_existing->'history')+1-500);
 if p_payload->'history' is distinct from expected then raise exception 'bounded_payload_invalid'; end if;
 prior_runs:=coalesce(p_existing->'runs','[]'::jsonb);
 if latest->>'kind' in ('investigate','investigate_unavailable') then
  latest_run:=p_payload->'runs'->-1;
  if coalesce(latest_run->>'requestId','')='' or jsonb_typeof(latest_run) is distinct from 'object'
   or (latest->>'kind'='investigate_unavailable') is distinct from (latest_run->>'result'='unavailable')
   then raise exception 'bounded_payload_invalid'; end if;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into expected
  from jsonb_array_elements(prior_runs||jsonb_build_array(latest_run)) with ordinality a(value,ord)
  where ord>greatest(0,jsonb_array_length(prior_runs)+1-200);
  if p_payload->'runs' is distinct from expected then raise exception 'bounded_payload_invalid'; end if;
 else
  if p_payload->'runs' is distinct from prior_runs then raise exception 'bounded_payload_invalid'; end if;
 end if;
 -- All rows already existed before rolling started; only append one immutable event.
 insert into public.investigation_history_events(work_id,revision,event,run)
 values(p_work_id,(latest->>'revision')::integer,latest,latest_run);
end $$;
revoke all on function public.persist_investigation_history(uuid,jsonb,jsonb) from public,anon,authenticated,service_role;

-- Extend the current definition, retaining later provider-seat, bundle,
-- website, identity, exit and lock/CAS checks rather than copying an old body.
do $$ declare body text; old_clause text; new_clause text; begin
 select pg_get_functiondef('public.update_bounded_product_work(uuid,uuid,uuid,text,text,integer,jsonb)'::regprocedure) into body;
 old_clause:=$old$  if jsonb_array_length(p_payload->'history')<>jsonb_array_length(existing.payload->'history')+1
    or jsonb_array_length(p_payload->'history')>500
    or ((p_payload->'history')-(jsonb_array_length(p_payload->'history')-1)) is distinct from existing.payload->'history' then raise exception 'bounded_payload_invalid'; end if;$old$;
 new_clause:=$new$  if p_product_id='investigations' then
    perform public.persist_investigation_history(p_work_id,existing.payload,p_payload);
  else
$new$||old_clause||E'\n  end if;';
 if position(old_clause in body)=0 then raise exception 'investigation_history_function_drift'; end if;
 execute replace(body,old_clause,new_clause);
end $$;

create function public.read_investigation_runs(p_work_id uuid,p_user_id uuid,p_verified_email text,p_request_id text default null,p_before_revision integer default null,p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare workspace uuid; result jsonb;
begin
 if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null) then raise exception 'workspace_access_denied'; end if;
 select workspace_id into workspace from public.saved_product_work where id=p_work_id and product_id='investigations';
 perform 1 from public.workspace_memberships where workspace_id=workspace and user_id=p_user_id for share;
 if not found then raise exception 'workspace_access_denied'; end if;
 if p_limit is null or p_limit<1 or p_limit>101 then raise exception 'investigation_page_invalid'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('revision',revision,'run',run) order by revision desc),'[]'::jsonb) into result
 from (select revision,run from public.investigation_history_events where work_id=p_work_id and run is not null
   and (p_request_id is null or run->>'requestId'=p_request_id)
   and (p_before_revision is null or revision<p_before_revision) order by revision desc limit p_limit) page;
 return result;
end $$;
revoke all on function public.read_investigation_runs(uuid,uuid,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.read_investigation_runs(uuid,uuid,text,text,integer,integer) to service_role;

commit;
