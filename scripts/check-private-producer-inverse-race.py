"""Observed actual private producer/inverse race; no inserted fixture history.
A root-owned adapter capture supplies the genuine native producer arguments.
The root owns all actual execution and the paired Auth/qualification receipts.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
import uuid
from urllib.parse import unquote, urlparse

TABLES = ['private_application_sources', 'private_source_install_grants', 'private_definition_predecessors',
          'private_definition_function_receipts', 'system_version_sources', 'system_version_source_revisions',
          'system_version_source_shares', 'system_package_install_grants', 'system_versions',
          'system_version_native_applications', 'saved_product_work', 'application_records']


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def uid(value):
    uuid.UUID(value)
    return literal(value) + '::uuid'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('receipt')
    parser.add_argument('--forward', required=True)
    parser.add_argument('--inverse', required=True)
    parser.add_argument('--case', choices=['source', 'grant'], required=True)
    parser.add_argument('--outcome', choices=['populated', 'timeout'], default='populated')
    args = parser.parse_args()
    if os.environ.get('STRELVA_LOCAL_AUTH_PROOF') != '1':
        raise SystemExit('Explicit owned local Auth proof required.')
    database = urlparse(os.environ.get('STRELVA_LOCAL_DB_URL', ''))
    auth = urlparse(os.environ.get('SUPABASE_URL', ''))
    stack = Path(os.environ.get('STRELVA_AUTH_STACK_DIR', '')).resolve()
    if database.scheme not in ['postgres', 'postgresql'] or database.hostname != '127.0.0.1' or database.path != '/postgres' or database.query or database.fragment:
        raise SystemExit('Exact owned loopback database required.')
    config = (stack / 'supabase/config.toml').read_text()
    if stack.stat().st_uid != os.getuid() or not re.fullmatch(r'strelva-auth\.[A-Za-z0-9]+', stack.name) or not re.search(r'^project_id\s*=\s*"strelva-proof-[a-f0-9]{16}"\s*$', config, re.M):
        raise SystemExit('Owned Auth proof stack required.')
    def port(section):
        block = re.search(r'^\[' + section + r'\]\s*\n(.*?)(?=^\[|\Z)', config, re.M | re.S)
        value = re.search(r'^port\s*=\s*(\d+)\s*$', block[1], re.M) if block else None
        return int(value[1]) if value else None
    if database.port != port('db') or auth.hostname not in ['127.0.0.1', 'localhost'] or auth.scheme != 'http' or auth.port != port('api'):
        raise SystemExit('Actual owned Auth/database ports required.')
    path = Path(args.receipt).resolve()
    directory = Path(os.environ.get('STRELVA_PRIVATE_SOURCE_PROOF_DIR', '')).resolve()
    if directory.stat().st_uid != os.getuid() or path.parent != directory or path.stat().st_uid != os.getuid() or path.stat().st_mode & 0o077:
        raise SystemExit('Actual private receipt in the owned proof directory required.')
    f = json.loads(path.read_text())
    candidate = f['candidate']
    if f['provenance'] != {'actualAdapterCapture': True, 'nativeWriteExecuted': False, 'localFictionalPolicy': True, 'productionQualification': False}:
        raise SystemExit('Capture before the actual native producer required; no fabricated history.')
    if not re.fullmatch(r'[a-f0-9]{40}', candidate['sourceCommit']):
        raise SystemExit('Exact final candidate source commit required.')
    for field, path in [('forwardSha256', args.forward), ('inverseSha256', args.inverse)]:
        if hashlib.sha256(Path(path).read_bytes()).hexdigest() != candidate[field]:
            raise SystemExit('Exact candidate source bytes required: ' + field)
    inverse = Path(args.inverse).read_text()
    if 'lock table public.private_application_sources,public.private_source_install_grants in access exclusive mode;' not in inverse.lower():
        raise SystemExit('Reviewed ordered private source/grant marker locks required.')
    a = f['producerArguments']
    actor = f['actor']
    if a['p_user_id'] != actor['userId'] or a['p_verified_email'] != actor['email'] or not actor['email'].endswith('@example.test'):
        raise SystemExit('Actual signed fictional producer identity mismatch.')
    if args.case == 'source':
        if f['producerName'] != 'publish_private_application_source':
            raise SystemExit('Actual private publication producer capture required.')
        r = a['p_revision']
        if r['source']['businessId'] != a['p_workspace_id'] or r['source']['systemId'] != a['p_system_id'] or r['source']['revisionId'] != a['p_command_id'] or int(r['source']['number']) != int(a['p_expected_revision']) + 1 or r['publishedBy'] != actor['userId']:
            raise SystemExit('Actual captured native publication linkage mismatch.')
        values = [uid(a['p_workspace_id']), uid(actor['userId']), literal(actor['email']), uid(a['p_system_id']),
                  uid(a['p_command_id']), str(int(a['p_expected_revision'])), literal(json.dumps(r)) + '::jsonb']
        target = 'private_application_sources'
    else:
        if f['producerName'] != 'grant_private_application_install':
            raise SystemExit('Actual owner private grant producer capture required.')
        values = [uid(a['p_workspace_id']), uid(actor['userId']), literal(actor['email']), uid(a['p_agency_workspace_id']),
                  uid(a['p_revision_id']), uid(a['p_command_id']), literal(a['p_expires_at']) + '::timestamptz']
        target = 'private_source_install_grants'
    producer = 'select public.' + f['producerName'] + '(' + ','.join(values) + ');'
    # Finite child environment: never inherit PG service/options, psql config,
    # dynamic-loader, Node or Python preload variables from the caller.
    env = {'PATH': '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin', 'LC_ALL': 'C',
           'PGCONNECT_TIMEOUT': '5', 'PGSSLMODE': 'disable', 'PGPASSFILE': '/dev/null',
           'PGHOST': database.hostname, 'PGPORT': str(database.port), 'PGUSER': unquote(database.username or ''),
           'PGPASSWORD': unquote(database.password or ''), 'PGDATABASE': unquote(database.path.lstrip('/'))}
    base = ['psql', '--no-psqlrc', '-A', '-t', '-q', '--set=ON_ERROR_STOP=1']
    def execute(sql):
        result = subprocess.run(base, input=sql, env=env, text=True, capture_output=True, timeout=20)
        if result.returncode:
            raise AssertionError('Actual owned SQL failed: ' + result.stderr[:1200])
        return result.stdout.strip()
    actor_exists = execute('select exists(select 1 from public.users u join auth.users auth on auth.id=u.id join public.workspace_memberships m on m.user_id=u.id where u.id=' + uid(actor['userId']) + ' and lower(u.email)=' + literal(actor['email'].lower()) + ' and u.verified_at is not null and auth.email_confirmed_at is not null and m.workspace_id=' + uid(a['p_workspace_id']) + (" and m.role in ('owner','admin'));" if args.case == 'source' else " and m.role='owner');"))
    if actor_exists != 't':
        raise SystemExit('Actual verified source manager/customer owner membership required.')
    history = json.loads(execute("select jsonb_build_object('sources',(select count(*) from public.private_application_sources),'grants',(select count(*) from public.private_source_install_grants));"))
    if args.case == 'source' and history != {'sources': 0, 'grants': 0}:
        raise SystemExit('First genuine private publication race must start without private history.')
    if args.case == 'grant' and (history['sources'] < 1 or history['grants'] != 0):
        raise SystemExit('First genuine owner private grant race requires actual published source and no marked grants.')
    journal = execute("select count(*)=17 and bool_and(body_sha256=encode(sha256(convert_to(pg_get_functiondef(signature::regprocedure),'UTF8')),'hex')) from public.private_definition_function_receipts;")
    if journal != 't':
        raise SystemExit('Complete current final successor journal required.')
    pairs = []
    for table in TABLES:
        pairs.extend([literal(table), "(select encode(sha256(convert_to(coalesce(jsonb_agg(row order by row::text),'[]'::jsonb)::text,'UTF8')),'hex') from (select to_jsonb(item) row from public." + table + ' item) actual)'])
    row_sql = 'select jsonb_build_object(' + ','.join(pairs) + ');'
    def catalog():
        dump = subprocess.run(['pg_dump', '--schema-only', '--schema=public', '--no-password'], env=env, text=True, capture_output=True, timeout=30)
        if dump.returncode:
            raise AssertionError('Actual owned catalog snapshot failed.')
        normalized = '\n'.join(line for line in dump.stdout.splitlines() if not re.match(r'^\\(un)?restrict\s', line))
        return hashlib.sha256(normalized.encode()).hexdigest()
    before_catalog = catalog()
    holder = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, text=True, bufsize=1)
    waiter = None
    try:
        # Capture the producer's actual pending rows inside its own transaction.
        # These are the exact expected committed state, not invented INSERTs.
        holder.stdin.write("begin;set local statement_timeout='35s';select pg_backend_pid();" + producer + row_sql + "select 'PRODUCER_HELD';\n")
        holder.stdin.flush()
        pid, expected_rows = None, None
        while True:
            line = holder.stdout.readline().strip()
            if line.isdigit() and pid is None:
                pid = int(line)
            if line.startswith('{'):
                value = json.loads(line)
                if set(value) == set(TABLES):
                    expected_rows = value
            if line == 'PRODUCER_HELD':
                break
            if holder.poll() is not None:
                raise AssertionError('Actual native producer refused: ' + holder.stderr.read()[:1200])
        if pid is None or expected_rows is None:
            raise AssertionError('Actual producer PID and all twelve pending table snapshots required.')
        application = 'private-producer-inverse-' + str(uuid.uuid4())
        waiter = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, text=True)
        waiter.stdin.write('set application_name=' + literal(application) + ";set statement_timeout='20s';\n" + inverse)
        waiter.stdin.close()
        observed = None
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            rows = json.loads(execute("select coalesce(jsonb_agg(jsonb_build_object('pid',a.pid,'wait',a.wait_event_type,'blockers',pg_blocking_pids(a.pid),'relation',l.relation::regclass::text,'mode',l.mode)),'[]'::jsonb) from pg_stat_activity a join pg_locks l on l.pid=a.pid and not l.granted where a.application_name=" + literal(application) + ';'))
            observed = next((row for row in rows if row['wait'] == 'Lock' and pid in row['blockers'] and row['relation'] in [target, 'public.' + target] and row['mode'] == 'AccessExclusiveLock'), None)
            if observed:
                break
            if waiter.poll() is not None:
                raise AssertionError('Inverse did not observably wait on the exact private marker relation: ' + waiter.stderr.read()[:1200])
            time.sleep(.01)
        if not observed:
            raise AssertionError('No observed exact private marker blocker.')
        if args.outcome == 'timeout':
            waiter.wait(timeout=25)
        holder.stdin.write('commit;\n'); holder.stdin.close(); holder.wait(timeout=40)
        if holder.returncode:
            raise AssertionError('Genuine native producer did not commit: ' + holder.stderr.read()[:1200])
        waiter.wait(timeout=25)
        error = waiter.stderr.read()
        expected = 'private_definition_populated_forward_only' if args.outcome == 'populated' else 'canceling statement due to lock timeout'
        if waiter.returncode == 0 or expected not in error or 'deadlock detected' in error:
            raise AssertionError('Inverse did not give the precise bounded refusal: ' + error[:1200])
        after_rows = json.loads(execute(row_sql))
        after_catalog = catalog()
        if after_rows != expected_rows or after_catalog != before_catalog:
            raise AssertionError('Refused inverse changed catalog or the actual producer-committed twelve-table state.')
        print(json.dumps({'case': args.case + ' native producer wins; inverse ' + args.outcome + ' refusal', 'candidate': candidate,
                          'observedBlocker': pid, 'waiter': observed['pid'], 'relation': observed['relation'], 'mode': observed['mode'],
                          'catalogAndRowsUnchangedByInverse': True, 'schemaSha256': after_catalog, 'rowHashes': after_rows,
                          'productionQualification': False}), flush=True)
    finally:
        for process in [holder, waiter]:
            if process is not None and process.poll() is None:
                process.terminate(); process.wait(timeout=5)


if __name__ == '__main__':
    main()
