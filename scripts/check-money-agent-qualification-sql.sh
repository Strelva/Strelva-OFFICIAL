#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
# Coordinator-controlled disposable SQL window. Applies every ordered migration;
# no production credentials, provider writes or accounting permission are implied.
bash scripts/check-agent-channel-sql.sh \
  tests/agent-payment-attempt-schema.sql \
  tests/money-effect-admission-schema.sql \
  tests/custom-sandbox-runtime-schema.sql \
  tests/sandbox-build-evidence-schema.sql \
  tests/agent-oauth-connection-schema.sql \
  tests/agent-oauth-renewable-schema.sql \
  tests/agent-oauth-renewable-rollback-schema.sql \
  tests/agent-website-tools-schema.sql
