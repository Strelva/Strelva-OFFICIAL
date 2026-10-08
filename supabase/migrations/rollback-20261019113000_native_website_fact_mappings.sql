begin;
set local lock_timeout='3s';
lock table public.website_native_fact_mappings,public.website_native_fact_reviews in access exclusive mode;
-- Mapping decisions and non-contact/explicit-mapping claims are durable data.
-- Rollback only an unused expansion; never erase accepted or uncertain work.
do $$ begin
  if (select count(*) from release_rollback_baseline.native_fact_mappings)<>1 or not exists(select 1 from release_rollback_baseline.native_fact_mappings where forward_confirmation_hash=md5(pg_get_functiondef('public.business_fact_confirmation_json(public.business_record_fact_confirmations)'::regprocedure))) then raise exception 'native_website_mapping_rollback_function_drift'; end if;
  if exists(select 1 from public.website_native_fact_mappings)
    or exists(select 1 from public.website_native_fact_reviews where section<>'contact' or mapping_revision<>0) then
    raise exception 'native_website_mapping_rollback_requires_data_preservation';
  end if;
end $$;
drop function public.claim_native_website_mapped_fact_review(uuid,uuid,text,text,bigint,uuid,text,bigint);
drop function public.save_native_website_fact_mapping(uuid,uuid,text,text,bigint,jsonb);
drop function public.read_native_website_fact_mapping(uuid,uuid,text,text);
drop table public.website_native_fact_mappings;
drop index public.website_native_fact_reviews_dispatch_idx;
alter table public.website_native_fact_reviews drop constraint website_native_fact_reviews_revision_section_key;
alter table public.website_native_fact_reviews drop column mapping_revision;
alter table public.website_native_fact_reviews drop column section;
do $$ declare baseline release_rollback_baseline.native_fact_mappings; begin
  select * into strict baseline from release_rollback_baseline.native_fact_mappings;
  execute format('alter table public.website_native_fact_reviews add constraint %I %s',baseline.prior_constraint_name,baseline.prior_constraint_definition);
  execute baseline.prior_confirmation;
end $$;
create unique index website_native_fact_reviews_dispatch_idx on public.website_native_fact_reviews(tenant_stable_id) where status in ('claimed','unconfirmed');
drop table release_rollback_baseline.native_fact_mappings;
commit;
