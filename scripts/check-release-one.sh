#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

# Release-one checks are local evidence only. Keep them in a provider-free
# fixture mode so a developer's exported credentials cannot turn a focused gate
# into a live read or write. Use explicit empty values because Next.js can
# repopulate an unset variable from `.env.local`.
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

echo "== typecheck =="
pnpm typecheck
echo "== product boundaries =="
pnpm check:boundaries
echo "== ontology invariants =="
pnpm check:ontology
echo "== dependency audit =="
pnpm audit --audit-level high

# Keep the named release paths explicit. The globbed additions keep the future
# Enterprise/Home Finder/IDX/Assessment/Access inventory visible: a new focused
# test is picked up without requiring a second script edit.
focused_tests=(
  src/__tests__/workspace-routes.test.ts
  src/__tests__/workspace-presentation.test.ts
  src/__tests__/workspaces-foundation.test.ts
  src/__tests__/product-catalog.test.ts
  src/__tests__/product-boundaries.test.ts
  src/__tests__/ai-visibility.test.ts
  src/__tests__/pinned-public-text.test.ts
  src/__tests__/ai-visibility-results.test.ts
  src/__tests__/ai-visibility-routes.test.ts
  src/__tests__/account-page.test.ts
  src/__tests__/workspace-account-page.test.ts
  src/__tests__/workspace-operations.test.ts
  src/__tests__/workspace-location.test.ts
  src/__tests__/dashboard-route-redirects.test.ts
  src/__tests__/auth-access-pages.test.ts
  src/__tests__/website-audit-work.test.ts
  src/__tests__/app-frame-contract.test.ts
)
future_tests=()
enterprise_tests=()
customer_tests=()
home_finder_tests=()
idx_tests=()
assessment_tests=()
access_tests=()
shopt -s nullglob
for candidate in \
  src/__tests__/*enterprise*.test.ts \
  src/__tests__/*customer*.test.ts \
  src/__tests__/*home-finder*.test.ts \
  src/__tests__/*idx*.test.ts \
  src/__tests__/*installation*.test.ts \
  src/__tests__/assessment-*.test.ts \
  src/__tests__/access-*.test.ts; do
  if [[ " ${focused_tests[*]} " == *" $candidate "* ]]; then
    continue
  fi
  focused_tests+=("$candidate")
  future_tests+=("$candidate")
  case "$candidate" in
    *enterprise*) enterprise_tests+=("$candidate") ;;
    *customer*) customer_tests+=("$candidate") ;;
    *home-finder*) home_finder_tests+=("$candidate") ;;
    *idx*|*installation*) idx_tests+=("$candidate") ;;
    src/__tests__/assessment-*.test.ts) assessment_tests+=("$candidate") ;;
    src/__tests__/access-*.test.ts) access_tests+=("$candidate") ;;
  esac
done
if ((${#future_tests[@]} == 0)); then
  echo "No future Enterprise/Home Finder/IDX/assessment/access Vitest files are present; their release evidence remains pending."
else
  printf 'Additional focused test inventory: %s\n' "${future_tests[*]}"
fi
if ((${#enterprise_tests[@]} == 0)); then
  echo "Enterprise-specific Vitest inventory: none present; AC-05 Enterprise evidence remains pending."
fi
if ((${#idx_tests[@]} == 0)); then
  echo "IDX/installation-specific Vitest inventory: none present; AC-06/AC-09 evidence remains pending."
fi

echo "== focused Vitest release paths =="
pnpm exec vitest run "${focused_tests[@]}" --maxWorkers=2

echo "== isolated workspace SQL =="
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

echo "== focused browser acceptance: account/recovery and Website Audit =="
REB_DEV_UNGATED_ACCESS=0 STRELVA_WORKSPACE_RELEASE=0 \
  pnpm exec playwright test tests/customer-frontend.spec.ts tests/product-entry.spec.ts

echo "== focused browser acceptance: workspace/Enterprise =="
REB_DEV_UNGATED_ACCESS=0 STRELVA_WORKSPACE_RELEASE=1 \
  pnpm exec playwright test tests/workspace-release.spec.ts

echo "== focused browser acceptance: shared frame (isolated preview fixture) =="
STRELVA_UI_PREVIEW=1 REB_DEV_UNGATED_ACCESS=0 STRELVA_WORKSPACE_RELEASE=0 \
  pnpm exec playwright test tests/shared-frame.spec.ts

printf 'Local release-one checks passed. Hosted Actions, changed sibling gates, production activation and live-provider evidence remain separate gates.\n'
