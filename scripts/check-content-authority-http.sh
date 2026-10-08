#!/usr/bin/env bash
# Real local Auth, full schema and receipt-enabled HTTP routes. Owns only its
# disposable loopback stack/app. No hosted environment or outside provider.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
[[ ! -e .env.local && ! -e .env ]] || { echo 'Local service credential files must be absent.' >&2; exit 1; }
for command_name in docker psql npx node curl python3 openssl rg; do command -v "$command_name" >/dev/null || exit 1; done
docker info >/dev/null 2>&1 || { echo 'Docker is unavailable.' >&2; exit 1; }
work="$(mktemp -d "${TMPDIR:-/tmp}/strelva-content-authority.XXXXXX")"
chmod 700 "$work"
unset STRELVA_AUTH_STACK_DIR
app_pid=""
cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [[ -n "$app_pid" ]]; then pkill -TERM -P "$app_pid" 2>/dev/null || true; kill -TERM "$app_pid" 2>/dev/null || true; wait "$app_pid" 2>/dev/null || true; fi
  if [[ -z "${STRELVA_AUTH_STACK_DIR:-}" && -f "$work/env" ]]; then
    STRELVA_AUTH_STACK_DIR="$(sed -n 's/^STRELVA_AUTH_STACK_DIR=//p' "$work/env")"
  fi
  if [[ -n "${STRELVA_AUTH_STACK_DIR:-}" ]]; then npx --yes supabase@2.117.0 stop --workdir "$STRELVA_AUTH_STACK_DIR" --no-backup > "$work/stop.log" 2>&1 || true; fi
  echo "Private local logs and HTTP evidence: $work"
  exit "$status"
}
trap cleanup EXIT INT TERM
env -u SUPABASE_ACCESS_TOKEN -u SUPABASE_SERVICE_ROLE_KEY -u NEXT_PUBLIC_SUPABASE_URL -u VERCEL_ENV -u NODE_OPTIONS \
  CI=true STRELVA_LOCAL_AUTH_PROOF=1 RUNNER_TEMP="$work" GITHUB_ENV="$work/env" \
  GITHUB_RUN_ID="content-$(openssl rand -hex 5)" GITHUB_RUN_ATTEMPT="1" SUPABASE_CLI="npx --yes supabase@2.117.0" \
  bash scripts/prepare-launch-auth-stack.sh > "$work/prepare.log" 2>&1
set -a; source "$work/env"; set +a
while IFS= read -r flag; do unset "$flag"; done < <(env | sed -n 's/^\(STRELVA_[A-Z0-9_]*\)=.*/\1/p' | rg '(RELEASE|OWNER_ENTRY|MODEL|BOOKING_STORE|INQUIRY_RECORDS|LEADS_|BUSINESS_RECORD_READS)')
export STRELVA_LOCAL_AUTH_PROOF=1 STRELVA_CONTENT_AUTHORITY_HTTP_PROOF=1 STRELVA_OPERATOR_QUEUE_RELEASE=1
export REB_DEV_UNGATED_ACCESS=0 SCAFFOLD_DEV_UNGATED_ACCESS=0 CONTENT_SOURCE=postgres TENANTS_SOURCE=postgres DATA_SOURCE=postgres
export EMAIL_SENDING_ENABLED=false CUSTOMER_EMAIL_ENABLED=false OPERATOR_EMAILS_ENABLED=false PROSPECT_EMAILS_ENABLED=false
while IFS= read -r key; do unset "$key"; done < <(env | sed -n 's/^\([A-Z0-9_]*\)=.*/\1/p' | rg '^(OPENAI|ANTHROPIC|RESEND|AI_GATEWAY|BLOB_|GOOGLE|BRAVE|BING|PERPLEXITY|TAVILY|SERP|UPSTASH|KV_|STRIPE|VERCEL|SENTRY)')
unset NODE_OPTIONS SUPABASE_ACCESS_TOKEN SLACK_WEBHOOK_URL NEXT_PUBLIC_SENTRY_DSN
port="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')"
export PLAYWRIGHT_BASE_URL="http://localhost:$port" NEXT_PUBLIC_APP_URL="http://localhost:$port"
export PLAYWRIGHT_DIST_DIR=.next-playwright
psql "$STRELVA_LOCAL_DB_URL" -X -Atq -v ON_ERROR_STOP=1 -c 'select version from supabase_migrations.schema_migrations order by version' > "$work/migrations.txt"
pnpm exec next dev --hostname localhost --port "$port" > "$work/app.log" 2>&1 & app_pid=$!
ready=0
for _ in $(seq 1 120); do
  if curl --fail --silent --max-time 5 "$PLAYWRIGHT_BASE_URL/sign-in" > /dev/null; then ready=1; break; fi
  kill -0 "$app_pid" 2>/dev/null || break
  sleep 1
done
[[ "$ready" == 1 ]] || { echo 'Owned app did not start.' >&2; exit 1; }
PLAYWRIGHT_JSON_OUTPUT_FILE="$work/results.json" pnpm exec playwright test tests/content-authority-authenticated-local.spec.ts \
  --workers=1 --retries=0 --reporter=line,json --output="$work/evidence" > "$work/http.log" 2>&1
echo 'Receipt-enabled local content HTTP authority proof passed.'
