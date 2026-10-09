#!/usr/bin/env bash
# No ambient stores or providers: suite owns loopback HTTP + socket-only Redis.
set -euo pipefail
command -v redis-server >/dev/null || { echo 'redis-server is required for this local check.' >&2; exit 1; }
STRELVA_PUBLIC_ABUSE_REDIS=1 STRELVA_LOCAL_TEST_WORKERS=1 pnpm exec vitest run src/__tests__/public-endpoint-abuse.test.ts "$@"
