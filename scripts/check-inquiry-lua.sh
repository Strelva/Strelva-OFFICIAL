#!/usr/bin/env bash
# Run the inquiry delivery store contract against the real Lua scripts.
#
# Starts a throwaway redis-server on a private unix socket (no TCP port, no
# persistence), points the contract test at it, and removes everything when
# it exits. It never connects to a shared or production Redis.
set -euo pipefail

if ! command -v redis-server >/dev/null 2>&1; then
  echo "redis-server is not installed; install it (brew install redis) to run this check." >&2
  exit 1
fi

workdir="$(mktemp -d "${TMPDIR:-/tmp}/inquiry-lua.XXXXXX")"
socket="$workdir/redis.sock"
redis_pid=""

cleanup() {
  if [[ -n "$redis_pid" ]]; then
    kill "$redis_pid" >/dev/null 2>&1 || true
    wait "$redis_pid" 2>/dev/null || true
  fi
  rm -rf "$workdir"
}
trap cleanup EXIT

redis-server \
  --port 0 \
  --unixsocket "$socket" \
  --unixsocketperm 700 \
  --save "" \
  --appendonly no \
  --dir "$workdir" \
  --logfile "$workdir/redis.log" &
redis_pid=$!

for _ in $(seq 1 50); do
  [[ -S "$socket" ]] && break
  sleep 0.1
done
if [[ ! -S "$socket" ]]; then
  echo "redis-server did not start:" >&2
  cat "$workdir/redis.log" >&2 || true
  exit 1
fi

echo "Running inquiry delivery store contract against $(redis-server --version | awk '{print $3}' | sed 's/^v=//')"
INQUIRY_LUA_REDIS_SOCKET="$socket" pnpm exec vitest run src/__tests__/inquiry-delivery-store-contract.test.ts
