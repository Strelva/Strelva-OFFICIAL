#!/usr/bin/env bash
# Bounded function proof against disposable schema fixtures, never a remote DB.
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo/scripts/temp-postgres.sh"
create_temp_postgres strelva-trust-email-sql strelva-trust-email-socket
proof_port="$((61000 + ($$ % 3000)))"
proof_dir="$cluster_root"
initdb -D "$proof_dir/data" -A trust --no-locale >/dev/null
pg_ctl -D "$proof_dir/data" -l "$proof_dir/server.log" -o "-F -k '$cluster_socket' -p $proof_port -c listen_addresses=''" -w start >/dev/null
psql=(psql -X -v ON_ERROR_STOP=1 -h "$cluster_socket" -p "$proof_port" -d postgres)
"${psql[@]}" >/dev/null <<'SQL'
create role anon; create role authenticated; create role service_role;
create table workspaces(id uuid primary key, kind text, name text);
create table tenants(id text primary key, stable_id uuid, site_name text);
create table tenant_workspace_links(tenant_stable_id uuid,workspace_id uuid);
create table provider_seats(customer_workspace_id uuid,agency_workspace_id uuid,status text);
create table workspace_providers(customer_workspace_id uuid,provider_workspace_id uuid,status text);
create table users(id uuid primary key,email text,verified_at timestamptz);
create table workspace_memberships(workspace_id uuid,user_id uuid,role text);
create table booking_settings(calendar_key uuid,timezone text);
create table fixture_facts(workspace_id uuid,fact_key text,value jsonb);
create table fixture_recipients(workspace_id uuid,value jsonb);
create function business_confirmed_facts(uuid) returns table(fact_key text,value jsonb) language sql as $$ select f.fact_key,f.value from fixture_facts f where f.workspace_id=$1 $$;
create function resolve_business_owner_recipient(uuid) returns jsonb language sql as $$ select value from fixture_recipients where workspace_id=$1 $$;
insert into workspaces values('cc000000-0000-4000-8000-000000000003','customer','Lakeview Yoga'),('cc000000-0000-4000-8000-000000000004','customer','Another business'),('cc000000-0000-4000-8000-000000000005','agency','North Studio');
insert into tenants values('fixture','cc000000-0000-4000-8000-000000000006','Old name');
insert into tenant_workspace_links values('cc000000-0000-4000-8000-000000000006','cc000000-0000-4000-8000-000000000003');
insert into users values('cc000000-0000-4000-8000-000000000007','owner@lakeview.example',now());
insert into workspace_memberships values('cc000000-0000-4000-8000-000000000003','cc000000-0000-4000-8000-000000000007','owner');
insert into fixture_recipients values('cc000000-0000-4000-8000-000000000003','{"email":"owner@lakeview.example","trusted":true,"verified":false}');
insert into fixture_facts values('cc000000-0000-4000-8000-000000000003','display_name','"Confirmed Lakeview"'),('cc000000-0000-4000-8000-000000000003','hours','{"timezone":"America/New_York"}');
SQL
"${psql[@]}" -f "$repo/supabase/migrations/20261024121000_ux_trust_email_context.sql" >/dev/null
"${psql[@]}" <<'SQL'
do $$ declare c jsonb; begin
 c:=read_email_business_context('cc000000-0000-4000-8000-000000000003','fixture');
 if c->>'ownerAuthorship'<>'platform' or c->>'businessName'<>'Confirmed Lakeview' or c->>'replyTo'<>'owner@lakeview.example' or c->>'timeZone'<>'America/New_York' or c->'tenantIds'<>'["fixture"]'::jsonb then raise exception 'direct verified context wrong %',c; end if;
 if read_email_business_context('cc000000-0000-4000-8000-000000000004','fixture') is not null or read_email_business_context(null,'missing') is not null or read_email_business_context('cc000000-0000-4000-8000-000000000005',null) is not null then raise exception 'scope not bound'; end if;
 if read_email_business_context(null,'workspace:cc000000-0000-4000-8000-000000000003')->>'workspaceId'<>'cc000000-0000-4000-8000-000000000003' then raise exception 'workspace alias wrong'; end if;
 if has_function_privilege('anon','read_email_business_context(uuid,text)','execute') or has_function_privilege('authenticated','read_email_business_context(uuid,text)','execute') or not has_function_privilege('service_role','read_email_business_context(uuid,text)','execute') then raise exception 'public privilege leak'; end if;
end $$;
insert into provider_seats values('cc000000-0000-4000-8000-000000000003','cc000000-0000-4000-8000-000000000005','active');
do $$ begin if read_email_business_context(null,'fixture')->>'ownerAuthorship'<>'agency' then raise exception 'managed seat misattributed'; end if; end $$;
update provider_seats set status='ended';
insert into workspace_providers values('cc000000-0000-4000-8000-000000000003','cc000000-0000-4000-8000-000000000005','active');
do $$ begin if read_email_business_context(null,'fixture')->>'ownerAuthorship'<>'agency' then raise exception 'provider misattributed'; end if; end $$;
update users set verified_at=null;
do $$ begin if read_email_business_context(null,'fixture')->>'replyTo' is not null then raise exception 'unverified imported contact accepted'; end if; end $$;
update users set verified_at=now();
update users set email='hello@lakeview.example';
insert into fixture_facts values('cc000000-0000-4000-8000-000000000003','email','"hello@lakeview.example"');
do $$ begin if read_email_business_context(null,'fixture')->>'replyTo'<>'hello@lakeview.example' then raise exception 'confirmed verified business reply wrong'; end if; end $$;
delete from workspace_memberships;
do $$ begin if read_email_business_context(null,'fixture')->>'replyTo' is not null then raise exception 'revoked member contact accepted'; end if; end $$;
begin read only;
select read_email_business_context(null,'fixture')->>'ownerAuthorship' as managed_author;
rollback;
SQL
"${psql[@]}" -f "$repo/supabase/migrations/rollback-20261024121000_ux_trust_email_context.sql" >/dev/null
"${psql[@]}" -c "select case when to_regprocedure('public.read_email_business_context(uuid,text)') is null then 'rollback removed only context' else 'ERROR' end;"
"${psql[@]}" -f "$repo/supabase/migrations/20261024121000_ux_trust_email_context.sql" >/dev/null
"${psql[@]}" -c "select read_email_business_context(null,'fixture')->>'ownerAuthorship' as reapplied_author;"
echo 'PASS: disposable bounded SQL context, exclusions scope, verified contact, ACL, READ ONLY, rollback and reapply.'
