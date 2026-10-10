begin;
set local lock_timeout = '3s';

-- Server-selected lifetime provider-call ceiling, shared by retries and
-- concurrent rebuild workers. It is not a dollar price or billed-cost claim.
create table public.website_model_allowances (
  workspace_id uuid not null,
  website_work_id uuid primary key,
  maximum integer not null check(maximum between 1 and 64),
  consumed integer not null default 0 check(consumed >= 0 and consumed <= maximum),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key(website_work_id,workspace_id) references public.saved_product_work(id,workspace_id) on delete cascade
);
alter table public.website_model_allowances enable row level security;
revoke all on public.website_model_allowances from public,anon,authenticated,service_role;

create function public.reserve_website_model_call(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,p_maximum integer)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare result integer;
begin
  if p_maximum is null or p_maximum not between 1 and 64 then raise exception 'website_model_limit_invalid'; end if;
  perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,false,true);
  if exists(select 1 from public.workspace_release_flags where workspace_id=p_workspace_id and flag='website_rebuild' and state='off') then
    raise exception 'website_model_release_disabled';
  end if;
  insert into public.website_model_allowances(workspace_id,website_work_id,maximum) values(p_workspace_id,p_work_id,p_maximum)
    on conflict(website_work_id) do nothing;
  -- The first admitted call fixes the upper bound. Raising an environment
  -- ceiling later cannot refill this work; lowering it is respected too.
  update public.website_model_allowances set consumed=consumed+1,updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and website_work_id=p_work_id and consumed < least(maximum,p_maximum)
    returning consumed into result;
  if result is null then raise exception 'website_model_allowance_exhausted'; end if;
  return result;
end $$;
revoke all on function public.reserve_website_model_call(uuid,uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.reserve_website_model_call(uuid,uuid,uuid,text,integer) to service_role;
commit;
