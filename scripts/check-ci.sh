#!/usr/bin/env bash
# CI-faithful pre-push gate. Runs the same checks the GitHub Actions `build` job
# enforces, so you can catch a failure locally instead of burning Actions minutes
# to discover it. See docs/testing-and-ci.md.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== lint =="
pnpm lint
echo "== typecheck =="
pnpm typecheck
echo "== ontology invariants =="
pnpm check:ontology
pnpm check:boundaries
echo "== vitest =="
pnpm test

echo "== surface smoke (CI-faithful: dev-file + no Redis) =="
# Seed the synthetic tenant fixture the CI 'Surface smoke' step uses, and blank the
# data sources + Redis so the run matches the runner (Postgres/Upstash from .env
# would otherwise mask CI-only failures). Clean up the seed on exit.
cp tests/fixtures/tenants.fixture.json dev-tenants.json
trap 'rm -f dev-tenants.json' EXIT
DATA_SOURCE=file CONTENT_SOURCE=file TENANTS_SOURCE=file CI=true \
  UPSTASH_REDIS_REST_URL="" UPSTASH_REDIS_REST_TOKEN="" \
  KV_REST_API_URL="" KV_REST_API_TOKEN="" \
  pnpm smoke:surfaces

echo ""
echo "All CI-faithful checks passed. Safe to push."
