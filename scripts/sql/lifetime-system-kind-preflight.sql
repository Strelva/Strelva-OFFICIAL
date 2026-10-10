\set ON_ERROR_STOP on
-- RELEASE OPERATOR ONLY: prepare/review, then obtain separate authorization
-- before using any live connection. This file opens a READ ONLY transaction.
-- It cannot establish original kinds from sparse history or repair any rows.
begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '3s';

-- Current population, never an assertion that its kinds were correct at birth.
select kind, count(*) as systems, count(*) filter (where origin_kind is null) as without_native_origin,
 count(*) filter (where current_revision_id is null) as without_current_revision
from public.systems group by kind order by kind;

-- Compare current kind only to independently bound native resources. Unknown
-- origin mappings and missing rows require adjudication, not guessed rewrites.
with native as (
 select s.kind, s.origin_kind,
  case
   when s.origin_kind='tenant' then 'website'
   when s.origin_kind='tenant_newsletter' then 'newsletter'
   when s.origin_kind='inquiry_workspace' then 'inquiry'
   when s.origin_kind='google_location' then 'listing'
   when s.origin_kind='connected_site' then 'website'
   when s.origin_kind='saved_work' then case w.product_id || '/' || w.resource_kind
    when 'websites/website' then 'website'
    when 'applications/application' then 'internal_app'
    when 'custom-applications/custom-application' then 'internal_app'
    when 'tracker/tracker' then 'internal_app'
    when 'scheduling/schedule' then 'booking'
    when 'inquiry/inquiry_capability' then 'inquiry' end
  end as native_kind,
  s.origin_kind='saved_work' and w.id is null as missing_saved_work
 from public.systems s left join public.saved_product_work w
  on s.origin_kind='saved_work' and s.origin_ref=w.id::text and s.business_workspace_id=w.workspace_id
)
select origin_kind, count(*) as systems,
 count(*) filter (where native_kind is not null and kind<>native_kind) as current_native_kind_mismatches,
 count(*) filter (where native_kind is null) as unqualified_mapping,
 count(*) filter (where missing_saved_work) as missing_saved_work
from native group by origin_kind order by origin_kind nulls first;

-- Revisions store implementation, not former System.kind. This is a coverage
-- disclosure, not a historical-kind reconstruction.
select count(*) as systems,
 count(*) filter (where not exists(select 1 from public.system_revisions r where r.system_id=s.id)) as no_revision_history,
 count(*) filter (where exists(select 1 from public.system_outputs o where o.system_id=s.id)) as systems_with_issued_terms
from public.systems s;

-- Inventory every current native row writer for release review. Inspect source
-- separately; no definitions, credentials, row content or actor data are printed.
select p.oid::regprocedure::text as current_system_writer, p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosrc ~* '(update[[:space:]]+|insert[[:space:]]+into[[:space:]]+)(public\.)?systems\y'
order by 1;
select tgname, tgenabled, pg_get_triggerdef(oid) as guard_definition
from pg_trigger where tgrelid='public.systems'::regclass and not tgisinternal order by tgname;
select p.oid::regprocedure::text as command, md5(pg_get_functiondef(p.oid)) as definition_hash,
 has_function_privilege('service_role',p.oid,'execute') as service_execute,
 has_function_privilege('anon',p.oid,'execute') as anon_execute,
 has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute
from pg_proc p where p.oid in (
 'public.update_business_system(uuid,uuid,text,uuid,bigint,jsonb)'::regprocedure,
 'public.system_actor_scope(uuid,uuid,text,boolean)'::regprocedure,
 'public.system_load(uuid,uuid,boolean,uuid[])'::regprocedure);
rollback;
