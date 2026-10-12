-- Restore only the exact predecessor; immutable requests and receipts survive.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $payment_terms_catalog$
declare p record; migrator oid:=(current_user::regrole)::oid;
begin
 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='accept_public_payment_request')<>1 then raise exception 'payment_terms_function_drift';end if;
 select f.*,l.lanname into p from pg_proc f join pg_language l on l.oid=f.prolang where f.oid=to_regprocedure('public.accept_public_payment_request(text)');
 if p.oid is null or p.proowner<>migrator or p.lanname<>'plpgsql' or p.prokind<>'f' or p.prorettype<>'jsonb'::regtype or p.proretset or p.proisstrict or not p.prosecdef or p.proleakproof or p.provolatile<>'v' or p.proparallel<>'u' or p.proconfig is distinct from array['search_path=public, pg_temp']::text[] or p.provariadic<>0 or p.prosupport<>0 or p.procost<>100 or p.prorows<>0 or p.pronargdefaults<>0 or p.proargdefaults is not null or p.proargmodes is not null or p.proallargtypes is not null or p.proargnames is distinct from array['p_hash']::text[] or p.pronargs<>1 or md5(p.prosrc)<>'9c3194749a61a928278749be6d3b8912' then raise exception 'payment_terms_function_drift';end if;
 if p.proacl is null or (select count(*) from aclexplode(p.proacl))<>2 or exists(select 1 from aclexplode(p.proacl) a where a.grantor<>migrator or a.privilege_type<>'EXECUTE' or a.is_grantable or a.grantee not in(migrator,('service_role'::regrole)::oid)) then raise exception 'payment_terms_acl_drift';end if;
end $payment_terms_catalog$;
create or replace function public.accept_public_payment_request(p_hash text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare r public.business_payment_requests%rowtype;p jsonb;begin
 select * into r from public.business_payment_requests where token_hash=p_hash for update;
 if r.id is null or r.expires_at<=now() or exists(select 1 from public.payment_request_actions where request_id=r.id and action='cancelled') then raise exception 'payment_request_unavailable';end if;
 if r.kind='deposit' and not exists(select 1 from public.business_bookings where id=r.source_record_id and workspace_id=r.workspace_id and status='held') then raise exception 'payment_request_booking_unavailable';end if;
 p:=public.reserve_business_payment(r.workspace_id,'request:'||r.id::text,r.kind,r.amount_cents,r.currency,r.id::text);
 insert into public.payment_request_actions(request_id,action,payment_id) values(r.id,'accepted',(p->>'id')::uuid) on conflict do nothing;
 return public.read_public_payment_request(p_hash);
end;$$;
revoke all on function public.accept_public_payment_request(text) from public,anon,authenticated;
grant execute on function public.accept_public_payment_request(text) to service_role;
notify pgrst,'reload schema';
commit;
