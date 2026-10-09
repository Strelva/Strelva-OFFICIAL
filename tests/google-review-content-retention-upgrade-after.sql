\set ON_ERROR_STOP on
-- Apply new1009 between the before/after fixtures in a disposable clone.
do $$ begin
 if not exists(select 1 from public.reviews where tenant_id='google-review-upgrade-fictional' and external_id is null and text='Accepted customer Google-labelled import' and provider_content->>'source'='customer_import' and reply='Customer reply') then raise exception 'supported customer import lost';end if;
 if exists(select 1 from public.reviews where tenant_id='google-review-upgrade-fictional' and (external_id is not null or author='Ambiguous author') and text<>'') then raise exception 'legacy API cache retained';end if;
 if not exists(select 1 from public.reviews where tenant_id='google-review-upgrade-fictional' and reply='Customer API reply' and text='') then raise exception 'customer API reply lost';end if;
 if exists(select 1 from public.unified_events where tenant_id='google-review-upgrade-fictional' and body<>'') then raise exception 'null/scalar API event not purged';end if;
 if exists(select 1 from public.proposals where tenant_id='google-review-upgrade-fictional' and body<>'') then raise exception 'null/scalar API proposal not purged';end if;
end $$;
