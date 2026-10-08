\set ON_ERROR_STOP on
do $$
begin
  if to_regclass('public.super_admin_bootstrap') is null then
    raise exception 'empty-history rollback did not restore the bootstrap table';
  end if;
  if (select count(*) from public.super_admin_bootstrap) <> 2
    or not exists (select 1 from public.super_admin_bootstrap where email = 'rhinehart514@gmail.com')
    or not exists (select 1 from public.super_admin_bootstrap where email = 'noahowsh@gmail.com') then
    raise exception 'empty-history rollback did not restore the original seed set';
  end if;
  if position('super_admin_bootstrap' in pg_get_functiondef('public.handle_new_user()'::regprocedure)) = 0 then
    raise exception 'empty-history rollback did not restore the prior auth bootstrap behavior';
  end if;
end;
$$;
