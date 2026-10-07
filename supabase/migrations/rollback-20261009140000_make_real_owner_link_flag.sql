-- Rollback for 20261009140000_make_real_owner_link_flag.sql
-- Forward SHA-256: 5a2ae2bdf4865128c3c70727de99b4fb8b175deb35dca3e6213c269d0816fdad
-- Batch 7: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.workspace_release_flag_names()')))) is distinct from 'fd4deb4575b04c0b59a55f8f45179e59' then raise exception 'rollback_wrong_order_or_function_drift: workspace_release_flag_names'; end if;
end;
$rollback_guard$;
CREATE OR REPLACE FUNCTION public.workspace_release_flag_names()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select array['owner_entry', 'inquiries', 'website_rebuild', 'systems',
    'make_real_live:hosted_website', 'make_real_live:tenant_content', 'make_real_live:inquiry_form',
    'make_real_live:booking_page', 'make_real_live:internal_app', 'connected_sites']::text[]
$function$
;
revoke all on function public.workspace_release_flag_names() from public, anon, authenticated, service_role;
grant execute on function public.workspace_release_flag_names() to "service_role";
commit;lock table public."workspace_release_flags", public."workspace_release_flag_changes" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261009140000_workspace_release_flags" as table public."workspace_release_flags";
revoke all on release_rollback_archive."m20261009140000_workspace_release_flags" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261009140000_workspace_release_flag_changes" as table public."workspace_release_flag_changes";
revoke all on release_rollback_archive."m20261009140000_workspace_release_flag_changes" from public, anon, authenticated, service_role;
-- Preserve 1.0-only rows before restoring the earlier constraints.
alter table public.workspace_release_flag_changes disable trigger workspace_release_flag_changes_immutable_trg;
delete from public.workspace_release_flag_changes where flag = 'make_real_owner_link';
alter table public.workspace_release_flag_changes enable trigger workspace_release_flag_changes_immutable_trg;
delete from public.workspace_release_flags where flag = 'make_real_owner_link';

