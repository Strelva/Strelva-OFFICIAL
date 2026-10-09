#!/usr/bin/env bash
# Closed local profiles; #317 stays check-journeys.sh. Provider actions are held.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
profile=full-dark reuse="" keep=0 bundler=webpack list=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile|--reuse|--bundler)
      [[ $# -ge 2 && "$2" != --* ]] || { echo "$1 requires a value." >&2; exit 2; }
      case "$1" in --profile) profile="$2";; --reuse) reuse="$2";; --bundler) bundler="$2";; esac
      shift ;;
    --keep-stack) keep=1;; --list) list=1;;
    *) echo "Unknown option: $1" >&2; exit 2;;
  esac
  shift
done
[[ "$bundler" == webpack || "$bundler" == turbopack ]] || { echo 'Choose webpack or turbopack.' >&2; exit 2; }
manifest="$root/scripts/full-model-journey-profile.mjs"
if [[ "$list" == 1 ]]; then node "$manifest" manifest "$profile"; exit; fi
# Missing required specs and held qualification fail before a stack is touched.
node "$manifest" preflight "$profile" "$root"
if [[ "$profile" == full-native ]]; then node scripts/tenant-cleanup-journey-window.mjs preflight "$root"; fi
for file in .env .env.local .env.development .env.development.local; do
  [[ ! -e "$file" ]] || { echo "Remove $file from this prepared proof checkout first." >&2; exit 1; }
done
for command_name in docker psql pg_dump redis-server npx node curl python3 openssl pnpm; do
  command -v "$command_name" >/dev/null || { echo "Required command unavailable: $command_name" >&2; exit 1; }
done
docker info >/dev/null 2>&1 || { echo 'Docker is not running.' >&2; exit 1; }
umask 077
base_env=("PATH=$PATH" "HOME=$HOME" "USER=${USER:-}" "LOGNAME=${LOGNAME:-}" "TMPDIR=${TMPDIR:-/tmp}" "LC_ALL=C")
work="$(mktemp -d "${TMPDIR:-/tmp}/strelva-full-journeys.XXXXXX")"
cli=(npx --yes supabase@2.117.0)
owned_stack="" app_pid="" redis_pid="" runtime_env="$work/runtime.env"
stop_app() {
  if [[ -n "$app_pid" ]]; then
    pkill -TERM -P "$app_pid" 2>/dev/null || true
    kill -TERM "$app_pid" 2>/dev/null || true
    wait "$app_pid" 2>/dev/null || true
    app_pid=""
  fi
}
stop_redis() {
  if [[ -n "$redis_pid" ]]; then
    kill -TERM "$redis_pid" 2>/dev/null || true
    wait "$redis_pid" 2>/dev/null || true
    redis_pid=""
  fi
}
cleanup() {
  local status=$?
  trap - EXIT INT TERM
  stop_app; stop_redis
  # prepare-launch-auth-stack writes its owned path before starting services.
  # Recover that path if setup failed before the complete env could be parsed.
  if [[ -z "$owned_stack" && -z "$reuse" && -f "$work/env" ]]; then
    local attempted
    attempted="$(sed -n 's/^STRELVA_AUTH_STACK_DIR=//p' "$work/env")"
    if [[ "$attempted" == "$work"/strelva-auth.* && -f "$attempted/supabase/config.toml" ]]; then owned_stack="$attempted"; fi
  fi
  if [[ -n "$owned_stack" && "$keep" == 0 ]]; then
    env -i "${base_env[@]}" "${cli[@]}" stop --workdir "$owned_stack" --no-backup >/dev/null 2>&1 || true
  fi
  echo "Retained manifests, source and results: $work"
  if [[ "$keep" == 1 || -n "$reuse" ]]; then
    echo "Reuse: bash scripts/check-full-model-journeys.sh --profile $profile --bundler $bundler --reuse $work"
  fi
  exit "$status"
}
trap cleanup EXIT INT TERM
if [[ -n "$reuse" ]]; then
  reuse="$(cd "$reuse" && pwd)"
  [[ -f "$reuse/env" ]] || { echo 'Reuse needs the directory containing the owned env file.' >&2; exit 1; }
  cp "$reuse/env" "$work/env"
else
  env -i "${base_env[@]}" CI=true STRELVA_LOCAL_AUTH_PROOF=1 RUNNER_TEMP="$work" GITHUB_ENV="$work/env" \
    GITHUB_RUN_ID="full-journeys-$(date +%s)-$$" GITHUB_RUN_ATTEMPT=1 SUPABASE_CLI='npx --yes supabase@2.117.0' \
    bash scripts/prepare-launch-auth-stack.sh > "$work/stack.log" 2>&1
fi
# Allowlisted, loopback values are quoted before use. A reused env is not code.
node "$manifest" stack-env "$profile" "$work/env" > "$work/stack.env"
if [[ -z "$reuse" ]]; then
  owned_stack="$(node -e 'const fs=require("fs"); const line=fs.readFileSync(process.argv[1],"utf8").split("\n").find(x=>x.startsWith("STRELVA_AUTH_STACK_DIR=")); process.stdout.write(line.slice(line.indexOf("=")+1))' "$work/env")"
fi
# A bootstrap baseline is mandatory even for loopback reuse. Never mint it here.
env -i "${base_env[@]}" node "$root/scripts/full-model-stack-qualification.mjs" verify "$root" "$work/env" > "$work/stack-qualification.json"
port="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')"
origin="http://localhost:$port"
run_clean() {
  env -i "${base_env[@]}" bash -c 'set -a; source "$1"; set +a; shift; exec "$@"' bash "$runtime_env" "$@"
}
node "$manifest" source "$profile" "$root" > "$work/source.json"
node "$manifest" schema "$profile" "$root/supabase/migrations" > "$work/schema.json"
printf "export PLAYWRIGHT_BASE_URL='%s'\nexport NEXT_PUBLIC_APP_URL='%s'\nexport PLAYWRIGHT_DIST_DIR='.next-full-model-journeys'\nexport STRELVA_BUILD_CACHE='off'\nexport APPROVE_LINK_SECRET='%s'\nexport CRON_SECRET='%s'\nexport SECRETS_ENC_KEY='%s'\nexport PUBLIC_CONTINUATION_SECRET='%s'\n" \
  "$origin" "$origin" "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" > "$work/local.env"
bundler_args=(); [[ "$bundler" != webpack ]] || bundler_args=(--webpack)
variants=(additive-off)
[[ "$profile" != full-native ]] || variants=(native)
[[ "$profile" != full-dark ]] || variants+=(master-off)
for variant in "${variants[@]}"; do
  variant_arg=(); [[ "$variant" != master-off ]] || variant_arg=(master-off)
  node "$manifest" manifest "$profile" ignored ${variant_arg[@]+"${variant_arg[@]}"} > "$work/manifest-$variant.json"
  node "$manifest" env "$profile" ignored ${variant_arg[@]+"${variant_arg[@]}"} > "$work/profile.env"
  cat "$work/stack.env" "$work/profile.env" "$work/local.env" > "$runtime_env"
  if [[ "$profile" == full-native ]]; then
    run_clean pnpm exec tsx scripts/seed-journey-parity.ts > "$work/parity.log" 2>&1
    run_clean pnpm exec tsx scripts/journeys-redis.ts "$work/redis.env" > "$work/redis.log" 2>&1 & redis_pid=$!
    for _ in $(seq 1 60); do [[ ! -s "$work/redis.env" ]] || break; kill -0 "$redis_pid" 2>/dev/null || break; sleep 0.5; done
    [[ -s "$work/redis.env" ]] || { echo 'Owned loopback Redis did not start.' >&2; exit 1; }
    cat "$work/redis.env" >> "$runtime_env"
  fi
  run_clean pnpm exec next dev ${bundler_args[@]+"${bundler_args[@]}"} --hostname localhost --port "$port" > "$work/app-$variant.log" 2>&1 & app_pid=$!
  ready=0
  for _ in $(seq 1 90); do
    if curl --fail --silent --max-time 5 "$origin/sign-in" >/dev/null; then ready=1; break; fi
    kill -0 "$app_pid" 2>/dev/null || break
    sleep 2
  done
  [[ "$ready" == 1 ]] || { echo "App did not start; see $work/app-$variant.log" >&2; exit 1; }
  if [[ "$profile" == full-native ]]; then
    run_clean pnpm exec tsx scripts/seed-local-package-reviewer.ts "$work" > "$work/package-reviewer-setup.log" 2>&1
  fi
  specs=()
  while IFS= read -r file; do specs+=("$file"); done < <(node "$manifest" specs "$profile")
  status=0
  if [[ "$profile" == full-native ]]; then
    run_clean bash -c 'set -a; source "$1"; set +a; shift; exec "$@"' bash "$work/package-reviewer-test.env" \
      env PLAYWRIGHT_JSON_OUTPUT_FILE="$work/results-$variant.json" pnpm exec playwright test "${specs[@]}" \
      --workers=1 --retries=0 --reporter=line,json --output="test-results/full-model-$variant" > "$work/browser-$variant.log" 2>&1 || status=$?
  else
    run_clean env PLAYWRIGHT_JSON_OUTPUT_FILE="$work/results-$variant.json" pnpm exec playwright test "${specs[@]}" \
      --workers=1 --retries=0 --reporter=line,json --output="test-results/full-model-$variant" > "$work/browser-$variant.log" 2>&1 || status=$?
  fi
  node "$manifest" validate "$profile" "$work/results-$variant.json" ${variant_arg[@]+"${variant_arg[@]}"} > "$work/receipt-$variant.json" || status=1
  # Independent closed recovery evidence never changes a failed native status.
  # Keep the original 34-case contract and this owned app/Redis alive.
  if [[ "$profile" == full-native ]]; then
    run_clean node scripts/tenant-cleanup-journey-window.mjs run "$root" "$work" > "$work/cleanup-window.log" 2>&1 || status=1
  fi
  stop_app; stop_redis
  [[ "$status" == 0 ]] || { echo "Closed $profile/$variant failed; see retained reports." >&2; exit 1; }
done
env -i "${base_env[@]}" node "$root/scripts/full-model-stack-qualification.mjs" verify "$root" "$work/env" > "$work/stack-qualification-end.json"
node "$manifest" source "$profile" "$root" > "$work/source-end.json"
cmp -s "$work/source.json" "$work/source-end.json" || { echo 'Source changed during proof; no profile qualification is retained.' >&2; exit 1; }
echo "Local $profile passed. All eight release requirements, provider/client qualification and production remain separate."
