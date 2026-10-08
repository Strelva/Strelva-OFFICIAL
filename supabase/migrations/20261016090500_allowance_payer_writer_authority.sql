-- Writer-only payer authority. Snapshot helpers stay pure for inbox/read paths.
begin;
set local lock_timeout='3s';
create function public.work_payer_can_sign_writer(p_kind text,p_party uuid,p_business uuid,p_signer uuid,p_actor uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_kind='agency' then
  perform 1 from public.workspace_memberships m join public.workspaces w on w.id=m.workspace_id and w.kind='agency'
   where m.workspace_id=p_party and m.user_id=p_actor and m.role in('owner','admin') for share of m,w;
 else
  perform 1 from public.workspace_memberships m where m.workspace_id=p_business and m.user_id=p_actor
   and (m.role='owner' or m.user_id=p_signer) for share of m;
 end if;
 return found;
end $$;
revoke all on function public.work_payer_can_sign_writer(text,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function public.work_allowance_assert_read_identity(p_actor_id uuid,p_verified_email text)
returns void language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.users where id=p_actor_id
   and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null) then
  raise exception 'work_allowance_identity_denied';
 end if;
end $$;
revoke all on function public.work_allowance_assert_read_identity(uuid,text) from public,anon,authenticated,service_role;
do $$declare definition text;begin
 select pg_get_functiondef('public.work_allowance_accept_cap(uuid,text,uuid)'::regprocedure) into definition;
 if position('public.work_payer_can_sign(' in definition)=0 then raise exception 'allowance_payer_writer_drift';end if;
 execute replace(definition,'public.work_payer_can_sign(','public.work_payer_can_sign_writer(');
end $$;
do $$declare definition text;begin
 select pg_get_functiondef('public.read_work_allowances(uuid,text,uuid,uuid)'::regprocedure) into definition;
 if position('public.work_allowance_assert_identity(' in definition)=0 then raise exception 'allowance_reader_identity_drift';end if;
 execute replace(definition,'public.work_allowance_assert_identity(','public.work_allowance_assert_read_identity(');
end $$;
notify pgrst,'reload schema';
commit;
