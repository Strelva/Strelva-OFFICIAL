#!/usr/bin/env bash
# Already migrated disposable loopback database only. Inject failures, never commit changes.
set -euo pipefail
enterprise_db_url=${1:?Pass the disposable loopback database URL}
enterprise_repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
python3 - "$enterprise_db_url" <<'PY'
import sys,urllib.parse
p=urllib.parse.urlparse(sys.argv[1]);q=urllib.parse.parse_qs(p.query)
if p.scheme not in ('postgres','postgresql') or set(q)-{'host','port'}: raise SystemExit('Only a disposable loopback URL is accepted')
host=q.get('host',[p.hostname])[0]
if host not in ('localhost','127.0.0.1','::1') and not (host and (host.startswith('/private/tmp/') or host.startswith('/tmp/'))): raise SystemExit('Refusing non-loopback database')
PY
enterprise_tmp=$(mktemp -d "${TMPDIR:-/tmp}/strelva-enterprise-atomicity.XXXXXX")
trap 'rm -f "$enterprise_tmp/before.txt" "$enterprise_tmp/after.txt" "$enterprise_tmp/units.sql" "$enterprise_tmp/home-finder.sql" "$enterprise_tmp/failure.log"; rmdir "$enterprise_tmp"' EXIT
psql "$enterprise_db_url" -X -A -t -v ON_ERROR_STOP=1 --file="$enterprise_repo_root/tests/support/public-catalog-fingerprint.sql" > "$enterprise_tmp/before.txt"
python3 - "$enterprise_repo_root" "$enterprise_tmp" <<'PY'
import pathlib,re,sys
root=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2])
for name,file,functions in [('units','20261021110000_enterprise_units.sql',['enterprise_read_require','read_enterprise_units','read_enterprise_unit_versions']),('home-finder','20261021112000_home_finder_native.sql',['read_home_finder_bindings'])]:
 source=(root/'supabase/migrations'/file).read_text(); definitions=[]
 for function in functions:
  match=re.search(r'create function public\.'+function+r'\([\s\S]*?\$\$;',source)
  if not match:raise SystemExit('Expected authority/reader definition absent: '+function)
  definitions.append(match[0].replace('create function','create or replace function',1))
 (out/(name+'.sql')).write_text("begin;\nset local lock_timeout='5s';\n"+'\n'.join(definitions)+"\nselect 1/0;\ncommit;\n")
PY
for enterprise_name in units home-finder; do
 if psql "$enterprise_db_url" -X -v ON_ERROR_STOP=1 --file="$enterprise_tmp/$enterprise_name.sql" > "$enterprise_tmp/failure.log" 2>&1; then
  echo 'Failure injection unexpectedly succeeded' >&2; exit 1
 fi
 if ! rg -q 'division by zero' "$enterprise_tmp/failure.log"; then cat "$enterprise_tmp/failure.log" >&2; exit 1; fi
 psql "$enterprise_db_url" -X -A -t -v ON_ERROR_STOP=1 --file="$enterprise_repo_root/tests/support/public-catalog-fingerprint.sql" > "$enterprise_tmp/after.txt"
 if ! cmp -s "$enterprise_tmp/before.txt" "$enterprise_tmp/after.txt"; then echo 'Public catalog changed after injected authority/reader failure' >&2; exit 1; fi
done
echo 'Enterprise/Home Finder reader repair: failed atomic replacements preserve the public catalog.'
