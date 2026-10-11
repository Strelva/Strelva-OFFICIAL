-- One line per public-schema object (function body hash and ACL, column,
-- constraint, trigger, table ACL and RLS). Two runs print the same lines
-- exactly when the public catalog is the same. Reads the catalog only.
select x from (
  select 'f ' || p.oid::regprocedure::text || ' ' || md5(pg_get_functiondef(p.oid)) || ' ' || coalesce(p.proacl::text, '') as x
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
  union all
  select 'c ' || c.relname || '.' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || ' ' || a.attnotnull
      || ' ' || coalesce(pg_get_expr(d.adbin, d.adrelid), '')
    from pg_attribute a join pg_class c on c.oid = a.attrelid
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
  union all
  select 'k ' || conrelid::regclass::text || ' ' || conname || ' ' || pg_get_constraintdef(oid)
    from pg_constraint where connamespace = 'public'::regnamespace
  union all
  select 't ' || tgrelid::regclass::text || ' ' || pg_get_triggerdef(oid)
    from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace)
  union all
  select 'r ' || relname || ' ' || coalesce(relacl::text, '') || ' ' || relrowsecurity
    from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'p')
  union all
  select 'i ' || indexrelid::regclass::text || ' ' || pg_get_indexdef(indexrelid)
    from pg_index where indrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace)
) s order by x;
