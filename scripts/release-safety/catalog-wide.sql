-- Line-per-object catalog of every application schema (public plus migration
-- rollback/recovery schemas), for diffing a restored hosted schema against a
-- rehearsal. Platform-owned schemas are excluded; extension members too.
-- Output: kind <TAB> name <TAB> detail (newlines escaped, ACL items sorted), byte-sorted.
-- No rows, no credentials.
with app_ns as (
  select oid, nspname from pg_namespace
  where nspname not in ('pg_catalog','information_schema','pg_toast','auth','storage','extensions','vault',
                        'supabase_migrations','realtime','graphql','graphql_public','net','pgsodium',
                        'pgsodium_masks','cron','pgbouncer','supabase_functions','_realtime','_analytics','_supavisor')
    and nspname not like 'pg_temp%' and nspname not like 'pg_toast_temp%'
), ext as (
  select objid, classid from pg_depend where deptype = 'e'
), rows as (
  select 'schema' kind, n.nspname name,
         pg_get_userbyid(s.nspowner) || ' ' || (select coalesce(string_agg(x::text, ',' order by x::text), '') from unnest(s.nspacl) x) detail
    from app_ns n join pg_namespace s on s.oid = n.oid
  union all
  select 'function', p.oid::regprocedure::text,
         md5(pg_get_functiondef(p.oid)) || ' owner=' || pg_get_userbyid(p.proowner) ||
         ' acl=' || (select coalesce(string_agg(x::text, ',' order by x::text), '') from unnest(coalesce(p.proacl, acldefault('f', p.proowner))) x)
    from pg_proc p join app_ns n on n.oid = p.pronamespace
   where p.prokind in ('f','p','w')
     and not exists (select 1 from ext e where e.classid = 'pg_proc'::regclass and e.objid = p.oid)
  union all
  select 'relation', n.nspname || '.' || c.relname,
         c.relkind::text || ' owner=' || pg_get_userbyid(c.relowner) ||
         ' acl=' || (select coalesce(string_agg(x::text, ',' order by x::text), '') from unnest(coalesce(c.relacl, acldefault((case when c.relkind = 'S' then 's' else 'r' end)::"char", c.relowner))) x) ||
         ' rls=' || c.relrowsecurity::text || '/' || c.relforcerowsecurity::text ||
         case when c.relkind in ('v','m') then ' view=' || md5(pg_get_viewdef(c.oid)) else '' end
    from pg_class c join app_ns n on n.oid = c.relnamespace
   where c.relkind in ('r','p','v','m','S','f')
     and not exists (select 1 from ext e where e.classid = 'pg_class'::regclass and e.objid = c.oid)
  union all
  select 'column', n.nspname || '.' || c.relname || '.' || a.attname,
         format_type(a.atttypid, a.atttypmod) || ' notnull=' || a.attnotnull::text ||
         ' default=' || coalesce(pg_get_expr(ad.adbin, ad.adrelid), '') ||
         ' generated=' || a.attgenerated::text || ' identity=' || a.attidentity::text ||
         ' acl=' || (select coalesce(string_agg(x::text, ',' order by x::text), '') from unnest(a.attacl) x)
    from pg_attribute a join pg_class c on c.oid = a.attrelid join app_ns n on n.oid = c.relnamespace
    left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
   where c.relkind in ('r','p','v','m','f') and a.attnum > 0 and not a.attisdropped
     and not exists (select 1 from ext e where e.classid = 'pg_class'::regclass and e.objid = c.oid)
  union all
  select 'constraint', n.nspname || '.' || c.relname || '.' || k.conname,
         pg_get_constraintdef(k.oid) || case when k.convalidated then '' else ' [not validated]' end
    from pg_constraint k join pg_class c on c.oid = k.conrelid join app_ns n on n.oid = c.relnamespace
   where k.contype <> 'n'
  union all
  select 'index', n.nspname || '.' || i.relname, pg_get_indexdef(i.oid)
    from pg_index x join pg_class i on i.oid = x.indexrelid join pg_class t on t.oid = x.indrelid
    join app_ns n on n.oid = t.relnamespace
  union all
  select 'trigger', n.nspname || '.' || c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid) || ' enabled=' || t.tgenabled::text
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join app_ns n on n.oid = c.relnamespace
   where not t.tgisinternal
  union all
  -- App triggers on platform tables (e.g. auth.users -> public.handle_new_user).
  select 'platform_trigger', n.nspname || '.' || c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid) || ' enabled=' || t.tgenabled::text
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    join pg_proc f on f.oid = t.tgfoid join app_ns fn on fn.oid = f.pronamespace
   where not t.tgisinternal and n.nspname in ('auth','storage')
  union all
  select 'policy', p.schemaname || '.' || p.tablename || '.' || p.policyname,
         md5((to_jsonb(p) - 'schemaname' - 'tablename' - 'policyname')::text)
    from pg_policies p join app_ns n on n.nspname = p.schemaname
  union all
  select 'type', n.nspname || '.' || t.typname,
         t.typtype::text || ' owner=' || pg_get_userbyid(t.typowner) ||
         coalesce(' enum=' || (select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid), '')
    from pg_type t join app_ns n on n.oid = t.typnamespace
   where t.typtype in ('e','d','c') and (t.typtype <> 'c' or (select relkind from pg_class where oid = t.typrelid) = 'c')
     and not exists (select 1 from ext e where e.classid = 'pg_type'::regclass and e.objid = t.oid)
  union all
  select 'default_acl', pg_get_userbyid(d.defaclrole) || ' ' || coalesce(n.nspname, '*') || ' ' || d.defaclobjtype::text,
         (select coalesce(string_agg(x::text, ',' order by x::text), '') from unnest(d.defaclacl) x)
    from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
  union all
  select 'extension', e.extname, e.extversion || ' ' || n.nspname
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
)
select line from (select kind || E'\t' || replace(name, E'\n', '\n') || E'\t' || replace(coalesce(detail, ''), E'\n', '\n') line from rows) x order by line collate "C";
