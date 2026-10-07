#!/usr/bin/env python3
"""Dump one consistent Postgres snapshot, restore a fresh DB, compare every user table.

URLs are read from named environment variables. No values or data are printed.
A non-local source OR restore admin needs --i-have-jacobs-yes. Use only local
fixtures during development. Dumps contain private data: keep them outside Git.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid
sys.path.insert(0, str(Path(__file__).resolve().parent / 'release-safety'))
from postgres import BIN, command, db_url, identifier, pg_env, require_local, sql


def compare_counts(source, restored):
    differences = []
    for table in sorted(set(source) | set(restored)):
        if source.get(table) != restored.get(table):
            differences.append({'table': table, 'source': source.get(table), 'restored': restored.get(table)})
    if differences:
        raise ValueError(f'Row count mismatch in {len(differences)} table(s).')


def table_counts(url, snapshot=None):
    tables = json.loads(sql(url, "select coalesce(json_agg(json_build_array(n.nspname,c.relname) order by n.nspname,c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname not like 'pg_%' and n.nspname <> 'information_schema';"))
    lines = ["begin isolation level repeatable read read only;"]
    if snapshot:
        lines.append("set transaction snapshot '" + snapshot + "';")
    for schema, table in tables:
        key = json.dumps([schema, table], separators=(',', ':'))
        literal = key.replace("'", "''")
        lines.append(f"select json_build_array('{literal}',count(*)) from {identifier(schema)}.{identifier(table)};")
    lines.append('commit;')
    out = sql(url, '\n'.join(lines))
    return dict(json.loads(line) for line in out.splitlines() if line.startswith('['))


def rehearse(source, admin, out, jacobs_yes=False):
    # Both guards run before ANY connection or filesystem mutation.
    require_local(source, jacobs_yes)
    require_local(admin, jacobs_yes)
    out = Path(out).resolve()
    repo = Path(__file__).resolve().parent.parent
    if out == repo or repo in out.parents:
        raise ValueError('Backup output must be outside the repository.')
    out.mkdir(mode=0o700, parents=True, exist_ok=False)
    os.chmod(out, 0o700)
    name = 'strelva_restore_' + uuid.uuid4().hex[:20]
    target = db_url(admin, name)
    started = time.monotonic()
    keeper = subprocess.Popen([str(BIN / 'psql'), '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
                              env=pg_env(source), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                              stderr=subprocess.DEVNULL, text=True, bufsize=1)
    try:
        keeper.stdin.write('begin isolation level repeatable read read only;\nselect pg_export_snapshot();\n')
        keeper.stdin.flush()
        snapshot = keeper.stdout.readline().strip()
        if not snapshot or not all(c in '0123456789ABCDEFabcdef-' for c in snapshot):
            raise RuntimeError('Could not export a consistent source snapshot.')
        counts = table_counts(source, snapshot)
        dump = out / 'database.dump'
        command('pg_dump', ['--format=custom', '--snapshot=' + snapshot, '--file=' + str(dump)], source)
        os.chmod(dump, 0o600)
        dump_seconds = time.monotonic() - started
        keeper.stdin.write('rollback;\n\\q\n')
        keeper.stdin.flush()
        keeper.wait(timeout=10)
        # TEMPLATE template0 and a random generated name guarantee a fresh target.
        sql(admin, f'create database {identifier(name)} template template0;')
        restore_started = time.monotonic()
        # Precreate policy/grant role names without login or privileges. No passwords copied.
        roles = json.loads(sql(source, "select coalesce(json_agg(rolname),'[]') from pg_roles where rolname not like 'pg_%';"))
        existing = set(json.loads(sql(admin, "select json_agg(rolname) from pg_roles;")))
        for role in roles:
            if role not in existing:
                sql(admin, f'create role {identifier(role)} nologin;')
        command('pg_restore', ['--exit-on-error', '--no-owner', '--no-acl', '--dbname=' + target, str(dump)], target)
        restored = table_counts(target)
        compare_counts(counts, restored)
        receipt = {'database': name, 'dumpBytes': dump.stat().st_size, 'dumpSeconds': round(dump_seconds, 3),
                   'restoreSeconds': round(time.monotonic() - restore_started, 3),
                   'tables': [{'table': json.loads(key), 'source': value, 'restored': restored[key]} for key, value in sorted(counts.items())],
                   'rowCountsMatch': True, 'scope': 'Schema/data restore with ownership and ACLs omitted; not hosted Auth, storage or Redis recovery.'}
        (out / 'restore-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
        os.chmod(out / 'restore-receipt.json', 0o600)
        return receipt
    finally:
        if keeper.poll() is None:
            keeper.terminate()
            keeper.wait(timeout=10)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-env', required=True)
    parser.add_argument('--target-admin-env', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--i-have-jacobs-yes', action='store_true')
    args = parser.parse_args()
    receipt = rehearse(os.environ[args.source_env], os.environ[args.target_admin_env], args.out, args.i_have_jacobs_yes)
    print(f"Restore passed: {len(receipt['tables'])} tables, {receipt['dumpBytes']} bytes, dump {receipt['dumpSeconds']}s, restore {receipt['restoreSeconds']}s. Private receipt retained.")

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Never interpolate URL, private rows or raw subprocess diagnostics.
        print(str(error) if isinstance(error, (ValueError, RuntimeError)) else 'Restore rehearsal failed; inspect the private artifact.', file=sys.stderr)
        sys.exit(1)
