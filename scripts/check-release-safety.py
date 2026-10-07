#!/usr/bin/env python3
"""Forward → rollback → forward for packet batches 0–7 on an isolated local cluster.

Compares functions, ACLs, RLS, columns, checks/FKs, indexes, triggers and policies,
runs legacy content/auth/billing probes after each transition, exercises refusal
and archive cases, and rehearses a full consistent dump/restore. No provider calls.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid
sys.path.insert(0, str(Path(__file__).resolve().parent / 'release-safety'))
from postgres import BIN, catalog, command, db_url, identifier, sql
ROOT = Path(__file__).resolve().parent.parent


def assert_catalog(actual, expected, label):
    if actual != expected:
        changed = {kind: [k for k in set(actual[kind]) | set(expected[kind]) if actual[kind].get(k) != expected[kind].get(k)] for kind in expected}
        changed = {k: v for k, v in changed.items() if v}
        raise ValueError(f'{label}: catalog differs: {changed}')


def apply(url, item):
    file = ROOT / 'supabase/migrations' / item['file']
    if hashlib.sha256(file.read_bytes()).hexdigest() != item['sha256']:
        raise ValueError('Forward migration digest drift: ' + item['file'])
    sql(url, file=file)


def reverse(url, item):
    sql(url, file=ROOT / 'supabase/migrations' / ('rollback-' + item['file']))


def legacy(url):
    sql(url, file=ROOT / 'scripts/release-safety/legacy-behavior.sql')


def archive_clear(url):
    # This helper is used only in the disposable rehearsal database, never production.
    sql(url, 'drop schema if exists release_rollback_archive cascade;')


def seed(url):
    sql(url, """
insert into public.users(id,email,verified_at) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner@release.example',now()),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','unverified@release.example',null);
insert into public.tenants(id,site_name,active,subscription_status,commercial_plan)
 values('release-fixture','Release Fixture',true,'active','website');
insert into public.memberships(user_id,tenant_id,role)
 values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','release-fixture','owner');
insert into public.content(tenant_id,section,data) values('release-fixture','hero','{"headline":"Before 1.0"}');
""")


def main():
    cluster = Path(tempfile.mkdtemp(prefix='strelva-release-safety-', dir='/tmp'))
    socket = cluster / 'socket'
    socket.mkdir()
    port = 61778
    local_env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
    def ctl(name, args):
        subprocess.run([str(BIN / name), *args], env=local_env, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ctl('initdb', ['-D', str(cluster / 'data'), '--locale=C', '--encoding=UTF8', '--auth=trust', '--no-instructions'])
    ctl('pg_ctl', ['-D', str(cluster / 'data'), '-l', str(cluster / 'postgres.log'), '-o', f"-F -k '{socket}' -c listen_addresses='' -p {port}", '-w', 'start'])
    admin = f'postgresql:///postgres?host={socket}&application_name=release-safety'
    # Unix socket URLs need the port too: put it in PGDATABASE query (guard supports port).
    admin += f'&port={port}'
    manifest = json.loads((ROOT / 'scripts/release-safety/batches.json').read_text())
    receipt = {'scope': 'local Postgres only; hosted/current deployed app not exercised', 'batches': []}
    try:
        sql(admin, file=ROOT / 'scripts/sql/local-supabase-shim.sql')
        for item in manifest['baseline']:
            apply(admin, item)
        seed(admin)
        baseline = catalog(admin, ROOT)
        legacy(admin)
        # Every individual file is also reversed in exact reverse order during each batch.
        for number, items in enumerate(manifest['batches']):
            before = catalog(admin, ROOT)
            for item in items:
                apply(admin, item)
            forward = catalog(admin, ROOT)
            legacy(admin)
            # Public client roles must not gain execution on any introduced RPC.
            introduced = set(forward['functions']) - set(before['functions'])
            for signature in introduced:
                allowed = sql(admin, "select has_function_privilege('anon','public." + signature.replace("'", "''") + "','execute') or has_function_privilege('authenticated','public." + signature.replace("'", "''") + "','execute');")
                if allowed != 'f':
                    raise ValueError('Introduced RPC exposed to browser role: ' + signature)
            for item in reversed(items):
                reverse(admin, item)
            assert_catalog(catalog(admin, ROOT), before, f'Batch {number} rollback')
            legacy(admin)
            archive_clear(admin)
            for item in items:
                apply(admin, item)
            assert_catalog(catalog(admin, ROOT), forward, f'Batch {number} second forward')
            legacy(admin)
            receipt['batches'].append({'batch': number, 'files': len(items), 'forwardRollbackForward': True, 'catalogRestored': True, 'legacyBehavior': True})
            print(f'Batch {number}: {len(items)} forward, rollback, forward; catalog/ACL and legacy reads/writes/auth/billing passed.', flush=True)
        # Wrong-order reversal must fail atomically, preserving the full candidate.
        full = catalog(admin, ROOT)
        try:
            reverse(admin, manifest['batches'][3][2])  # flags function was extended by batches 5–7
            raise ValueError('Wrong-order rollback was incorrectly accepted.')
        except RuntimeError:
            assert_catalog(catalog(admin, ROOT), full, 'Wrong-order refusal')
        print('Wrong-order rollback refused atomically.', flush=True)
        # Post-forward records that old checks cannot represent must survive privately.
        sql(admin, """insert into public.tenant_leads(tenant_stable_id,lead_id,payload,recorded_via,intake_state,held_reason)
select stable_id,'held-rollback-proof','{}','spam_hold','held','fixture' from public.tenants where id='release-fixture';""")
        # Drop batch 7, then the inquiry file; archive the held row before old checks return.
        for item in reversed(manifest['batches'][7]):
            reverse(admin, item)
        reverse(admin, manifest['batches'][6][-1])
        if sql(admin, "select count(*) from release_rollback_archive.m20261009113000_tenant_leads where lead_id='held-rollback-proof';") != '1':
            raise ValueError('Held lead was not preserved in the private archive.')
        if sql(admin, "select has_schema_privilege('anon','release_rollback_archive','usage') or has_schema_privilege('authenticated','release_rollback_archive','usage') or has_schema_privilege('service_role','release_rollback_archive','usage');") != 'f':
            raise ValueError('Recovery archive was exposed.')
        legacy(admin)
        print('Post-forward held lead preserved; archive inaccessible to app/browser roles.', flush=True)
        # Prove rollback of the whole tail restores the complete Sept 30 catalog.
        for number in reversed(range(7)):
            items = manifest['batches'][number]
            if number == 6:
                items = items[:-1]
            for item in reversed(items):
                reverse(admin, item)
        assert_catalog(catalog(admin, ROOT), baseline, 'Whole release rollback')
        legacy(admin)
        print('Whole release rollback restored Sept 30 public catalog and legacy behavior.', flush=True)
        # Dump/restore from this local DB includes Auth, sequences and preserved rollback data.
        spec = importlib.util.spec_from_file_location('restore_rehearsal', ROOT / 'scripts/rehearse-database-restore.py')
        restore = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(restore)
        dump_receipt = restore.rehearse(admin, admin, cluster / 'backup')
        receipt['restore'] = dump_receipt
        print(f"Dump/restore: {len(dump_receipt['tables'])} table counts match; {dump_receipt['dumpBytes']} bytes; dump {dump_receipt['dumpSeconds']}s, restore {dump_receipt['restoreSeconds']}s.", flush=True)
        # Rehearse July's dormant layer independently; baseline contains later pre-1.0 work.
        org_before = catalog(admin, ROOT)
        sql(admin, file=ROOT / 'supabase/migrations/rollback-org-layer-phase0.sql')
        legacy(admin)
        sql(admin, file=ROOT / 'supabase/migrations/20260729180000_org_layer_phase0_accounts.sql')
        assert_catalog(catalog(admin, ROOT), org_before, 'July forward after rollback')
        legacy(admin)
        receipt['julyOrgLayer'] = True
        print('July org layer: forward, rollback, forward; legacy behavior and catalog passed.', flush=True)
        receipt['passed'] = True
    finally:
        ctl('pg_ctl', ['-D', str(cluster / 'data'), '-m', 'fast', '-w', 'stop'])
        (cluster / 'release-safety-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
        print(f'Private local rehearsal artifact: {cluster}', flush=True)

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, (ValueError, RuntimeError)) else 'Local release-safety proof failed.', file=sys.stderr)
        sys.exit(1)
