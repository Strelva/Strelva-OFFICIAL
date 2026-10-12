-- Additive API-content cache correction; customer replies and history survive.
begin;
set local lock_timeout='3s';
alter table public.reviews add column provider_content jsonb;
create function public.google_review_content_live(p jsonb) returns boolean
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare fetched timestamptz; expires timestamptz;
begin
 if p is null or p->>'source' is distinct from 'google_business_profile_api' then return false;end if;
 fetched:=(p->>'fetchedAt')::timestamptz;expires:=(p->>'expiresAt')::timestamptz;
 return coalesce(fetched<=clock_timestamp() and expires>clock_timestamp() and expires>fetched and expires<=fetched+interval '29 days',false);
exception when others then return false;
end $$;
-- Historical authenticated manual POST never accepted a provider external ID.
-- Require its complete accepted shape and no matching API event copy; do not
-- relabel identified/ambiguous API rows or give any legacy API payload a new lease.
update public.reviews r set provider_content=jsonb_build_object('source','customer_import','producer','legacy_reviews_post_no_external_id')
 where r.source='google' and r.external_id is null and r.provider_content is null
 and r.author<>'' and r.text<>'' and r.rating between 1 and 5 and r.review_date is not null
 and not exists(select 1 from public.unified_events e where e.tenant_id=r.tenant_id and e.source='google' and e.type='review'
  and e.body=r.text and e.metadata->>'author'=r.author and nullif(e.metadata->>'reviewId','') is not null);
create function public.customer_imported_review_content(p jsonb,p_external_id text) returns boolean
language sql immutable security definer set search_path=public,pg_temp as $$
 select coalesce(p_external_id is null and p->>'source'='customer_import' and p->>'producer' in ('authenticated_reviews_post','legacy_reviews_post_no_external_id'),false)
$$;
create function public.project_google_review_row(p jsonb) returns jsonb
language sql volatile security definer set search_path=public,pg_temp as $$
 select case when p->>'source'='google' and not public.customer_imported_review_content(p->'provider_content',p->>'external_id') and not public.google_review_content_live(p->'provider_content')
 then p||jsonb_build_object('author','','rating',null,'text','','review_date',null) else p end
$$;
create function public.project_google_review_event(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare m jsonb:=case when jsonb_typeof(p->'metadata')='object' then p->'metadata' else '{}'::jsonb end;raw boolean;draft boolean;
begin
 raw:=p->>'source'='google' and p->>'type'='review';
 draft:=p->>'type'='review' and m->>'kind'='review_reply_draft' and (m ? 'providerContent' or m ? 'reviewId');
 if not coalesce(raw or draft,false) or public.google_review_content_live(m->'providerContent') then return p;end if;
 m:=(m-array['author','rating','createdAt','reviewCreatedAt','review','comment','text','reviewer'])||jsonb_build_object('providerContentExpired',true);
 return p||jsonb_build_object('metadata',m,'title',case when raw then 'Google review (cached content expired)' else 'Review reply draft' end)
  ||case when raw then jsonb_build_object('body','') else '{}'::jsonb end;
end $$;
create function public.enforce_google_review_cache() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.provider_content is not null and current_setting('role',true) in ('anon','authenticated') then raise exception 'review_provenance_trusted_producer_required';end if;
 if tg_op='UPDATE' and old.source='google' and not public.customer_imported_review_content(old.provider_content,old.external_id) then new.source:=old.source;new.external_id:=old.external_id;end if;
 if new.source='google' then
  -- Updates (reply, dispatch, readback) cannot renew the original cache lease.
  if tg_op='UPDATE' then new.provider_content:=old.provider_content;end if;
  if not public.customer_imported_review_content(new.provider_content,new.external_id) and not public.google_review_content_live(new.provider_content) then new.author:='';new.rating:=null;new.text:='';new.review_date:=null;end if;
 end if;
 return new;
end $$;
create trigger google_review_cache_guard before insert or update on public.reviews for each row execute function public.enforce_google_review_cache();
create function public.enforce_google_review_event_cache() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare p jsonb;
begin
 if tg_table_name='proposals' then
  if not coalesce(new.entity_type='review' and (new.source='google' or new.payload->>'kind'='review_reply_draft'),false) then return new;end if;
  if tg_op='UPDATE' then new.payload:=(case when jsonb_typeof(new.payload)='object' then new.payload else '{}'::jsonb end-'providerContent')||case when old.payload ? 'providerContent' then jsonb_build_object('providerContent',old.payload->'providerContent') else '{}'::jsonb end;end if;
  p:=public.project_google_review_event(jsonb_build_object('source',new.source,'type',new.entity_type,'title',new.title,'body',new.body,'metadata',new.payload));
  new.title:=p->>'title';new.body:=p->>'body';new.payload:=p->'metadata';
 else
  if not coalesce(new.type='review' and (new.source='google' or new.metadata->>'kind'='review_reply_draft'),false) then return new;end if;
  if tg_op='UPDATE' then new.metadata:=(case when jsonb_typeof(new.metadata)='object' then new.metadata else '{}'::jsonb end-'providerContent')||case when old.metadata ? 'providerContent' then jsonb_build_object('providerContent',old.metadata->'providerContent') else '{}'::jsonb end;end if;
  p:=public.project_google_review_event(to_jsonb(new));
  new.title:=p->>'title';new.body:=p->>'body';new.metadata:=p->'metadata';
 end if;
 return new;
end $$;
create trigger google_review_event_cache_guard before insert or update on public.unified_events for each row execute function public.enforce_google_review_event_cache();
create trigger google_review_proposal_cache_guard before insert or update on public.proposals for each row execute function public.enforce_google_review_event_cache();
-- Sealed archives retain original provider clocks; no checksum/body rewrite.
alter table public.workspace_export_builds add column provider_content_expires_at timestamptz;
create function public.google_review_archive_deadline(p jsonb) returns timestamptz
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare item jsonb; m jsonb; lease jsonb; deadline timestamptz; nested timestamptz; cached_row boolean;cached_event boolean;
begin
 if jsonb_typeof(p)='array' then
  for item in select value from jsonb_array_elements(p) loop
   nested:=public.google_review_archive_deadline(item);if nested is not null then deadline:=least(deadline,nested);end if;
  end loop;return deadline;
 elsif jsonb_typeof(p) is distinct from 'object' then return null;end if;
 m:=case when jsonb_typeof(p->'metadata')='object' then p->'metadata' else '{}'::jsonb end;
 cached_row:=p->>'source'='google' and (coalesce(p->>'text','')<>'' or coalesce(p->>'author','')<>'' or case when jsonb_typeof(p->'rating')='number' then (p->>'rating')::numeric>0 else false end or coalesce(p->>'review_date','')<>'');
 cached_event:=p->>'type'='review' and (p->>'source'='google' or m->>'kind'='review_reply_draft') and (coalesce(m->>'author','')<>'' or case when jsonb_typeof(m->'rating')='number' then (m->>'rating')::numeric>0 else false end or m ? 'review' or (p->>'source'='google' and coalesce(p->>'body','')<>''));
 if coalesce(cached_row,false) and not public.customer_imported_review_content(coalesce(p->'provider_content',p->'providerContent'),coalesce(p->>'external_id',p->>'externalId')) or coalesce(cached_event,false) then
  lease:=case when cached_event then m->'providerContent' else coalesce(p->'provider_content',p->'providerContent') end;
  deadline:=case when public.google_review_content_live(lease) then (lease->>'expiresAt')::timestamptz else 'epoch'::timestamptz end;
 end if;
 for item in select value from jsonb_each(p) loop
  nested:=public.google_review_archive_deadline(item);if nested is not null then deadline:=least(deadline,nested);end if;
 end loop;
 return deadline;
end $$;
create function public.google_review_build_deadline(p_build_id uuid) returns timestamptz
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare body text;
begin
 select string_agg(p.body,'' order by p.part) into body from public.workspace_export_build_parts p where p.build_id=p_build_id;
 if body is null then return null;end if;
 return public.google_review_archive_deadline(body::jsonb);
exception when others then return 'epoch'::timestamptz;
end $$;
update public.workspace_export_builds b set provider_content_expires_at=public.google_review_build_deadline(b.id);
update public.workspace_export_builds set expires_at=least(expires_at,provider_content_expires_at) where provider_content_expires_at is not null;
alter function public.complete_workspace_export_build(uuid,jsonb,text,jsonb) rename to complete_workspace_export_build_before_review_retention;
create function public.complete_workspace_export_build(p_build_id uuid,p_manifest jsonb,p_token_hash text,p_category_counts jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare deadline timestamptz; result jsonb;
begin
 perform 1 from public.workspace_export_builds where id=p_build_id for update;
 deadline:=public.google_review_build_deadline(p_build_id);
 if deadline<=clock_timestamp() then raise exception 'workspace_export_provider_content_expired';end if;
 result:=public.complete_workspace_export_build_before_review_retention(p_build_id,p_manifest,p_token_hash,p_category_counts);
 update public.workspace_export_builds set provider_content_expires_at=deadline,expires_at=least(expires_at,deadline) where id=p_build_id;
 return result||jsonb_build_object('expiresAt',(select expires_at from public.workspace_export_builds where id=p_build_id));
end $$;
alter function public.read_workspace_export_build_part(uuid,text,integer) rename to read_workspace_export_build_part_before_review_retention;
create function public.read_workspace_export_build_part(p_build_id uuid,p_token_hash text,p_part integer) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 result:=public.read_workspace_export_build_part_before_review_retention(p_build_id,p_token_hash,p_part);
 if exists(select 1 from public.workspace_export_builds where id=p_build_id and provider_content_expires_at<=clock_timestamp()) then raise exception 'workspace_export_link_invalid';end if;
 return result;
end $$;
alter function public.read_workspace_export_owner_part(uuid,uuid,text,integer) rename to read_workspace_export_owner_part_before_review_retention;
create function public.read_workspace_export_owner_part(p_build_id uuid,p_user_id uuid,p_verified_email text,p_part integer) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 result:=public.read_workspace_export_owner_part_before_review_retention(p_build_id,p_user_id,p_verified_email,p_part);
 if exists(select 1 from public.workspace_export_builds where id=p_build_id and provider_content_expires_at<=clock_timestamp()) then raise exception 'workspace_export_link_invalid';end if;
 return result;
end $$;
revoke all on function public.google_review_archive_deadline(jsonb),public.google_review_build_deadline(uuid),public.complete_workspace_export_build_before_review_retention(uuid,jsonb,text,jsonb),public.read_workspace_export_build_part_before_review_retention(uuid,text,integer),public.read_workspace_export_owner_part_before_review_retention(uuid,uuid,text,integer),public.complete_workspace_export_build(uuid,jsonb,text,jsonb),public.read_workspace_export_build_part(uuid,text,integer),public.read_workspace_export_owner_part(uuid,uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.complete_workspace_export_build(uuid,jsonb,text,jsonb),public.read_workspace_export_build_part(uuid,text,integer),public.read_workspace_export_owner_part(uuid,uuid,text,integer) to service_role;

create function public.purge_google_review_content() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare n bigint; e bigint; p bigint; a bigint;
begin
 update public.reviews set author='',rating=null,text='',review_date=null where source='google' and not public.customer_imported_review_content(provider_content,external_id) and not public.google_review_content_live(provider_content)
  and (author<>'' or rating is not null or text<>'' or review_date is not null);get diagnostics n=row_count;
 update public.unified_events set metadata=metadata where to_jsonb(unified_events) is distinct from public.project_google_review_event(to_jsonb(unified_events));get diagnostics e=row_count;
 update public.proposals set payload=payload where jsonb_build_object('source',source,'type',entity_type,'title',title,'body',body,'metadata',payload) is distinct from public.project_google_review_event(jsonb_build_object('source',source,'type',entity_type,'title',title,'body',body,'metadata',payload));get diagnostics p=row_count;
 update public.workspace_export_builds set status='failed',failure='provider_review_content_expired_rebuild_required',download_token_hash=null where (provider_content_expires_at<=clock_timestamp() or (status='building' and created_at<clock_timestamp()-interval '1 hour')) and (status<>'failed' or download_token_hash is not null);
 delete from public.workspace_export_build_parts where build_id in(select id from public.workspace_export_builds where provider_content_expires_at<=clock_timestamp() or (status='failed' and failure='provider_review_content_expired_rebuild_required'));get diagnostics a=row_count;
 return jsonb_build_object('reviews',n,'events',e+p,'archiveParts',a);
end $$;
-- Unknown legacy Google provenance cannot establish a fresh lease.
select public.purge_google_review_content();
-- Preserve native owner/export access while redacting optional legacy review rows.
create or replace function public.workspace_export_v3_tenant_rows(p_table text,p_workspace_id uuid,p_order text,p_offset integer,p_limit integer) returns jsonb
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare v_rows jsonb; projection text;
begin
 if to_regclass('public.'||p_table) is null then return null;end if;
 projection:=case when p_table='reviews' then 'public.project_google_review_row(to_jsonb(x))' else 'to_jsonb(x)' end;
 execute format($q$select coalesce(jsonb_agg(r order by ord),'[]'::jsonb) from (
 select (%s-'tenant_stable_id')||jsonb_build_object('tenantId',t.id) as r,row_number() over(order by %s) as ord
 from public.%I x join public.tenants t on t.id=x.tenant_id join public.tenant_workspace_links l on l.tenant_stable_id=t.stable_id
 where l.workspace_id=$1 order by %s offset $2 limit $3) page$q$,projection,p_order,p_table,p_order) into v_rows using p_workspace_id,p_offset,p_limit;
 return v_rows;
end $$;
revoke all on function public.google_review_content_live(jsonb),public.customer_imported_review_content(jsonb,text),public.project_google_review_row(jsonb),public.project_google_review_event(jsonb),public.enforce_google_review_cache(),public.enforce_google_review_event_cache(),public.purge_google_review_content() from public,anon,authenticated,service_role;
grant execute on function public.purge_google_review_content() to service_role;
commit;
