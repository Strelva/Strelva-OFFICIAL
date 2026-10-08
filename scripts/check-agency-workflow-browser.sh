#!/usr/bin/env bash
# Minimum release: real local Auth/Postgres + app routes; fictional source-site
# DNS/HTTP transport only. No app response is mocked and no provider is called.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
[[ ! -e .env.local && ! -e .env ]] || { echo 'Local service credential files must be absent.' >&2; exit 1; }
path_sites=0
bundler=turbopack
while [[ $# -gt 0 ]]; do
  case "$1" in
    --path-sites) path_sites=1; shift ;;
    --bundler)
      [[ $# -ge 2 && ( "$2" == webpack || "$2" == turbopack ) ]] || { echo 'Bundler must be webpack or turbopack.' >&2; exit 2; }
      bundler="$2"; shift 2 ;;
    *) echo "Usage: $0 [--path-sites] [--bundler webpack|turbopack]" >&2; exit 2 ;;
  esac
done
read -r -a supabase_cli <<< "${SUPABASE_CLI:-npx --yes supabase@2.117.0}"
for command_name in docker psql node curl python3 openssl rg redis-server; do command -v "$command_name" >/dev/null || exit 1; done
docker info >/dev/null 2>&1 || { echo 'Docker is unavailable.' >&2; exit 1; }
work="$(mktemp -d "${TMPDIR:-/tmp}/strelva-agency-minimum.XXXXXX")"
chmod 700 "$work"
app_pid="" fixture_pid="" redis_pid=""
cleanup() {
  local status=$?
  trap - EXIT INT TERM
  for pid in "$app_pid" "$fixture_pid" "$redis_pid"; do
    if [[ -n "$pid" ]]; then pkill -TERM -P "$pid" 2>/dev/null || true; kill -TERM "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
  done
  # The preparer records its unique workdir before bootstrap. Recover that
  # owned path even if bootstrap exits before the rest of its env is written.
  if [[ -z "${STRELVA_AUTH_STACK_DIR:-}" && -f "$work/env" ]]; then
    STRELVA_AUTH_STACK_DIR="$(sed -n 's/^STRELVA_AUTH_STACK_DIR=//p' "$work/env")"
  fi
  if [[ -n "${STRELVA_AUTH_STACK_DIR:-}" ]]; then "${supabase_cli[@]}" stop --workdir "$STRELVA_AUTH_STACK_DIR" --no-backup > "$work/stop.log" 2>&1 || true; fi
  echo "Private local logs and screenshots: $work"
  exit "$status"
}
trap cleanup EXIT INT TERM
env -u SUPABASE_ACCESS_TOKEN -u SUPABASE_SERVICE_ROLE_KEY -u NEXT_PUBLIC_SUPABASE_URL -u VERCEL_ENV -u NODE_OPTIONS \
  CI=true STRELVA_LOCAL_AUTH_PROOF=1 RUNNER_TEMP="$work" GITHUB_ENV="$work/env" \
  GITHUB_RUN_ID="agm-$(openssl rand -hex 5)" GITHUB_RUN_ATTEMPT="1" SUPABASE_CLI="${supabase_cli[*]}" \
  bash scripts/prepare-launch-auth-stack.sh > "$work/prepare.log" 2>&1
set -a; source "$work/env"; set +a
export STRELVA_LOCAL_AUTH_PROOF=1 STRELVA_AGENCY_MINIMUM_PROOF=1
# Clear inherited rollout switches, then enable only this website path.
while IFS= read -r flag; do unset "$flag"; done < <(env | sed -n 's/^\(STRELVA_[A-Z0-9_]*\)=.*/\1/p' | rg '(RELEASE|OWNER_ENTRY|MODEL|BOOKING_STORE|INQUIRY_RECORDS|LEADS_|BUSINESS_RECORD_READS)')
export STRELVA_WORKSPACE_RELEASE=1 STRELVA_AGENCY_ADD_CLIENT_RELEASE=1 STRELVA_WEBSITE_REBUILD_RELEASE=1
export REB_DEV_UNGATED_ACCESS=0 SCAFFOLD_DEV_UNGATED_ACCESS=0 CONTENT_SOURCE=postgres TENANTS_SOURCE=postgres DATA_SOURCE=postgres
export EMAIL_SENDING_ENABLED=false CUSTOMER_EMAIL_ENABLED=false OPERATOR_EMAILS_ENABLED=false PROSPECT_EMAILS_ENABLED=false
unset RESEND_API_KEY STRIPE_SECRET_KEY ANTHROPIC_API_KEY OPENAI_API_KEY GOOGLE_CLIENT_SECRET VERCEL_TOKEN SENTRY_AUTH_TOKEN \
  AI_GATEWAY_API_KEY BLOB_READ_WRITE_TOKEN GOOGLE_API_KEY GOOGLE_GENERATIVE_AI_API_KEY GOOGLE_SEARCH_API_KEY PAGESPEED_API_KEY \
  UPSTASH_REDIS_REST_URL UPSTASH_REDIS_REST_TOKEN KV_REST_API_URL KV_REST_API_TOKEN
while IFS= read -r key; do unset "$key"; done < <(env | sed -n 's/^\([A-Z0-9_]*\)=.*/\1/p' | rg '^(OPENAI|ANTHROPIC|RESEND|AI_GATEWAY|BLOB_|GOOGLE|BRAVE|BING|PERPLEXITY|TAVILY|SERP|UPSTASH|KV_|STRIPE|VERCEL|SENTRY)')
export APPROVE_LINK_SECRET="$(openssl rand -hex 32)"
port="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')"
export PLAYWRIGHT_BASE_URL="http://localhost:$port" NEXT_PUBLIC_APP_URL="http://localhost:$port"
unset NEXT_PUBLIC_SITES_PATH_ORIGIN
if [[ "$path_sites" == 1 ]]; then export NEXT_PUBLIC_SITES_PATH_ORIGIN="http://sites.localhost:$port" STRELVA_SITES_PATH_PROOF=1; fi
export PLAYWRIGHT_DIST_DIR=.next-agency-minimum
pnpm exec tsx scripts/journeys-redis.ts "$work/redis.env" > "$work/redis.log" 2>&1 & redis_pid=$!
for _ in $(seq 1 60); do [[ -s "$work/redis.env" ]] && break; kill -0 "$redis_pid" 2>/dev/null || break; sleep 0.5; done
[[ -s "$work/redis.env" ]] || { echo "Owned Redis did not start." >&2; exit 1; }
set -a; source "$work/redis.env"; set +a
cat > "$work/source-site.mjs" <<'JS'
import http from 'node:http';
import { writeFileSync } from 'node:fs';
const html = '<!doctype html><html lang="en"><head><title>Elmwood Bakery</title></head><body><h1>Elmwood Bakery</h1><p>We bake sourdough bread for neighborhood pickup every Saturday.</p></body></html>';
const server = http.createServer((request, response) => {
  const robots = request.url === '/robots.txt';
  response.writeHead(200, { 'content-type': robots ? 'text/plain' : 'text/html' });
  response.end(robots ? 'User-agent: *\nAllow: /\n' : html);
});
server.listen(0, '127.0.0.1', () => writeFileSync(process.argv[2], `http://127.0.0.1:${server.address().port}`));
JS
node "$work/source-site.mjs" "$work/source-origin" > "$work/source-site.log" 2>&1 & fixture_pid=$!
for _ in $(seq 1 30); do [[ -s "$work/source-origin" ]] && break; sleep 0.2; done
export STRELVA_CRAWL_FIXTURE_ORIGIN="$(cat "$work/source-origin")"
cat > "$work/crawl-transport.mjs" <<'JS'
// Disposable transport fixture for exactly one fictional public hostname.
// The crawler still normalizes, checks robots and applies its own limits.
// This does not prove real public DNS/HTTP or weaken production SSRF checks.
import dns from 'node:dns';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
const origin = new URL(process.env.STRELVA_CRAWL_FIXTURE_ORIGIN);
if (process.env.STRELVA_LOCAL_AUTH_PROOF !== '1' || origin.hostname !== '127.0.0.1' || origin.protocol !== 'http:' || !['127.0.0.1','localhost'].includes(new URL(process.env.SUPABASE_URL).hostname)) throw Error('Fixture requires disposable loopback services.');
const fixtureHost = 'elmwood-source.example';
const lookup = dns.promises.lookup.bind(dns.promises);
dns.promises.lookup = async (host, options) => host === fixtureHost ? options?.all ? [{address:'93.184.216.34',family:4}] : {address:'93.184.216.34',family:4} : lookup(host, options);
const request = http.request.bind(http);
http.request = (url, options, callback) => {
  const parsed = url instanceof URL ? url : typeof url === 'string' ? new URL(url) : null;
  if (parsed?.hostname !== fixtureHost) return request(url, options, callback);
  return request(new URL(parsed.pathname + parsed.search, origin), {...options, lookup: undefined}, callback);
};
const realFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  return realFetch(url.hostname === fixtureHost ? new URL(url.pathname + url.search, origin) : input, options);
};
syncBuiltinESMExports();
JS
export NODE_OPTIONS="--import=$work/crawl-transport.mjs"
psql "$STRELVA_LOCAL_DB_URL" -X -Atq -v ON_ERROR_STOP=1 -c 'select count(*) from supabase_migrations.schema_migrations' > "$work/migration-count.txt"
next_dev_args=(--hostname localhost --port "$port")
if [[ "$bundler" == webpack ]]; then next_dev_args+=(--webpack); fi
printf '%s\n' "$bundler" > "$work/bundler.txt"
pnpm exec next --version > "$work/next-version.txt"
pnpm exec next dev "${next_dev_args[@]}" > "$work/app.log" 2>&1 & app_pid=$!
ready=0
for _ in $(seq 1 120); do
  if curl --fail --silent --max-time 5 "$PLAYWRIGHT_BASE_URL/sign-in" > /dev/null; then ready=1; break; fi
  kill -0 "$app_pid" 2>/dev/null || break
  sleep 1
done
[[ "$ready" == 1 ]] || { echo 'Owned app did not start.' >&2; exit 1; }
PLAYWRIGHT_JSON_OUTPUT_FILE="$work/results.json" pnpm exec playwright test tests/agency-workflow-authenticated-local.spec.ts \
  --workers=1 --retries=0 --reporter=line,json --output="$work/screenshots" > "$work/browser.log" 2>&1
echo 'Minimum three-flag agency website browser journey passed.'
