#!/usr/bin/env bash
# Dedicated fresh seven-case supplemental Auth proof. Primary 34+2+2 is separate.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
profile=full-native keep=0 bundler=webpack list=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --bundler)
      [[ $# -ge 2 && "$2" != --* ]] || { echo "$1 requires a value." >&2; exit 2; }
      bundler="$2"
      shift ;;
    --keep-stack) keep=1;; --list) list=1;;
    *) echo "Unknown option: $1" >&2; exit 2;;
  esac
  shift
done
[[ "$bundler" == webpack || "$bundler" == turbopack ]] || { echo 'Choose webpack or turbopack.' >&2; exit 2; }
base_env=("PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" "HOME=$HOME" "USER=${USER:-}" "LOGNAME=${LOGNAME:-}" "TMPDIR=${TMPDIR:-/tmp}" "LC_ALL=C")
manifest="$root/scripts/full-model-journey-profile.mjs"
if [[ "$list" == 1 ]]; then env -i "${base_env[@]}" node scripts/private-authority-journey-window.mjs manifest; exit; fi
# New isolated window preflight; never dispatch the primary windows here.
env -i "${base_env[@]}" node scripts/private-authority-journey-window.mjs preflight "$root"
env -i "${base_env[@]}" node --test scripts/private-authority-journey-window.test.mjs
for proof in scripts/check-private-installed-version-authority.py scripts/check-private-producer-inverse-race.py tests/support/private-authority-fixtures.ts; do
  [[ -f "$proof" ]] || { echo "Approved producer/harness missing: $proof" >&2; exit 1; }
done
for file in .env .env.local .env.development .env.development.local; do
  [[ ! -e "$file" ]] || { echo "Remove $file from this prepared proof checkout first." >&2; exit 1; }
done
for command_name in docker psql pg_dump redis-server npx node curl python3 openssl pnpm; do
  command -v "$command_name" >/dev/null || { echo "Required command unavailable: $command_name" >&2; exit 1; }
done
docker info >/dev/null 2>&1 || { echo 'Docker is not running.' >&2; exit 1; }
umask 077
work="$(mktemp -d "${TMPDIR:-/tmp}/strelva-full-journeys.XXXXXX")"
work="$(cd "$work" && pwd -P)"
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
  if [[ -z "$owned_stack" && -f "$work/env" ]]; then
    local attempted
    attempted="$(sed -n 's/^STRELVA_AUTH_STACK_DIR=//p' "$work/env")"
    if [[ "$attempted" == "$work"/strelva-auth.* && -f "$attempted/supabase/config.toml" ]]; then owned_stack="$attempted"; fi
  fi
  if [[ -n "$owned_stack" && "$keep" == 0 ]]; then
    env -i "${base_env[@]}" "${cli[@]}" stop --workdir "$owned_stack" --no-backup >/dev/null 2>&1 || true
  fi
  echo "Retained manifests, source and results: $work"
  if [[ "$keep" == 1 ]]; then
    echo "Owned fresh stack retained at $owned_stack. This runner never reuses stacks."
  fi
  exit "$status"
}
trap cleanup EXIT INT TERM
env -i "${base_env[@]}" CI=true STRELVA_LOCAL_AUTH_PROOF=1 RUNNER_TEMP="$work" GITHUB_ENV="$work/env" \
  GITHUB_RUN_ID="private-authority-$(date +%s)-$$" GITHUB_RUN_ATTEMPT=1 SUPABASE_CLI='npx --yes supabase@2.117.0' \
  bash scripts/prepare-launch-auth-stack.sh > "$work/stack.log" 2>&1
# Allowlisted owned loopback values are quoted before use.
env -i "${base_env[@]}" node "$manifest" stack-env "$profile" "$work/env" > "$work/stack.env"
owned_stack="$(env -i "${base_env[@]}" node -e 'const fs=require("fs"); const line=fs.readFileSync(process.argv[1],"utf8").split("\n").find(x=>x.startsWith("STRELVA_AUTH_STACK_DIR=")); process.stdout.write(line.slice(line.indexOf("=")+1))' "$work/env")"
# The actual fresh bootstrap baseline is mandatory; never mint it here.
env -i "${base_env[@]}" node "$root/scripts/full-model-stack-qualification.mjs" verify "$root" "$work/env" > "$work/stack-qualification.json"
port="$(env -i "${base_env[@]}" python3 -I -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')"
origin="http://localhost:$port"
run_clean() {
  env -i "${base_env[@]}" bash -c 'set -a; source "$1"; set +a; shift; exec "$@"' bash "$runtime_env" "$@"
}
env -i "${base_env[@]}" node "$manifest" source "$profile" "$root" > "$work/source.json"
env -i "${base_env[@]}" node "$manifest" schema "$profile" "$root/supabase/migrations" > "$work/schema.json"
printf "export PLAYWRIGHT_BASE_URL='%s'\nexport NEXT_PUBLIC_APP_URL='%s'\nexport PLAYWRIGHT_DIST_DIR='.next-private-authority-journeys'\nexport STRELVA_BUILD_CACHE='off'\nexport APPROVE_LINK_SECRET='%s'\nexport CRON_SECRET='%s'\nexport SECRETS_ENC_KEY='%s'\nexport PUBLIC_CONTINUATION_SECRET='%s'\n" \
  "$origin" "$origin" "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" > "$work/local.env"
bundler_args=(); [[ "$bundler" != webpack ]] || bundler_args=(--webpack)
variant=native
env -i "${base_env[@]}" node "$manifest" manifest "$profile" > "$work/manifest-native.json"
  env -i "${base_env[@]}" node "$manifest" env "$profile" > "$work/profile.env"
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
# The app and Redis remain alive through before/after qualification.
run_clean bash -c 'set -a; source "$1"; set +a; shift; exec "$@"' bash "$work/package-reviewer-test.env" \
  env STRELVA_PRIVATE_AUTHORITY_FRESH_PATH="$work" \
  node scripts/private-authority-journey-window.mjs run "$root" "$work" > "$work/private-authority-window.log" 2>&1
stop_app; stop_redis
echo 'Local supplemental private authority passed seven exact cases. Primary 34+cleanup2+no-login2 and production qualification remain separate.'
