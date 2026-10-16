-- Shape of the five fictional tenants (timestamps reduced to presence).
select id || ' ' || coalesce((custom_repo - 'declarationCheckedAt')::text, 'NULL')
       || case when custom_repo ? 'declarationCheckedAt' then ' +checkedAt' else '' end
  from public.tenants
 where id in ('gldf','rohlax','rhm-innovations','fixture-declared','fixture-other')
 order by id;
