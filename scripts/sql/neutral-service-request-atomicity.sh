#!/usr/bin/env bash
# Failure injection against an already migrated DISPOSABLE loopback cluster.
# No normal migration is applied here; the transaction must fail and roll back.
set -euo pipefail
neutral_db_url=${1:?Pass the disposable loopback database URL}
neutral_repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
python3 - "$neutral_db_url" <<'PY'
import sys,urllib.parse
p=urllib.parse.urlparse(sys.argv[1]);q=urllib.parse.parse_qs(p.query)
if p.scheme not in ('postgres','postgresql') or set(q)-{'host','port'}: raise SystemExit('Only a disposable loopback URL is accepted')
host=q.get('host',[p.hostname])[0]
if host not in ('localhost','127.0.0.1','::1') and not (host and (host.startswith('/private/tmp/') or host.startswith('/tmp/'))): raise SystemExit('Refusing non-loopback database')
PY
neutral_tmp=$(mktemp -d "${TMPDIR:-/tmp}/strelva-neutral-atomicity.XXXXXX")
trap 'rm -f "$neutral_tmp/before.json" "$neutral_tmp/after.json" "$neutral_tmp/fail.sql" "$neutral_tmp/failure.log"; rmdir "$neutral_tmp"' EXIT
neutral_catalog_sql="select coalesce(jsonb_agg(to_jsonb(f) order by f.signature),'[]'::jsonb) from (select p.oid,p.oid::regprocedure::text as signature,p.proowner,p.proacl,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f') f"
psql "$neutral_db_url" -X -A -t -v ON_ERROR_STOP=1 -c "$neutral_catalog_sql" > "$neutral_tmp/before.json"
python3 - "$neutral_repo_root/supabase/migrations/20261020090040_neutral_service_requests.sql" "$neutral_tmp/fail.sql" <<'PY'
import pathlib,sys
source=pathlib.Path(sys.argv[1]).read_text()
# Exclude creation of a new function that already exists on a migrated schema;
# execute the first actual replacement, then fail inside the atomic transaction.
first_end=source.index('$$;')+3
prefix=source[:first_end]
if 'begin;' not in prefix.lower() or 'create or replace function' not in prefix.lower(): raise SystemExit('Atomic replacement prefix missing')
pathlib.Path(sys.argv[2]).write_text(prefix+"\ncreate or replace function public.service_request_assert_provider(text,uuid,uuid,text) returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin raise exception 'injected replacement'; end $$;\nselect 1/0;\ncommit;\n")
PY
if psql "$neutral_db_url" -X -v ON_ERROR_STOP=1 --file="$neutral_tmp/fail.sql" > "$neutral_tmp/failure.log" 2>&1; then
  echo 'Failure injection unexpectedly succeeded' >&2; exit 1
fi
if ! rg -q 'division by zero' "$neutral_tmp/failure.log"; then
  cat "$neutral_tmp/failure.log" >&2; exit 1
fi
psql "$neutral_db_url" -X -A -t -v ON_ERROR_STOP=1 -c "$neutral_catalog_sql" > "$neutral_tmp/after.json"
if ! cmp -s "$neutral_tmp/before.json" "$neutral_tmp/after.json"; then
  echo 'Public function catalog changed after injected migration failure' >&2; exit 1
fi
echo 'Neutral migration: injected replacement failure preserves exact public function catalog, OIDs, definitions, owners and grants.'
