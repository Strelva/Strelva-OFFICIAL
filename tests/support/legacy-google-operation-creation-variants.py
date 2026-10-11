#!/usr/bin/env python3
"""Generate prepared fresh-creation SQL variants; never opens a database.

The root qualification owner must apply all actual pre-1751 forwards in a new
owned disposable cluster, snapshot before/after each expected rejection, run
normal creation last, and retain exact source/settings/teardown evidence.
No historical 1751 is applied first: this complete replacement is the packet.
"""
from pathlib import Path
import hashlib
import json
import re
import sys


def generate(repo: Path, output: Path) -> dict:
    forward = repo / 'supabase/migrations/20261022175100_legacy_google_operation_authority.sql'
    source = forward.read_text()
    assert len(re.findall(r'^begin;$', source, re.M)) == 1
    assert len(re.findall(r'^commit;$', source, re.M)) == 1
    assert source.count('do $legacy_google_creation_guard$') == 1
    target = 'public.apply_legacy_google_operation(uuid,text,jsonb,text,jsonb)'
    default_cases = {
        'default-function-custom': "create role lg_hostile_default nologin;\nalter default privileges in schema public grant execute on functions to lg_hostile_default;",
        'default-function-authenticated': "alter default privileges in schema public grant execute on functions to authenticated;",
        'default-table-custom': "create role lg_hostile_default nologin bypassrls;\nalter default privileges in schema public grant update on tables to lg_hostile_default;",
        'default-table-service': "alter default privileges in schema public grant update on tables to service_role;",
        'default-service-grant-option': "alter default privileges in schema public grant execute on functions to service_role with grant option;",
        'default-function-owner-revoked': "alter default privileges revoke execute on functions from current_user;",
        'default-table-owner-revoked': "alter default privileges revoke all on tables from current_user;",
    }
    late_cases = {
        'function-service-grant-option': f'grant execute on function {target} to service_role with grant option;',
        'function-owner-revoked': f'revoke execute on function {target} from current_user;',
        'function-owner': f'create role lg_hostile_owner nologin;\nalter function {target} owner to lg_hostile_owner;',
        'function-extra-acl': f'grant execute on function {target} to authenticated;',
        'function-cost': f'alter function {target} cost 1;',
        'function-strict': f'alter function {target} strict;',
        'function-volatility': f'alter function {target} stable;',
        'function-search-path': f'alter function {target} set search_path=pg_temp,public;',
        'function-security': f'alter function {target} security invoker;',
        'function-body': "create or replace function public.legacy_google_canonical_json(p_value jsonb) returns text language plpgsql immutable set search_path=public,pg_temp as $$ begin return 'unexpected replacement'; end $$;",
        'table-owner': 'create role lg_hostile_owner nologin;\nalter table public.legacy_google_operation_watermarks owner to lg_hostile_owner;',
        'table-rls': 'alter table public.legacy_google_operation_watermarks disable row level security;',
        'table-force-rls': 'alter table public.legacy_google_operation_watermarks force row level security;',
        'table-policy': 'create policy lg_hostile_policy on public.legacy_google_operation_watermarks to service_role using(true);',
        'table-acl': 'grant update on public.legacy_google_operation_watermarks to service_role;',
        'column-acl': 'grant update(latest_started_at) on public.legacy_google_operation_watermarks to service_role;',
        'column-default': 'alter table public.legacy_google_operation_watermarks alter column latest_started_at set default now();',
        'column-extra': 'alter table public.legacy_google_operation_watermarks add column unexpected text;',
        'constraint-missing': 'alter table public.legacy_google_operation_watermarks drop constraint legacy_google_operation_watermarks_latest_started_at_check;',
        'constraint-extra': 'alter table public.legacy_google_operation_watermarks add constraint unexpected check (latest_started_at>\'2020-01-01\'::timestamptz);',
        'index-extra': 'create index unexpected on public.legacy_google_operation_watermarks(latest_started_at);',
        'table-rule': 'create rule lg_hostile_rule as on insert to public.legacy_google_operation_watermarks do instead nothing;',
        'inheritance-parent': 'create table public.lg_hostile_child() inherits(public.legacy_google_operation_watermarks);',
        'inheritance-child': 'create table public.lg_hostile_parent(tenant_stable_id uuid not null,latest_started_at timestamptz not null);\nalter table public.legacy_google_operation_watermarks inherit public.lg_hostile_parent;',
    }
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    manifest = {'forwardSha256': hashlib.sha256(source.encode()).hexdigest(), 'normal': 'normal.sql', 'refusals': []}
    (output / 'normal.sql').write_text(source)
    for name, injection in default_cases.items():
        variant = re.sub(r'^begin;$', lambda _: 'begin;\n'+injection, source, count=1, flags=re.M)
        (output / (name+'.sql')).write_text(variant)
        manifest['refusals'].append({'file': name+'.sql', 'error': 'legacy_google_creation_authority_invalid'})
    for name, injection in late_cases.items():
        variant = source.replace('do $legacy_google_creation_guard$', injection+'\ndo $legacy_google_creation_guard$', 1)
        (output / (name+'.sql')).write_text(variant)
        manifest['refusals'].append({'file': name+'.sql', 'error': 'legacy_google_creation_authority_invalid'})
    # Metadata only; neither record payloads nor credential contents are printed.
    snapshot = """\\set ON_ERROR_STOP on
select 'function '||p.oid::regprocedure::text||' '||encode(pg_catalog.sha256(convert_to(to_jsonb(p)::text,'UTF8')),'hex')
 from pg_proc p where p.pronamespace='public'::regnamespace order by p.oid::regprocedure::text;
select 'table '||c.relname||' '||encode(pg_catalog.sha256(convert_to(to_jsonb(c)::text,'UTF8')),'hex')
 from pg_class c where c.relnamespace='public'::regnamespace order by c.relname;
select 'column '||a.attrelid||':'||a.attnum||' '||encode(pg_catalog.sha256(convert_to(to_jsonb(a)::text,'UTF8')),'hex')
 from pg_attribute a join pg_class c on c.oid=a.attrelid where c.relnamespace='public'::regnamespace and a.attnum>0 order by a.attrelid,a.attnum;
select 'constraint '||c.oid||' '||encode(pg_catalog.sha256(convert_to(to_jsonb(c)::text,'UTF8')),'hex')
 from pg_constraint c where c.connamespace='public'::regnamespace order by c.oid;
select 'policy '||p.oid||' '||encode(pg_catalog.sha256(convert_to(to_jsonb(p)::text,'UTF8')),'hex')
 from pg_policy p join pg_class c on c.oid=p.polrelid where c.relnamespace='public'::regnamespace order by p.oid;
select 'rule '||r.oid||' '||encode(pg_catalog.sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex')
 from pg_rewrite r join pg_class c on c.oid=r.ev_class where c.relnamespace='public'::regnamespace order by r.oid;
select 'inheritance '||i.inhrelid||':'||i.inhparent||' '||encode(pg_catalog.sha256(convert_to(to_jsonb(i)::text,'UTF8')),'hex')
 from pg_inherits i order by i.inhrelid,i.inhparent,i.inhseqno;
select 'default-acl '||d.oid||' '||encode(pg_catalog.sha256(convert_to(to_jsonb(d)::text,'UTF8')),'hex')
 from pg_default_acl d order by d.oid;
select 'role '||r.rolname||' '||encode(pg_catalog.sha256(convert_to((to_jsonb(r)-'rolpassword')::text,'UTF8')),'hex')
 from pg_roles r order by r.rolname;
"""
    (output / 'snapshot.sql').write_text(snapshot)
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    return manifest


if __name__ == '__main__':
    assert len(sys.argv) == 3, 'arguments: absolute repo path, absent output directory'
    repo, output = map(Path, sys.argv[1:])
    assert repo.is_absolute() and output.is_absolute()
    result = generate(repo, output)
    print(json.dumps({'preparedRefusals': len(result['refusals']), 'forwardSha256': result['forwardSha256']}))
