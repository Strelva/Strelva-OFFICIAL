-- This policy is deliberately empty until Jacob selects a response window.
create table public.provider_change_policy(version text primary key,response_window_seconds integer not null check(response_window_seconds between 0 and 2592000),approved_by uuid not null references public.users(id),approved_at timestamptz not null);
create table public.provider_change_requests(
 id uuid primary key default gen_random_uuid(),business_workspace_id uuid not null references public.workspaces(id),old_provider_id uuid references public.workspace_providers(id),
 new_agency_workspace_id uuid references public.workspaces(id),requested_by uuid not null references public.users(id),requested_at timestamptz not null default now(),
 policy_version text references public.provider_change_policy(version),respond_by timestamptz,status text not null check(status in('awaiting_policy','awaiting_notice','notified','completed','cancelled')),
 idempotency_key text not null,unique(business_workspace_id,idempotency_key)
);
create unique index provider_change_one_pending on public.provider_change_requests(business_workspace_id) where status in('awaiting_policy','awaiting_notice','notified');
create table public.agency_handoff_receipts(
 id uuid primary key default gen_random_uuid(),agency_workspace_id uuid not null references public.workspaces(id),business_workspace_id uuid not null references public.workspaces(id),
 kind text not null check(kind in('change_requested','provider_ended','export_requested')),reference_id uuid not null,created_at timestamptz not null default now(),unique(kind,reference_id,agency_workspace_id)
);
create table public.agency_package_handoffs(
 id uuid primary key default gen_random_uuid(),agency_workspace_id uuid not null references public.workspaces(id),provider_id uuid not null unique references public.workspace_providers(id),definitions jsonb not null,created_at timestamptz not null default now()
);
DO $$ declare t text; begin foreach t in array array['provider_change_policy','provider_change_requests','agency_handoff_receipts','agency_package_handoffs'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);end loop;end $$;
create trigger money_immutable before update or delete on public.provider_change_policy for each row execute function public.money_immutable_guard();
create trigger money_immutable before update or delete on public.agency_handoff_receipts for each row execute function public.money_immutable_guard();
create trigger money_immutable before update or delete on public.agency_package_handoffs for each row execute function public.money_immutable_guard();
create function public.request_provider_change(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_new_agency_id uuid,p_key text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$ declare p public.workspace_providers%rowtype;q public.provider_change_requests%rowtype;policy public.provider_change_policy%rowtype;begin
 perform public.provider_seat_assert_owner(p_workspace_id,p_user_id,p_verified_email);
 if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked';end if;
 if p_new_agency_id is not null and not exists(select 1 from public.workspaces where id=p_new_agency_id and kind='agency') then raise exception 'provider_change_invalid';end if;
 if length(p_key) not between 8 and 200 then raise exception 'provider_change_invalid';end if;
 select * into q from public.provider_change_requests where business_workspace_id=p_workspace_id and idempotency_key=p_key;
 if found then if q.new_agency_workspace_id is distinct from p_new_agency_id then raise exception 'provider_change_conflict';end if;return to_jsonb(q);end if;
 select * into p from public.workspace_providers where customer_workspace_id=p_workspace_id and status='active' for update;
 if p.id is null or p.provider_workspace_id=p_new_agency_id then raise exception 'provider_change_invalid';end if;
 select * into policy from public.provider_change_policy order by approved_at desc limit 1;
 insert into public.provider_change_requests(business_workspace_id,old_provider_id,new_agency_workspace_id,requested_by,policy_version,respond_by,status,idempotency_key)
 values(p_workspace_id,p.id,p_new_agency_id,p_user_id,policy.version,null,case when policy.version is null then 'awaiting_policy' else 'awaiting_notice' end,p_key) returning * into q;
 insert into public.agency_handoff_receipts(agency_workspace_id,business_workspace_id,kind,reference_id) values(p.provider_workspace_id,p_workspace_id,'change_requested',q.id);
 return to_jsonb(q);
end;$$;
-- The normal owner-selection RPC is protected once the approved policy exists.
alter function public.choose_business_provider(uuid,text,uuid,uuid) rename to choose_business_provider_before_change;
revoke all on function public.choose_business_provider_before_change(uuid,text,uuid,uuid) from public,anon,authenticated,service_role;
create function public.choose_business_provider(p_user_id uuid,p_verified_email text,p_workspace_id uuid,p_agency_workspace_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$ begin
 perform public.provider_seat_assert_owner(p_workspace_id,p_user_id,p_verified_email);
 if (exists(select 1 from public.provider_change_policy) or exists(select 1 from public.provider_change_requests where business_workspace_id=p_workspace_id and status in('awaiting_policy','awaiting_notice','notified'))) and exists(select 1 from public.workspace_providers where customer_workspace_id=p_workspace_id and status='active' and provider_workspace_id<>p_agency_workspace_id) then raise exception 'provider_change_required';end if;
 return public.choose_business_provider_before_change(p_user_id,p_verified_email,p_workspace_id,p_agency_workspace_id);
end;$$;
create function public.complete_provider_change(p_request_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$ declare q public.provider_change_requests%rowtype;p public.workspace_providers%rowtype;begin
 select * into q from public.provider_change_requests where id=p_request_id;
 if q.id is null then raise exception 'provider_change_denied';end if;
 perform public.provider_seat_assert_owner(q.business_workspace_id,p_user_id,p_verified_email);
 select * into q from public.provider_change_requests where id=p_request_id for update;
 if q.status='completed' then return to_jsonb(q);end if;
 if q.status<>'notified' or q.respond_by is null or q.respond_by>now() then raise exception 'provider_response_window_open';end if;
 select * into p from public.workspace_providers where id=q.old_provider_id and status='active' for update;
 if p.id is null then raise exception 'provider_change_stale';end if;
 if q.new_agency_workspace_id is null then perform public.end_business_provider(p_user_id,p_verified_email,q.business_workspace_id,'Owner completed provider change.');
 else perform public.choose_business_provider_before_change(p_user_id,p_verified_email,q.business_workspace_id,q.new_agency_workspace_id);end if;
 update public.provider_change_requests set status='completed' where id=q.id returning * into q;return to_jsonb(q);
end;$$;
-- Existing end/exit paths also leave agency-owned definitions and a receipt.
create function public.provider_end_handoff() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$ begin
 insert into public.agency_handoff_receipts(agency_workspace_id,business_workspace_id,kind,reference_id) values(new.provider_workspace_id,new.customer_workspace_id,'provider_ended',new.id) on conflict do nothing;
 insert into public.agency_package_handoffs(agency_workspace_id,provider_id,definitions)
 select new.provider_workspace_id,new.id,coalesce(jsonb_agg(jsonb_build_object('revisionId',r.id,'number',r.number,'definition',r.definition) order by r.source_system_id,r.number),'[]')
 from public.system_version_source_revisions r join public.system_version_sources s on s.system_id=r.source_system_id where s.business_workspace_id=new.provider_workspace_id and coalesce(to_jsonb(s)->>'creator_workspace_id',s.business_workspace_id::text)=new.provider_workspace_id::text on conflict do nothing;
 return new;
end;$$;
create trigger provider_end_handoff after update on public.workspace_providers for each row when(old.status='active' and new.status='ended') execute function public.provider_end_handoff();
-- Seat holders may initiate a delivery to the owner, never an agency download.
create or replace function public.workspace_export_v3_role(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns text
language plpgsql security definer set search_path=public,pg_temp as $$ declare r text;begin
 perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null;
 if not found then raise exception 'workspace_export_denied';end if;
 select role into r from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and role in('owner','admin');
 if r='owner' then return 'owner';end if;
 if r='admin' or public.provider_seat_role(p_workspace_id,p_user_id,true) is not null then return 'operator';end if;
 raise exception 'workspace_export_denied';
end;$$;
create function public.agency_export_request_receipt() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$ begin
 insert into public.agency_handoff_receipts(agency_workspace_id,business_workspace_id,kind,reference_id)
 select s.agency_workspace_id,new.workspace_id,'export_requested',new.id from public.provider_seats s join public.agency_client_staff st on st.agency_workspace_id=s.agency_workspace_id and st.customer_workspace_id=s.customer_workspace_id and st.user_id=new.requested_by and st.status='active'
 join public.workspace_memberships m on m.workspace_id=s.agency_workspace_id and m.user_id=st.user_id where s.customer_workspace_id=new.workspace_id and s.status='active' on conflict do nothing;return new;
end;$$;
create trigger agency_export_request_receipt after insert on public.workspace_export_builds for each row execute function public.agency_export_request_receipt();
alter function public.workspace_export_v3_categories() rename to workspace_export_v3_categories_before_money;
create function public.workspace_export_v3_categories() returns text[] language sql immutable set search_path=public,pg_temp as $$ select public.workspace_export_v3_categories_before_money()||array['business_payments','payment_events','revenue_splits','split_payouts','connected_merchant'];$$;
alter function public.export_workspace_v3_category(uuid,uuid,text,text,integer,integer) rename to export_workspace_v3_category_before_money;
revoke all on function public.export_workspace_v3_category_before_money(uuid,uuid,text,text,integer,integer) from public,anon,authenticated,service_role;
create function public.export_workspace_v3_category(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_category text,p_offset integer default 0,p_limit integer default 1000) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$ declare items jsonb;lim integer=least(greatest(coalesce(p_limit,1000),1),1000);off integer=greatest(coalesce(p_offset,0),0);begin
 perform public.workspace_export_v3_role(p_workspace_id,p_user_id,p_verified_email);
 if p_category='business_payments' then select coalesce(jsonb_agg(to_jsonb(x)),'[]') into items from(select * from public.business_payments where workspace_id=p_workspace_id order by created_at,id offset off limit lim)x;
 elsif p_category='payment_events' then select coalesce(jsonb_agg(to_jsonb(x)),'[]') into items from(select e.* from public.business_payment_events e join public.business_payments p on p.id=e.payment_id where p.workspace_id=p_workspace_id order by e.created_at,e.id offset off limit lim)x;
 elsif p_category='revenue_splits' then select coalesce(jsonb_agg(to_jsonb(x)),'[]') into items from(select * from public.revenue_splits where business_workspace_id=p_workspace_id order by created_at,id offset off limit lim)x;
 elsif p_category='split_payouts' then select coalesce(jsonb_agg(to_jsonb(x)),'[]') into items from(select o.* from public.split_payouts o join public.revenue_splits s on s.id=o.split_id where s.business_workspace_id=p_workspace_id order by o.created_at,o.id offset off limit lim)x;
 elsif p_category='connected_merchant' then select coalesce(jsonb_agg(to_jsonb(x)),'[]') into items from(select workspace_id,stripe_account_id,dashboard,state,configurations,updated_at from public.connected_accounts where workspace_id=p_workspace_id offset off limit lim)x;
 else return public.export_workspace_v3_category_before_money(p_workspace_id,p_user_id,p_verified_email,p_category,p_offset,p_limit);end if;
 return jsonb_build_object('category',p_category,'items',items,'next',case when jsonb_array_length(items)=lim then off+lim end);
end;$$;
create function public.read_agency_handoffs(p_agency_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$ begin
 perform public.connect_assert_manager(p_agency_id,p_user_id,p_verified_email);
 return jsonb_build_object('receipts',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at,r.id) from public.agency_handoff_receipts r where r.agency_workspace_id=p_agency_id),'[]'),'packages',coalesce((select jsonb_agg(to_jsonb(p)-'provider_id' order by p.created_at,p.id) from public.agency_package_handoffs p where p.agency_workspace_id=p_agency_id),'[]'));
end;$$;
DO $$ declare f record;begin for f in select p.oid::regprocedure as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('request_provider_change','choose_business_provider','complete_provider_change','read_agency_handoffs','export_workspace_v3_category') loop execute format('revoke all on function %s from public,anon,authenticated',f.name);execute format('grant execute on function %s to service_role',f.name);end loop;end $$;
