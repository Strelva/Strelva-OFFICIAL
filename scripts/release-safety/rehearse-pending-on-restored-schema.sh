#!/usr/bin/env bash
# Rehearse every migration a hosted target has not applied, against a restored
# SCHEMA-ONLY copy of that target, on a private local cluster.
#
#   STRELVA_PG_BIN=/opt/homebrew/opt/postgresql@17/bin \
#     bash scripts/release-safety/rehearse-pending-on-restored-schema.sh <input-dir> <out-dir>
#
# <input-dir> (private, gitignored, never committed) holds what a separately
# authorized schema-only read produced:
#   prod-schema.sql   pg_dump --schema-only of the target (no rows)
#   applied.tsv       supabase_migrations.schema_migrations: version<TAB>name
#   roleattrs.txt     rolname|super|inherit|createrole|createdb|login|replication|bypassrls
#   members.txt       role|member|admin|inherit|set
# It never connects anywhere but its own Unix socket (listen_addresses='').
#
# Flow: restore -> fictional tenant seed -> C0 -> forward all pending (as the
# non-superuser `postgres`, like the hosted CLI) -> C1 -> every rollback in
# reverse -> C2 (must equal C0) -> forward again -> C3 (must equal C1).
# Exits nonzero on any failed file or catalog mismatch. Grants no authority.
set -euo pipefail
IN=$(cd "$1" && pwd); OUT=$2
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
B=${STRELVA_PG_BIN:-/opt/homebrew/opt/postgresql@18/bin}
PORT=${REHEARSAL_PORT:-55417}
SOCK=/tmp/strelva-reh-$PORT
for v in $(env | grep -o '^PG[A-Z_]*' || true); do unset "$v"; done
export LC_ALL=C
mkdir -p "$OUT"; chmod 700 "$OUT"; OUT=$(cd "$OUT" && pwd)
rm -rf "$OUT/cluster" "$SOCK"; mkdir -p "$SOCK"; chmod 700 "$SOCK"
now() { perl -MTime::HiRes=time -e 'printf "%.3f", time'; }
stop() { "$B/pg_ctl" -D "$OUT/cluster" -m fast -w stop >/dev/null 2>&1 || true; rm -rf "$SOCK"; }
trap stop EXIT

"$B/initdb" -D "$OUT/cluster" -U supabase_admin --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
"$B/pg_ctl" -D "$OUT/cluster" -o "-k $SOCK -p $PORT -c listen_addresses='' -c max_locks_per_transaction=1024" -l "$OUT/postgres.log" -w start >/dev/null
ADMIN=("$B/psql" -X -q -v ON_ERROR_STOP=1 -h "$SOCK" -p "$PORT" -U supabase_admin)
echo "server: $("${ADMIN[@]}" -At -d postgres -c 'show server_version')"

# Hosted roles without passwords; only `postgres` can log in (trust, local socket).
while IFS='|' read -r name sup inh cr cdb _login repl bypass; do
  [ "$name" = supabase_admin ] && continue
  a=""; [ "$sup" = t ] && a+=" SUPERUSER"; [ "$inh" = f ] && a+=" NOINHERIT"; [ "$cr" = t ] && a+=" CREATEROLE"
  [ "$cdb" = t ] && a+=" CREATEDB"; [ "$repl" = t ] && a+=" REPLICATION"; [ "$bypass" = t ] && a+=" BYPASSRLS"
  l=NOLOGIN; [ "$name" = postgres ] && l=LOGIN
  "${ADMIN[@]}" -d postgres -c "create role \"$name\" $l $a"
done < "$IN/roleattrs.txt"
while IFS='|' read -r role member adm inh set; do
  o="inherit $([ "$inh" = t ] && echo true || echo false), set $([ "$set" = t ] && echo true || echo false)"
  [ "$adm" = t ] && o="admin true, $o"
  "${ADMIN[@]}" -d postgres -c "grant \"$role\" to \"$member\" with $o"
done < "$IN/members.txt"
"${ADMIN[@]}" -d postgres -c "alter role postgres set search_path = \"\$user\", public, extensions" -c "create database target owner postgres"

# supabase_vault is hosted-only; its schema is created empty and its grants fail.
sed -E 's/^CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;/CREATE SCHEMA IF NOT EXISTS vault;/' \
  "$IN/prod-schema.sql" > "$OUT/restorable.sql"
"$B/psql" -X -q -h "$SOCK" -p "$PORT" -U supabase_admin -d target -f "$OUT/restorable.sql" >/dev/null 2>"$OUT/restore.err" || true
unexpected=$(grep ERROR "$OUT/restore.err" | grep -v 'vault' | grep -v 'extension "supabase_vault"' || true)
echo "restore: $(grep -c ERROR "$OUT/restore.err" || true) errors (all supabase_vault-only unless listed below)"
if [ -n "$unexpected" ]; then echo "$unexpected"; exit 1; fi
rm -f "$OUT/restorable.sql"

APP=("$B/psql" -X -q -v ON_ERROR_STOP=1 -h "$SOCK" -p "$PORT" -U postgres -d target)
catalog() { "${ADMIN[@]}" -d target -At -f "$ROOT/scripts/release-safety/catalog-wide.sql" > "$OUT/$1.tsv"; echo "$1: $(wc -l < "$OUT/$1.tsv" | tr -d ' ') objects"; }
fixture() { "${ADMIN[@]}" -d target -At -f "$ROOT/scripts/release-safety/fixtures/content-source-backfill-read.sql" > "$OUT/fixture-$1.txt"; }
run_file() { # $1 file; one transaction either way (own begin/commit or psql's).
  if grep -qiE '^[[:space:]]*begin;|concurrently' "$1"; then "${APP[@]}" -f "$1"; else "${APP[@]}" --single-transaction -f "$1"; fi
}

"${ADMIN[@]}" -d target -f "$ROOT/scripts/release-safety/fixtures/content-source-backfill-seed.sql"
fixture seed
catalog C0

cut -f1 "$IN/applied.tsv" | sort > "$OUT/applied-versions.txt"
ls "$ROOT/supabase/migrations" | grep -E '^[0-9]{14}_.+\.sql$' | sort > "$OUT/repo-forwards.txt"
: > "$OUT/pending.txt"
while read -r f; do grep -qx "${f:0:14}" "$OUT/applied-versions.txt" || echo "$f" >> "$OUT/pending.txt"; done < "$OUT/repo-forwards.txt"
echo "pending: $(wc -l < "$OUT/pending.txt" | tr -d ' ') files"

forward() { # $1 round label
  : > "$OUT/forward-$1.tsv"
  while read -r f; do
    t0=$(now); run_file "$ROOT/supabase/migrations/$f" > "$OUT/forward-$1-${f%.sql}.log" 2>&1 \
      || { echo "FORWARD FAILED ($1): $f"; cat "$OUT/forward-$1-${f%.sql}.log"; exit 1; }
    t1=$(now)
    "${ADMIN[@]}" -d target -c "insert into supabase_migrations.schema_migrations(version, name) values ('${f:0:14}', '$(echo "${f:15}" | sed 's/\.sql$//')')"
    printf '%s\t%s\t%s\n' "$f" "$(shasum -a 256 "$ROOT/supabase/migrations/$f" | cut -d' ' -f1)" "$(perl -e "printf '%.0f', ($t1-$t0)*1000")" >> "$OUT/forward-$1.tsv"
  done < "$OUT/pending.txt"
  echo "forward $1: $(wc -l < "$OUT/forward-$1.tsv" | tr -d ' ') applied"
}
reverse() {
  : > "$OUT/rollback.tsv"
  tail -r "$OUT/pending.txt" | while read -r f; do
    rb="$ROOT/supabase/migrations/rollback-$f"
    [ -f "$rb" ] || { echo "MISSING ROLLBACK: rollback-$f"; exit 1; }
    t0=$(now); run_file "$rb" > "$OUT/rollback-${f%.sql}.log" 2>&1 \
      || { echo "ROLLBACK FAILED: rollback-$f"; cat "$OUT/rollback-${f%.sql}.log"; exit 1; }
    t1=$(now)
    "${ADMIN[@]}" -d target -c "delete from supabase_migrations.schema_migrations where version = '${f:0:14}'"
    printf '%s\t%s\t%s\n' "rollback-$f" "$(shasum -a 256 "$rb" | cut -d' ' -f1)" "$(perl -e "printf '%.0f', ($t1-$t0)*1000")" >> "$OUT/rollback.tsv"
  done
  echo "rollback: $(wc -l < "$OUT/rollback.tsv" | tr -d ' ') reversed"
}

forward 1; fixture forward1; catalog C1
reverse; fixture rollback; catalog C2
forward 2; fixture forward2; catalog C3

status=0
if diff -u "$OUT/C0.tsv" "$OUT/C2.tsv" > "$OUT/C0-vs-C2.diff"; then echo "C2 == C0: rollback restores the target catalog exactly"; else echo "C2 != C0: see $OUT/C0-vs-C2.diff ($(grep -c '^[-+][^-+]' "$OUT/C0-vs-C2.diff") lines)"; status=1; fi
if diff -u "$OUT/C1.tsv" "$OUT/C3.tsv" > "$OUT/C1-vs-C3.diff"; then echo "C3 == C1: reapply reproduces the forward catalog exactly"; else echo "C3 != C1: see $OUT/C1-vs-C3.diff ($(grep -c '^[-+][^-+]' "$OUT/C1-vs-C3.diff") lines)"; status=1; fi
for s in seed forward1 rollback forward2; do echo "fixture $s:"; sed 's/^/  /' "$OUT/fixture-$s.txt"; done
exit $status
