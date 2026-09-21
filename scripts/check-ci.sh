#!/usr/bin/env bash
# CI-faithful local gate. Runs the checks enforced by the GitHub Actions `build`
# job, including the browser gates that run for a ready-for-review PR. See
# docs/testing-and-ci.md for the local/hosted evidence boundary.
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

# Match the hosted runner's empty-provider environment. These are explicit empty
# exports rather than `unset`: Next.js may load an unset variable from `.env.local`,
# while an existing empty value remains authoritative. This subprocess-only
# cleanup prevents local credentials from changing smoke/test meaning.
export CI=true
export DATA_SOURCE="" CONTENT_SOURCE="" TENANTS_SOURCE=""
export REB_DEV_UNGATED_ACCESS=0 SCAFFOLD_DEV_UNGATED_ACCESS=0 REB_DEV_TENANT="" SCAFFOLD_DEV_TENANT=""
export STRELVA_UI_PREVIEW=0 STRELVA_WORKSPACE_RELEASE=0 STRELVA_CUSTOMERS_RELEASE=0
export NEXT_PUBLIC_SUPABASE_URL="" NEXT_PUBLIC_SUPABASE_ANON_KEY="" NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=""
export SUPABASE_URL="" SUPABASE_SERVICE_ROLE_KEY=""
export UPSTASH_REDIS_REST_URL="" UPSTASH_REDIS_REST_TOKEN="" KV_REST_API_URL="" KV_REST_API_TOKEN=""
export GOOGLE_GENERATIVE_AI_API_KEY="" GOOGLE_PAGESPEED_API_KEY="" SERP_API_KEY=""
export RESEND_API_KEY="" SLACK_WEBHOOK_URL="" STRIPE_SECRET_KEY="" STRIPE_WEBHOOK_SECRET=""
export BLOB_READ_WRITE_TOKEN="" VERCEL_TOKEN="" VERCEL_API_TOKEN=""
export INTERNAL_API_SECRET="" CRON_SECRET="" OAUTH_STATE_SECRET="" APPROVE_LINK_SECRET="" SECRETS_ENC_KEY=""
export CUSTOM_DOMAIN_MAP="{}" VERCEL_ENV="" PLAYWRIGHT_BASE_URL="" PLAYWRIGHT_CHANNEL="" PLAYWRIGHT_BUILT_APP=0

# Surface smoke needs a synthetic tenant file, but a developer may already have
# a local dev-tenants.json. Back it up before any checks and restore it on every
# exit so a failed gate cannot delete or overwrite the user's fixture.
fixture_path="$repo_root/dev-tenants.json"
backup_dir="$(mktemp -d "${TMPDIR:-/tmp}/strelva-check-ci.XXXXXX")"
fixture_backup="$backup_dir/dev-tenants.json"
had_fixture=0
if [[ -e "$fixture_path" || -L "$fixture_path" ]]; then
  cp -a -- "$fixture_path" "$fixture_backup"
  had_fixture=1
fi

restore_fixture() {
  local status=$?
  trap - EXIT INT TERM HUP
  set +e
  local cleanup_status=0
  rm -f -- "$fixture_path" || cleanup_status=$?
  if [[ "$had_fixture" -eq 1 ]]; then
    cp -a -- "$fixture_backup" "$fixture_path" || cleanup_status=$?
  fi
  rm -rf -- "$backup_dir" || cleanup_status=$?
  if [[ "$status" -eq 0 && "$cleanup_status" -ne 0 ]]; then
    status="$cleanup_status"
  fi
  exit "$status"
}
trap restore_fixture EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

echo "== lint =="
pnpm lint
echo "== typecheck =="
pnpm typecheck
echo "== product boundaries =="
pnpm check:boundaries
echo "== ontology invariants =="
pnpm check:ontology
echo "== workspace ownership SQL =="
postgres_bin_dir="/opt/homebrew/opt/postgresql@18/bin"
if [[ ! -x "$postgres_bin_dir/initdb" ]]; then
  postgres_bin_dir="$(pg_config --bindir 2>/dev/null || true)"
fi
if [[ -z "$postgres_bin_dir" || ! -x "$postgres_bin_dir/initdb" ]]; then
  echo "PostgreSQL server binaries are unavailable (need initdb, pg_ctl, postgres, psql)." >&2
  exit 1
fi
export PATH="$postgres_bin_dir:$PATH"
for postgres_command in initdb pg_ctl postgres psql; do
  if ! command -v "$postgres_command" >/dev/null 2>&1; then
    echo "PostgreSQL server command is unavailable: $postgres_command" >&2
    exit 1
  fi
done
pnpm check:workspace-sql
echo "== vitest with coverage gate =="
pnpm test:coverage
echo "== dependency audit =="
pnpm audit --audit-level high
echo "== build =="
pnpm build
echo "== public smoke =="
REB_DEV_UNGATED_ACCESS=0 pnpm smoke
echo "== workspace browser acceptance =="
CI=true SCAFFOLD_DEV_UNGATED_ACCESS=0 REB_DEV_UNGATED_ACCESS=0 pnpm smoke:workspace
echo "== surface smoke (synthetic tenant, no Redis) =="
rm -f -- "$fixture_path"
cp tests/fixtures/tenants.fixture.json "$fixture_path"
DATA_SOURCE=file CONTENT_SOURCE=file TENANTS_SOURCE=file CI=true \
  SCAFFOLD_DEV_UNGATED_ACCESS=1 SCAFFOLD_DEV_TENANT=gldf \
  UPSTASH_REDIS_REST_URL="" UPSTASH_REDIS_REST_TOKEN="" \
  KV_REST_API_URL="" KV_REST_API_TOKEN="" \
  pnpm smoke:surfaces

echo ""
echo "All hosted-equivalent CI checks passed locally. Hosted Actions evidence remains separate."
