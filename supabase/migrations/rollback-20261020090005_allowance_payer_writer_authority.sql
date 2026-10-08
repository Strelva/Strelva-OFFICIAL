begin;
set local lock_timeout='3s';
do $$declare definition text;begin
 select pg_get_functiondef('public.work_allowance_accept_cap(uuid,text,uuid)'::regprocedure) into definition;
 if position('public.work_payer_can_sign_writer(' in definition)=0 then raise exception 'allowance_payer_writer_drift';end if;
 execute replace(definition,'public.work_payer_can_sign_writer(','public.work_payer_can_sign(');
end $$;
do $$declare definition text;begin
 select pg_get_functiondef('public.read_work_allowances(uuid,text,uuid,uuid)'::regprocedure) into definition;
 if position('public.work_allowance_assert_read_identity(' in definition)=0 then raise exception 'allowance_reader_identity_drift';end if;
 execute replace(definition,'public.work_allowance_assert_read_identity(','public.work_allowance_assert_identity(');
end $$;
drop function public.work_allowance_assert_read_identity(uuid,text);
drop function public.work_payer_can_sign_writer(text,uuid,uuid,uuid,uuid);
notify pgrst,'reload schema';
commit;
