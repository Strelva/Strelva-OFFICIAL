#!/usr/bin/env bash
# Disposable CI-only Auth/Postgres environment. Never links to a hosted project.
set -euo pipefail
[[ "${CI:-}" == "true" && "${STRELVA_LOCAL_AUTH_PROOF:-}" == "1" && -n "${RUNNER_TEMP:-}" ]] || { echo 'Only the explicit isolated CI proof may start this stack.' >&2; exit 1; }
[[ -z "${SUPABASE_ACCESS_TOKEN:-}" && -z "${SUPABASE_SERVICE_ROLE_KEY:-}" && -z "${NEXT_PUBLIC_SUPABASE_URL:-}" && "${VERCEL_ENV:-}" != production ]] || { echo 'Refusing inherited provider or hosted database configuration.' >&2; exit 1; }
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
stack="$(mktemp -d "$RUNNER_TEMP/strelva-auth.XXXXXX")"
# Other runner services may already own Supabase's default ports. Select unused
# ports without stopping or attaching to those unrelated services.
read -r api_port db_port shadow_port < <(python3 - <<'PY'
import socket
sockets = [socket.socket() for _ in range(3)]
for item in sockets: item.bind(('0.0.0.0', 0))
print(*(item.getsockname()[1] for item in sockets))
for item in sockets: item.close()
PY
)
mkdir -p "$stack/supabase/migrations"
cp "$root"/supabase/migrations/*.sql "$stack/supabase/migrations/"
cat > "$stack/supabase/config.toml" <<CONFIG
project_id = "strelva-proof-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
[api]
enabled = true
port = $api_port
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000
[db]
port = $db_port
shadow_port = $shadow_port
major_version = 17
health_timeout = "5m"
[db.seed]
enabled = false
[studio]
enabled = false
[local_smtp]
enabled = false
[analytics]
enabled = false
[edge_runtime]
enabled = false
[storage]
enabled = false
[realtime]
enabled = false
[auth]
enabled = true
site_url = "http://127.0.0.1:3100"
additional_redirect_urls = ["http://127.0.0.1:3100/**"]
enable_signup = true
[auth.email]
enable_signup = true
enable_confirmations = false
CONFIG
umask 077
printf 'STRELVA_AUTH_STACK_DIR=%s\n' "$stack" >> "$GITHUB_ENV"
if ! supabase start --workdir "$stack" > "$stack/start.log" 2>&1; then
  grep -E 'ERROR|error|failed|Failed' "$stack/start.log" | sed -E 's/eyJ[A-Za-z0-9_.-]+/[redacted-local-token]/g;s/(sb_(secret|publishable)_)[A-Za-z0-9_-]+/[redacted-local-key]/g' >&2 || true
  echo 'The disposable Auth stack did not become healthy.' >&2
  exit 1
fi
supabase status --workdir "$stack" -o json > "$stack/status.json"
python3 - "$stack/status.json" "$GITHUB_ENV" <<'PY'
import json, sys, urllib.parse
from pathlib import Path
status=json.loads(Path(sys.argv[1]).read_text())
def field(*names):
    for name in names:
        value=status.get(name)
        if isinstance(value,str) and value: return value
    raise SystemExit('Required local Supabase output is unavailable: '+names[0])
url=field('API_URL','api.url')
if urllib.parse.urlparse(url).hostname not in ('127.0.0.1','localhost'):
    raise SystemExit('Refusing a non-loopback Auth stack')
anon=field('ANON_KEY','auth.anon_key')
service=field('SERVICE_ROLE_KEY','auth.service_role_key')
for value in (anon,service): print('::add-mask::'+value)
values={'NEXT_PUBLIC_SUPABASE_URL':url,'SUPABASE_URL':url,
        'NEXT_PUBLIC_SUPABASE_ANON_KEY':anon,'SUPABASE_SERVICE_ROLE_KEY':service,
        'PLAYWRIGHT_BASE_URL':'http://127.0.0.1:3100','NEXT_PUBLIC_APP_URL':'http://127.0.0.1:3100'}
with open(sys.argv[2],'a') as output:
    for name,value in values.items():
        if '\n' in value or '\r' in value: raise SystemExit('Invalid local configuration value')
        output.write(name+'='+value+'\n')
print('Disposable Auth and database configured on loopback. No hosted project was used.')
PY
