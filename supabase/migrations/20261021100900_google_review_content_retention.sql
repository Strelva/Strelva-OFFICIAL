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
create function public.project_google_review_row(p jsonb) returns jsonb
language sql volatile security definer set search_path=public,pg_temp as $$
 select case when p->>'source'='google' and not public.google_review_content_live(p->'provider_content')
 then p||jsonb_build_object('author','','rating',null,'text','','review_date',null) else p end
$$;
create function public.project_google_review_event(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare m jsonb:=coalesce(p->'metadata','{}'::jsonb);raw boolean;draft boolean;
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
 if new.source='google' then
  -- Updates (reply, dispatch, readback) cannot renew the original cache lease.
  if tg_op='UPDATE' then new.provider_content:=old.provider_content;end if;
  if not public.google_review_content_live(new.provider_content) then new.author:='';new.rating:=null;new.text:='';new.review_date:=null;end if;
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
  if tg_op='UPDATE' then new.payload:=(coalesce(new.payload,'{}')-'providerContent')||case when old.payload ? 'providerContent' then jsonb_build_object('providerContent',old.payload->'providerContent') else '{}'::jsonb end;end if;
  p:=public.project_google_review_event(jsonb_build_object('source',new.source,'type',new.entity_type,'title',new.title,'body',new.body,'metadata',new.payload));
  new.title:=p->>'title';new.body:=p->>'body';new.payload:=p->'metadata';
 else
  if not coalesce(new.type='review' and (new.source='google' or new.metadata->>'kind'='review_reply_draft'),false) then return new;end if;
  if tg_op='UPDATE' then new.metadata:=(coalesce(new.metadata,'{}')-'providerContent')||case when old.metadata ? 'providerContent' then jsonb_build_object('providerContent',old.metadata->'providerContent') else '{}'::jsonb end;end if;
  p:=public.project_google_review_event(to_jsonb(new));
  new.title:=p->>'title';new.body:=p->>'body';new.metadata:=p->'metadata';
 end if;
 return new;
end $$;
create trigger google_review_event_cache_guard before insert or update on public.unified_events for each row execute function public.enforce_google_review_event_cache();
create trigger google_review_proposal_cache_guard before insert or update on public.proposals for each row execute function public.enforce_google_review_event_cache();
create function public.purge_google_review_content() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare n bigint; e bigint; p bigint;
begin
 update public.reviews set author='',rating=null,text='',review_date=null where source='google' and not public.google_review_content_live(provider_content)
  and (author<>'' or rating is not null or text<>'' or review_date is not null);get diagnostics n=row_count;
 update public.unified_events set metadata=metadata where to_jsonb(unified_events) is distinct from public.project_google_review_event(to_jsonb(unified_events));get diagnostics e=row_count;
 update public.proposals set payload=payload where jsonb_build_object('source',source,'type',entity_type,'title',title,'body',body,'metadata',payload) is distinct from public.project_google_review_event(jsonb_build_object('source',source,'type',entity_type,'title',title,'body',body,'metadata',payload));get diagnostics p=row_count;
 return jsonb_build_object('reviews',n,'events',e+p);
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
revoke all on function public.google_review_content_live(jsonb),public.project_google_review_row(jsonb),public.project_google_review_event(jsonb),public.enforce_google_review_cache(),public.enforce_google_review_event_cache(),public.purge_google_review_content() from public,anon,authenticated,service_role;
grant execute on function public.purge_google_review_content() to service_role;
commit;
