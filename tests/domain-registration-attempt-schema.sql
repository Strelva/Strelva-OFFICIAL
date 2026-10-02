\set ON_ERROR_STOP on
-- A prepared additive column must retain old claims verbatim and must never
-- reinterpret a null historical outcome as permission to send another POST.
do $$
declare legacy public.domain_claims; attempt text;
begin
 select * into strict legacy from public.domain_claims where domain='domain-registration-legacy.example.test';
 if legacy.registration_attempt is not null or legacy.status<>'verified' or legacy.dns_status<>'configured' or legacy.ssl_status<>'issued' or legacy.created_at<>'2026-09-01T00:00:00Z'::timestamptz or legacy.updated_at<>'2026-09-01T00:00:00Z'::timestamptz then raise exception 'legacy_domain_claim_changed'; end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='domain_claims' and column_name='registration_attempt' and is_nullable='YES' and column_default is null) then raise exception 'domain_attempt_must_be_optional'; end if;
 if has_table_privilege('anon','public.domain_claims','insert') or has_table_privilege('authenticated','public.domain_claims','update') then raise exception 'domain_claim_permissions_widened'; end if;
 foreach attempt in array array['not_submitted','unknown','rejected','confirmed'] loop
   update public.domain_claims set registration_attempt=attempt where tenant_id=legacy.tenant_id and domain=legacy.domain;
   if not exists(select 1 from public.domain_claims where tenant_id=legacy.tenant_id and domain=legacy.domain and registration_attempt=attempt) then raise exception 'domain_attempt_state_not_saved'; end if;
 end loop;
 begin
   update public.domain_claims set registration_attempt='retry_anyway' where tenant_id=legacy.tenant_id and domain=legacy.domain;
   raise exception 'domain_attempt_invalid_value_accepted';
 exception when check_violation then null;
 end;
 update public.domain_claims set registration_attempt=null where tenant_id=legacy.tenant_id and domain=legacy.domain;
end $$;
