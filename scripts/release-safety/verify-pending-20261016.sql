-- Read-only verification for the October 16 held packet (28 files,
-- 20261026100000 .. 20261028110000). Run inside a READ ONLY transaction after
-- the push; every row must say ok = true. Fingerprints are md5(prosrc) of the
-- FINAL state after all 28 files, measured on the restored production schema
-- (PostgreSQL 17.11). Catalog and migration history only, except check 13b,
-- which reads key presence (not values) on three tenant rows.
--   psql "$TARGET" -X -At -v ON_ERROR_STOP=1 -c 'begin read only' -f this.sql -c 'rollback'
with fp(step, fn, md5) as (values
  ('01 conn_core_holders',              'public.connection_version_binding_owner(uuid,text,text)', 'ea06ec05dfea1e420777fc99b53ecb34'),
  ('02 conn_google_agency_oauth',       'public.conn_google_agency_oauth(uuid,text,uuid,uuid,text,jsonb)', 'a0f5cecc93abcc8c8332082c8b29242a'),
  ('03 conn_tools_installer',           'public.create_connected_site_for_installer(uuid,uuid,text,jsonb)', 'a71bbb0335af00b8e82dc251e5dc125c'),
  ('04+05 conn_apps/outlook',           'public.system_package_assert_declaration(jsonb,jsonb,text[])', 'de92ae4c74add3ac5f7b8ff360f1f69d'),
  ('05 conn_outlook_calendar',          'public.connection_provider_area(text)', 'a83bc50cadd6aede688094dee15cc00e'),
  ('06 sites_atomic_publish',           'public.publish_site_drafts(text,jsonb,jsonb,text,boolean)', 'c070ad00ce41c4a9f27a4e48f03893ba'),
  ('06 sites_atomic_publish trigger fn','public.touch_content_updated_at()', '1c4318bee4240d4113d86fad7eb15623'),
  ('07 ai_controls',                    'public.set_operator_ai_controls(text,uuid,boolean,integer,text,bigint,text)', 'b16419cdcb541186d44340f227fdfd0b'),
  ('08 money_agency_pay_links',         'public.backfill_legacy_agency_pay_link(jsonb,text,uuid)', '6dfa98cbad04120902f3c6c3f70e43e4'),
  ('09 owner_reach',                    'public.operator_owner_reach_report(uuid,text)', '6dfc7a66a32bddb770ca37bca245f0c8'),
  ('10 dedupe_flows_owner_decisions',   'public.record_policy_owner_decision(uuid,jsonb,text)', 'ea94e4cb847bb4222bb6d82502b0d196'),
  ('11 provider_client_queue_v3',       'public.read_provider_client_queue_v3(uuid,text,uuid,timestamp with time zone,text,integer)', '542e562e3a47c2df4baf50fe7b837351'),
  ('14 site_change_agent_tools',        'public.issue_agent_oauth_connection_code(uuid,text,uuid,uuid,text,text,text,text,text,text,text[])', 'c4feed28fc9d518f6e55ef70f73681e3'),
  ('15 website_code_releases',          'public.reconcile_website_system_releases(uuid,uuid,text,uuid,text,text,boolean)', '86d9b05027dd15e959e6634990143925'),
  ('16 keep_your_site_flag',            'public.agency_release_flag_system_kind(text)', '09e25788fe67f179f47e103abcd5e812'),
  ('17 keep_your_site_changes',         'public.read_agency_client_sites(uuid,uuid,text,text,uuid,integer)', '25f1e3f96afcec05e5442e222b8b8783'),
  ('18 keep_your_site_agency_home',     'public.read_agency_client_home(uuid,uuid,text)', 'ae9865e8b8edd6064342185ff1a7d4ae'),
  ('19 app_events',                     'public.agent_read_app_events(text,text,uuid,bigint,text[],integer)', '578a534a6a882939e8c2f344f516f774'),
  ('20 app_event_sources',              'public.app_event_from_owner_decisions()', '0ec3ca1aa56713e1184d6aba727f7ff9'),
  ('22 listings_sync_store',            'public.read_listing_sync(uuid,uuid,text)', '4e0ce6f75763f2eebf120b35bb08a0bb'),
  ('23 care_reports',                   'public.list_agency_client_time(uuid,uuid,uuid,text,date)', '8e79b1237b1e8a5af26c6b7d986849c4'),
  ('25 business_record_insurance_fact', 'public.business_record_fact_valid(text,jsonb)', '2a37c6888a06247737ad45052f64c747'),
  ('26 vertical_intake',                'public.purge_app_intake_sensitive(integer)', '2586561581b69e5c7ad1f359e8e8f6f4'),
  ('27 access_review_since',            'public.read_access_review(uuid,uuid,text,boolean)', '8066b95c95c25cfd89c35675e7b92ccd'),
  ('28 agency_actor_person_name',       'public.application_action_actor_snapshot(uuid,uuid)', 'b09212f05eed923ed5eac932464edad7'),
  ('12+16+21+24 release flag names',    'public.workspace_release_flag_names()', 'c7020e41f23af3ba4463d98a990165b9')
), tables(step, rel) as (values
  ('01', 'public.connection_holders'), ('02', 'public.conn_google_agency_oauth_attempts'),
  ('07', 'public.business_ai_controls'), ('08', 'public.agency_pay_links'), ('08', 'public.money_documents'),
  ('15', 'public.website_code_releases'), ('17', 'public.connected_site_changes'),
  ('19', 'public.app_event_settings'), ('22', 'public.listing_sync_checks'), ('23', 'public.care_reports'),
  ('26', 'public.app_intake_installs')
)
select 'history: 428 rows, newest 20261028110000' as check,
       (select count(*) = 428 and max(version) = '20261028110000' from supabase_migrations.schema_migrations) as ok
union all
select 'history: all 28 packet versions present',
       (select count(*) = 28 from supabase_migrations.schema_migrations where version between '20261026100000' and '20261028110000')
union all
select 'fn ' || step, coalesce((select md5(p.prosrc) = fp.md5 from pg_proc p where p.oid = to_regprocedure(fp.fn)), false) from fp
union all
select 'table ' || step || ' ' || rel, to_regclass(rel) is not null from tables
union all
select 'triggers 06 content/page_config touch',
       (select count(*) = 2 from pg_trigger where tgname in ('content_touch_updated_at','page_config_touch_updated_at') and not tgisinternal)
union all
select 'flags 12/16/21/24 registered',
       public.workspace_release_flag_names() @> array['sites_by_code','keep_your_site','listings_sync','vertical_intake']
union all
select 'publish_site_drafts: service_role only',
       has_function_privilege('service_role', 'public.publish_site_drafts(text,jsonb,jsonb,text,boolean)', 'execute')
       and not has_function_privilege('anon', 'public.publish_site_drafts(text,jsonb,jsonb,text,boolean)', 'execute')
       and not has_function_privilege('authenticated', 'public.publish_site_drafts(text,jsonb,jsonb,text,boolean)', 'execute')
union all
select '13b content-source backfill: gldf, rohlax, rhm-innovations declare strelva',
       (select count(*) = 3 from public.tenants where id in ('gldf','rohlax','rhm-innovations') and custom_repo->>'contentSource' = 'strelva')
union all
select 'guard schemas for the rollbacks exist (10)',
       (select count(*) = 10 from pg_namespace where nspname in ('conn_apps_rollback','conn_core_rollback',
        'conn_google_rollback','conn_outlook_rollback','conn_tools_installer_rollback','keep_your_site_flag_rollback',
        'keep_your_site_home_rollback','keep_your_site_rollback','sites_by_code_rollback','website_code_releases_rollback'))
order by 1;
