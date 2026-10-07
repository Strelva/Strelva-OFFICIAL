#!/usr/bin/env bash
# The 1.0 signed-in journeys, end to end, on a disposable loopback stack.
#
#   pnpm check:journeys                 # fresh stack, flags-on then flags-off, stack stopped after
#   pnpm check:journeys --keep-stack    # leave the stack up and print how to reuse it
#   pnpm check:journeys --reuse <dir>   # reuse a kept stack (its env file), stop nothing
#   pnpm check:journeys --only on|off   # one phase only
#   pnpm check:journeys -- -g "Approve" # anything after -- goes to Playwright
#
# Local proof only. Needs Docker, psql and npx (the Supabase CLI is pinned to
# 2.117.0 through npx, the version CI installs). Every send stays local: client,
# operator and prospect email are off, so deliveries are recorded as
# suppressed and the specs rebuild the one-tap links with the same signer.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

keep=0 reuse="" only="" extra=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep-stack) keep=1 ;;
    --reuse) reuse="$2"; shift ;;
    --only) only="$2"; shift ;;
    --) shift; extra=("$@"); break ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
[[ -z "$only" || "$only" == on || "$only" == off ]] || { echo '--only takes on or off.' >&2; exit 2; }

# next dev loads .env.local; Redis or Resend keys in it would reach real services.
[[ ! -e .env.local && ! -e .env ]] || { echo 'Move .env.local / .env aside first: next dev would load real service keys.' >&2; exit 1; }
for command_name in docker psql npx node curl python3 openssl; do
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
)
# With every 1.0 flag off: the journeys live clients and owners use today
# (the launch-verification CI set), plus the proof that 1.0 surfaces stay dark.
OFF_SPECS=(
  tests/release-1-0-flags-off-authenticated-local.spec.ts
  tests/launch-business-authenticated-local.spec.ts
  tests/application-use-authenticated-local.spec.ts
  tests/onboarding-authenticated-local.spec.ts
  tests/service-request-authenticated-local.spec.ts
)
ON_FLAGS=(STRELVA_SYSTEMS_RELEASE STRELVA_NEEDS_YOU_RELEASE STRELVA_OWNER_ENTRY STRELVA_BOOKING_STORE_WRITE STRELVA_MAKE_REAL_OWNER_LINK_RELEASE)

if [[ -n "$reuse" ]]; then
  work="$(cd "$reuse" && pwd)"
  [[ -f "$work/env" ]] || { echo "No env file in $work." >&2; exit 1; }
  keep=1
else
  work="$(mktemp -d "${TMPDIR:-/tmp}/strelva-journeys.XXXXXX")"
fi
app_pid=""
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
  if [[ "$keep" == 0 && -n "${STRELVA_AUTH_STACK_DIR:-}" && -f "$STRELVA_AUTH_STACK_DIR/supabase/config.toml" ]]; then
    npx --yes supabase@2.117.0 stop --workdir "$STRELVA_AUTH_STACK_DIR" --no-backup >/dev/null 2>&1 || true
    echo 'Disposable stack stopped.'
  elif [[ "$keep" == 1 ]]; then
    echo "Stack kept. Rerun with: pnpm check:journeys --reuse $work"
    echo "Stop it with: npx --yes supabase@2.117.0 stop --workdir \"\$(sed -n 's/^STRELVA_AUTH_STACK_DIR=//p' $work/env)\" --no-backup"
  fi
  echo "Logs and reports: $work"
  exit "$code"
}
trap cleanup EXIT INT TERM

if [[ -z "$reuse" ]]; then
  # A unique project id, so a parallel checkout's stack is never reused or stopped.
  env -u SUPABASE_ACCESS_TOKEN -u SUPABASE_SERVICE_ROLE_KEY -u NEXT_PUBLIC_SUPABASE_URL -u VERCEL_ENV \
    CI=true STRELVA_LOCAL_AUTH_PROOF=1 RUNNER_TEMP="$work" GITHUB_ENV="$work/env" \
    GITHUB_RUN_ID="journeys-$(date +%s)" GITHUB_RUN_ATTEMPT="$$" SUPABASE_CLI="npx --yes supabase@2.117.0" \
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
  PLAYWRIGHT_DIST_DIR=.next-journeys pnpm exec next dev --hostname localhost --port "$port" > "$work/app-$phase.log" 2>&1 &
  app_pid=$!
  for _ in $(seq 1 120); do
    if curl --fail --silent --max-time 60 "$PLAYWRIGHT_BASE_URL/sign-in" >/dev/null; then return 0; fi
    kill -0 "$app_pid" 2>/dev/null || break
    sleep 2
  done
  echo "The app did not start for the flags-$phase phase. See $work/app-$phase.log" >&2
  return 1
}

run_phase() {
  local phase="$1"; shift
  local specs=("$@")
  echo "== Flags $phase: ${#specs[@]} specs on $PLAYWRIGHT_BASE_URL"
  start_app "$phase"
  local status=0
  PLAYWRIGHT_JSON_OUTPUT_FILE="$work/results-$phase.json" pnpm exec playwright test "${specs[@]}" \
    --workers=1 --retries=0 --reporter=line,json --output="test-results/journeys-$phase" ${extra[@]+"${extra[@]}"} || status=$?
  stop_app
  node scripts/check-launch-browser-results.mjs "$work/results-$phase.json" "journeys-$phase" || status=1
  return "$status"
}

overall=0
if [[ -z "$only" || "$only" == on ]]; then
  for flag in "${ON_FLAGS[@]}"; do export "$flag=1"; done
  # Booking parity is read from the one store; content from Postgres.
  export STRELVA_BOOKING_STORE_READ=postgres CONTENT_SOURCE=postgres
  run_phase on "${ON_SPECS[@]}" || overall=1
fi
if [[ -z "$only" || "$only" == off ]]; then
  for flag in "${ON_FLAGS[@]}"; do unset "$flag"; done
  unset STRELVA_BOOKING_STORE_READ CONTENT_SOURCE
  run_phase off "${OFF_SPECS[@]}" || overall=1
fi
exit "$overall"
