#!/usr/bin/env bash
# The 1.0 signed-in journeys, end to end, on a disposable loopback stack.
#
#   pnpm check:journeys                 # fresh stack, flags-on then flags-off, stack stopped after
#   pnpm check:journeys --neutral       # complete #317 neutral matrix only
#   pnpm check:journeys --keep-stack    # leave the stack up and print how to reuse it
#   pnpm check:journeys --reuse <dir>   # reuse a kept stack (its env file), stop nothing
#   pnpm check:journeys --only on|off   # one phase only
#   pnpm check:journeys --bundler webpack # explicit alternate local bundler; default stays Turbopack
#   pnpm check:journeys --with-proposed-fixes  # apply scripts/journeys-proposed-fixes.sql to the disposable DB first
#   pnpm check:journeys -- -g "Approve" # anything after -- goes to Playwright (filters within the phase's specs)
#
# Local proof only. Needs Docker, psql, redis-server and npx (the Supabase CLI
# is pinned to 2.117.0 through npx, the version CI installs). Every send stays
# local: client, operator and prospect email are off, so deliveries are
# recorded as suppressed and the specs rebuild the one-tap links with the same
# signer.
#
# Flags on runs the way production does: Postgres sources and a Redis beside
# them (a disposable loopback redis-server, scripts/journeys-redis.ts). Flags
# off runs the way CI's launch verification does: no Redis, default sources.
# One compound command: bash parses it all before running, so editing this
# file mid-run cannot change a run in progress.
{
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

keep=0 reuse="" only="" fixes=0 neutral=0 bundler=turbopack extra=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --neutral) neutral=1 ;;
    --keep-stack) keep=1 ;;
    --reuse) reuse="$2"; shift ;;
    --only) only="$2"; shift ;;
    --bundler)
      [[ $# -ge 2 && "$2" != --* ]] || { echo '--bundler takes turbopack or webpack.' >&2; exit 2; }
      bundler="$2"; shift ;;
    --with-proposed-fixes) fixes=1 ;;
    --) shift; extra=("$@"); break ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
[[ -z "$only" || "$only" == on || "$only" == off ]] || { echo '--only takes on or off.' >&2; exit 2; }
[[ "$bundler" == turbopack || "$bundler" == webpack ]] || { echo '--bundler takes turbopack or webpack.' >&2; exit 2; }
# Leave the default command untouched; Webpack is an explicit proof scope.
bundler_args=()
[[ "$bundler" != webpack ]] || bundler_args=(--webpack)

# next dev loads .env.local; Redis or Resend keys in it would reach real services.
[[ ! -e .env.local && ! -e .env ]] || { echo 'Move .env.local / .env aside first: next dev would load real service keys.' >&2; exit 1; }
for command_name in docker psql redis-server npx node curl python3 openssl; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "Required command is unavailable: $command_name" >&2; exit 1; }
done
docker info >/dev/null 2>&1 || { echo 'Docker is not running.' >&2; exit 1; }

# The 1.0 journeys. Each needs the 1.0 flags on the app server and the runner.
ON_SPECS=(
  tests/owner-journey-1-0-authenticated-local.spec.ts
  tests/operator-queue-authenticated-local.spec.ts
  tests/make-real-authenticated-local.spec.ts
  tests/booking-approval-authenticated-local.spec.ts
  tests/email-only-owner-authenticated-local.spec.ts
  tests/versions-authenticated-local.spec.ts
  tests/inquiries-1-0-authenticated-local.spec.ts
  tests/agency-neutral-authenticated-local.spec.ts
)
# With every 1.0 flag off: the journeys live clients and owners use today
# (the launch-verification CI set), plus the proof that 1.0 surfaces stay dark.
OFF_SPECS=(
  tests/release-1-0-flags-off-authenticated-local.spec.ts
  tests/launch-business-authenticated-local.spec.ts
  tests/application-use-authenticated-local.spec.ts
  tests/onboarding-authenticated-local.spec.ts
  tests/service-request-authenticated-local.spec.ts
  tests/agency-neutral-authenticated-local.spec.ts
)
ON_FLAGS=(STRELVA_SYSTEMS_RELEASE STRELVA_NEEDS_YOU_RELEASE STRELVA_OWNER_ENTRY STRELVA_BOOKING_STORE_WRITE STRELVA_MAKE_REAL_OWNER_LINK_RELEASE STRELVA_INQUIRY_RECORDS STRELVA_AGENCY_ADD_CLIENT_RELEASE STRELVA_WEBSITE_REBUILD_RELEASE)
# Production's data sources, and the 1.0 read and authority switches for the
# two client stores (bookings and leads). Read switches take effect only after
# seven clean parity days (seed_parity).
ON_SOURCES=(CONTENT_SOURCE=postgres TENANTS_SOURCE=postgres DATA_SOURCE=postgres STRELVA_BOOKING_STORE_READ=postgres STRELVA_LEADS_READ=postgres STRELVA_LEADS_AUTHORITY=postgres)

if [[ "$neutral" == 1 ]]; then
  ON_SPECS=(tests/agency-neutral-authenticated-local.spec.ts)
  OFF_SPECS=(tests/agency-neutral-authenticated-local.spec.ts)
fi

if [[ -n "$reuse" ]]; then
  work="$(cd "$reuse" && pwd)"
  [[ -f "$work/env" ]] || { echo "No env file in $work." >&2; exit 1; }
  keep=1
else
  work="$(mktemp -d "${TMPDIR:-/tmp}/strelva-journeys.XXXXXX")"
fi
read -r -a supabase_cli <<< "${SUPABASE_CLI:-npx --yes supabase@2.117.0}"
app_pid="" redis_pid=""
stop_redis() {
  if [[ -n "$redis_pid" ]]; then
    kill -TERM "$redis_pid" 2>/dev/null || true
    wait "$redis_pid" 2>/dev/null || true
    redis_pid=""
  fi
  unset UPSTASH_REDIS_REST_URL UPSTASH_REDIS_REST_TOKEN
}
start_redis() {
  rm -f "$work/redis.env"
  pnpm exec tsx scripts/journeys-redis.ts "$work/redis.env" > "$work/redis.log" 2>&1 &
  redis_pid=$!
  for _ in $(seq 1 60); do
    [[ -s "$work/redis.env" ]] && break
    kill -0 "$redis_pid" 2>/dev/null || break
    sleep 0.5
  done
  [[ -s "$work/redis.env" ]] || { echo "The loopback Redis did not start. See $work/redis.log" >&2; return 1; }
  set -a; source "$work/redis.env"; set +a
  [[ "$UPSTASH_REDIS_REST_URL" == http://127.0.0.1:* ]] || { echo 'The Redis bridge is not on loopback.' >&2; return 1; }
}
stop_app() {
  if [[ -n "$app_pid" ]]; then
    pkill -TERM -P "$app_pid" 2>/dev/null || true
    kill "$app_pid" 2>/dev/null || true
    wait "$app_pid" 2>/dev/null || true
    app_pid=""
  fi
}
cleanup() {
  local code=$?
  trap - EXIT INT TERM
  stop_app
  stop_redis
  if [[ "$keep" == 0 && -n "${STRELVA_AUTH_STACK_DIR:-}" && -f "$STRELVA_AUTH_STACK_DIR/supabase/config.toml" ]]; then
    "${supabase_cli[@]}" stop --workdir "$STRELVA_AUTH_STACK_DIR" --no-backup >/dev/null 2>&1 || true
    echo 'Disposable stack stopped.'
  elif [[ "$keep" == 1 ]]; then
    echo "Stack kept. Rerun with: pnpm check:journeys --bundler $bundler --reuse $work"
    echo "Stop it with: ${supabase_cli[*]} stop --workdir \"\$(sed -n 's/^STRELVA_AUTH_STACK_DIR=//p' $work/env)\" --no-backup"
  fi
  echo "Logs and reports: $work"
  exit "$code"
}
trap cleanup EXIT INT TERM

if [[ -z "$reuse" ]]; then
  # A unique project id, so a parallel checkout's stack is never reused or stopped.
  env -u SUPABASE_ACCESS_TOKEN -u SUPABASE_SERVICE_ROLE_KEY -u NEXT_PUBLIC_SUPABASE_URL -u VERCEL_ENV \
    CI=true STRELVA_LOCAL_AUTH_PROOF=1 RUNNER_TEMP="$work" GITHUB_ENV="$work/env" \
    GITHUB_RUN_ID="journeys-$(date +%s)" GITHUB_RUN_ATTEMPT="$$" SUPABASE_CLI="${SUPABASE_CLI:-npx --yes supabase@2.117.0}" \
    bash scripts/prepare-launch-auth-stack.sh
fi
set -a; source "$work/env"; set +a

port="${JOURNEYS_PORT:-$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')}"
# Next normalizes loopback request URLs to localhost; browser and server share that origin.
export PLAYWRIGHT_BASE_URL="http://localhost:$port" NEXT_PUBLIC_APP_URL="http://localhost:$port"
export STRELVA_LOCAL_AUTH_PROOF=1 STRELVA_WORKSPACE_RELEASE=1 STRELVA_APPLICATION_USE_JOURNEY=1
export REB_DEV_UNGATED_ACCESS=0 SCAFFOLD_DEV_UNGATED_ACCESS=0
export EMAIL_SENDING_ENABLED=false CUSTOMER_EMAIL_ENABLED=false OPERATOR_EMAILS_ENABLED=false PROSPECT_EMAILS_ENABLED=false
unset UPSTASH_REDIS_REST_URL UPSTASH_REDIS_REST_TOKEN KV_REST_API_URL KV_REST_API_TOKEN RESEND_API_KEY STRIPE_SECRET_KEY \
  ANTHROPIC_API_KEY OPENAI_API_KEY GOOGLE_CLIENT_SECRET VERCEL_TOKEN SENTRY_AUTH_TOKEN 2>/dev/null || true
export APPROVE_LINK_SECRET="${APPROVE_LINK_SECRET:-$(openssl rand -hex 32)}" CRON_SECRET="${CRON_SECRET:-$(openssl rand -hex 32)}"

start_app() {
  local phase="$1"
  # Own build dir: a developer's next dev in this checkout keeps its .next.
  PLAYWRIGHT_DIST_DIR=.next-journeys pnpm exec next dev ${bundler_args[@]+"${bundler_args[@]}"} --hostname localhost --port "$port" > "$work/app-$phase.log" 2>&1 &
  app_pid=$!
  for _ in $(seq 1 120); do
    if curl --fail --silent --max-time 60 "$PLAYWRIGHT_BASE_URL/sign-in" >/dev/null; then return 0; fi
    kill -0 "$app_pid" 2>/dev/null || break
    sleep 2
  done
  echo "The app did not start for the flags-$phase phase. See $work/app-$phase.log" >&2
  # next dev allows one server per build dir; a leftover journeys server holds the lock.
  grep -A3 'Another next dev server is already running' "$work/app-$phase.log" >&2 || true
  stop_app
  return 1
}

run_phase() {
  local phase="$1"; shift
  local specs=("$@")
  echo "== Flags $phase: ${#specs[@]} specs on $PLAYWRIGHT_BASE_URL (bundler: $bundler)"
  # No app, no run: specs against a dead port would only report connection errors.
  start_app "$phase" || return 1
  local status=0
  PLAYWRIGHT_JSON_OUTPUT_FILE="$work/results-$phase.json" pnpm exec playwright test "${specs[@]}" \
    --workers=1 --retries=0 --reporter=line,json --output="test-results/journeys-$phase" ${extra[@]+"${extra[@]}"} || status=$?
  stop_app
  local profile="journeys-$phase"
  [[ "$neutral" == 0 ]] || profile="neutral-$phase"
  node scripts/check-launch-browser-results.mjs "$work/results-$phase.json" "$profile" || status=1
  return "$status"
}

# The flags-on world is the one after the bookings move: seven clean parity days.
# Current cutover checks every tenant. All these backdated rows are synthetic
# disposable preconditions, not evidence of observed seven-day parity.
seed_parity() {
  # The same owned Auth/runtime and exact native fixture provenance guard runs
  # before any backdated coverage. Unrelated tenants remain a hard failure.
  pnpm exec tsx scripts/seed-journey-parity.ts
}

overall=0
[[ "$(python3 -c 'import sys,urllib.parse;print(urllib.parse.urlparse(sys.argv[1]).hostname)' "$STRELVA_LOCAL_DB_URL")" == 127.0.0.1 ]] \
  || { echo 'STRELVA_LOCAL_DB_URL is not the loopback stack.' >&2; exit 1; }
if [[ "$fixes" == 1 ]]; then
  # Fixes proposed to the owning streams, applied to this disposable database
  # only, to prove what the journeys do once they land. Never a migration.
  echo '== Applying proposed fixes to the disposable database (not a migration)'
  psql "$STRELVA_LOCAL_DB_URL" -X -q -v ON_ERROR_STOP=1 -f scripts/journeys-proposed-fixes.sql
fi
# Every reader the app calls through supabase-js must run in PostgREST's read-only transaction.
echo '== Read-only RPCs'
node scripts/check-readonly-rpcs.mjs "$STRELVA_LOCAL_DB_URL" || overall=1
if [[ -z "$only" || "$only" == on ]]; then
  for flag in "${ON_FLAGS[@]}"; do export "$flag=1"; done
  for pair in "${ON_SOURCES[@]}"; do export "$pair"; done
  seed_parity
  if start_redis; then
    run_phase on "${ON_SPECS[@]}" || overall=1
  else
    overall=1
  fi
  stop_redis
fi
if [[ -z "$only" || "$only" == off ]]; then
  for flag in "${ON_FLAGS[@]}"; do unset "$flag"; done
  for pair in "${ON_SOURCES[@]}"; do unset "${pair%%=*}"; done
  run_phase off "${OFF_SPECS[@]}" || overall=1
fi
exit "$overall"
}
