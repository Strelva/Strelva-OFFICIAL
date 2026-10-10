-- Disable only future new-session admission. Accepted effects/history and original writers survive.
begin;
set local lock_timeout='3s';
do $canonical_checkout$
declare p record;migrator oid:=(current_user::regrole)::oid;
begin
 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='assert_business_checkout_admission')<>1 then raise exception 'checkout_admission_catalog_drift';end if;
 select f.*,l.lanname into p from pg_proc f join pg_language l on l.oid=f.prolang where f.oid=to_regprocedure('public.assert_business_checkout_admission(uuid,text,bigint,uuid,text,text)');
 if p.oid is null or p.proowner<>migrator or p.pronamespace<>'public'::regnamespace or p.lanname<>'plpgsql' or p.prokind<>'f' or p.prorettype<>'boolean'::regtype or p.proretset or p.proisstrict or not p.prosecdef or p.proleakproof or p.provolatile<>'v' or p.proparallel<>'u' or p.proconfig is distinct from array['search_path=public, pg_temp']::text[] or p.provariadic<>0 or p.prosupport<>0 or p.procost<>100 or p.prorows<>0 or p.pronargdefaults<>0 or p.proargdefaults is not null or p.proargmodes is not null or p.proallargtypes is not null or p.proargnames is distinct from array['p_payment_id','p_account','p_generation','p_actor_id','p_verified_email','p_accepted_email']::text[] or p.pronargs<>6 or md5(p.prosrc)<>'b42915e324220315b2447af6bd46c85e' then raise exception 'checkout_admission_catalog_drift';end if;
 if p.proacl is null or (select count(*) from aclexplode(p.proacl))<>2 or exists(select 1 from aclexplode(p.proacl) a where a.grantor<>migrator or a.privilege_type<>'EXECUTE' or a.is_grantable or a.grantee not in(migrator,('service_role'::regrole)::oid)) then raise exception 'checkout_admission_acl_drift';end if;
end $canonical_checkout$;
drop function public.assert_business_checkout_admission(uuid,text,bigint,uuid,text,text);
notify pgrst,'reload schema';
commit;
