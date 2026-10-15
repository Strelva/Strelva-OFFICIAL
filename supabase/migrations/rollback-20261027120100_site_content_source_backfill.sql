-- Rollback for 20261027120100_site_content_source_backfill.sql
-- Prepared SQL only. Roll back the code that reads customRepo.contentSource first:
-- once this runs, the three tenants read as `request` (Ask for a change).
begin;
set local lock_timeout='3s';

update public.tenants
   set custom_repo = custom_repo - 'contentSource' - 'declarationCheckedAt'
 where id in ('gldf','rohlax','rhm-innovations')
   and custom_repo->>'contentSource'='strelva';

commit;
