\set ON_ERROR_STOP on
-- Exact current catalog only; behavioral/wait/native fixture qualification separate.
begin read only;
do $$declare f regprocedure:=to_regprocedure('public.assert_business_checkout_admission(uuid,text,bigint,uuid,text,text)');begin
 if f is null or not exists(select 1 from pg_proc where oid=f and provolatile='v' and prorettype='boolean'::regtype and pronargs=6 and pronargdefaults=0 and md5(prosrc)='b42915e324220315b2447af6bd46c85e') then raise exception 'exact Checkout admission source/catalog required';end if;
 if not has_function_privilege('service_role',f,'EXECUTE') or has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE') then raise exception 'Checkout admission supplied-actor boundary changed';end if;
end$$;
rollback;
