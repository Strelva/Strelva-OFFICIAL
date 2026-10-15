-- Sites declare where their content lives (customRepo.contentSource). These three
-- client repos read Strelva's v1 content API; release-manifest.json
-- customRepoWorkspace.repos[].v1Endpoints includes "content" for exactly them.
--
-- DEPLOY ORDER: this backfill must land before the code that reads
-- customRepo.contentSource. Until it does, gldf, rohlax and rhm-innovations read
-- as `request` (Ask for a change). There is no code fallback list, by design.
begin;
set local lock_timeout='3s';

update public.tenants
   set custom_repo = coalesce(custom_repo,'{}'::jsonb)
     || jsonb_build_object('contentSource','strelva','declarationCheckedAt',to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'))
 where id in ('gldf','rohlax','rhm-innovations')
   and coalesce(custom_repo->>'contentSource','') = '';

commit;
