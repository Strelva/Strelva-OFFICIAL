-- Site editor publish: content sections, their versions, the page layout and
-- the drafts they came from commit together or not at all.
set lock_timeout = '3s';

-- Upserts (upsertContentData, write_operator_content) set only `data`, so
-- content.updated_at never moved after the first insert and the revalidation
-- reconcile (getSectionTimestamps in src/lib/revalidate-client.ts) could not
-- see client sites that went stale. Touch it whenever the payload changes.
create or replace function public.touch_content_updated_at() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists content_touch_updated_at on public.content;
create trigger content_touch_updated_at before update on public.content
  for each row when (old.data is distinct from new.data)
  execute function public.touch_content_updated_at();

drop trigger if exists page_config_touch_updated_at on public.page_config;
create trigger page_config_touch_updated_at before update on public.page_config
  for each row when (old.sections is distinct from new.sections or old.seo is distinct from new.seo)
  execute function public.touch_content_updated_at();

-- p_sections: [{section, contentKey, data, versionId, changes}]. content.section
-- uses the contentKey (SECTION_TO_TYPE, e.g. settings -> siteSettings);
-- content_versions.section and draft_content.section use the section name.
-- This RPC always deletes draft_content for the published sections (and every
-- draft_page_config row when a page layout is published). Other write paths
-- must stay off it so they never clear drafts they did not publish.
create function public.publish_site_drafts(
  p_tenant_id text, p_sections jsonb, p_page_config jsonb, p_author text, p_with_receipts boolean default false
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare item jsonb; receipt jsonb; receipts jsonb := '{}'::jsonb; page_names text[];
begin
  if p_tenant_id is null or jsonb_typeof(p_sections) is distinct from 'array'
    or (p_page_config is not null and jsonb_typeof(p_page_config) is distinct from 'object')
    or p_author is null or p_author not in ('user', 'admin', 'ai') then
    raise exception 'site_publish_invalid';
  end if;
  perform 1 from public.tenants t where t.id = p_tenant_id for key share;
  if not found then raise exception 'site_publish_invalid'; end if;
  -- One publish at a time per tenant.
  perform pg_advisory_xact_lock(hashtextextended('site-publish:' || p_tenant_id, 0));

  for item in select value from jsonb_array_elements(p_sections) loop
    if jsonb_typeof(item->'data') is distinct from 'object'
      or coalesce(btrim(item->>'section'), '') = ''
      or coalesce(btrim(item->>'contentKey'), '') = ''
      or coalesce(btrim(item->>'versionId'), '') = '' then
      raise exception 'site_publish_invalid';
    end if;
    if p_with_receipts then
      receipt := public.write_operator_content(p_tenant_id, item->>'contentKey', item->'data');
      receipts := receipts || jsonb_build_object(item->>'section', receipt->'id');
    else
      insert into public.content(tenant_id, section, data)
        values (p_tenant_id, item->>'contentKey', item->'data')
        on conflict (tenant_id, section) do update set data = excluded.data;
    end if;
    insert into public.content_versions(id, tenant_id, section, data, author, status, changes)
      values (item->>'versionId', p_tenant_id, item->>'section', item->'data', p_author, 'live',
              nullif(item->'changes', 'null'::jsonb));
    delete from public.draft_content where tenant_id = p_tenant_id and section = item->>'section';
  end loop;

  if p_page_config is not null then
    select coalesce(array_agg(k), '{}') into page_names from jsonb_object_keys(p_page_config) k;
    insert into public.page_config(tenant_id, page_name, sections, seo)
      select p_tenant_id, e.key, coalesce(e.value->'sections', '[]'::jsonb), nullif(e.value->'seo', 'null'::jsonb)
      from jsonb_each(p_page_config) e
      on conflict (tenant_id, page_name) do update set sections = excluded.sections, seo = excluded.seo;
    delete from public.page_config where tenant_id = p_tenant_id and not (page_name = any(page_names));
    delete from public.draft_page_config where tenant_id = p_tenant_id;
  end if;

  return jsonb_build_object('receipts', receipts);
end;
$$;
revoke all on function public.publish_site_drafts(text,jsonb,jsonb,text,boolean) from public, anon, authenticated;
grant execute on function public.publish_site_drafts(text,jsonb,jsonb,text,boolean) to service_role;
