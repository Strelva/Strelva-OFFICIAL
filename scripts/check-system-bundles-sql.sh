#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
./node_modules/.bin/tsx scripts/system-bundle-native-fixture.ts /tmp/bundle-native-input.sql
bash scripts/check-creator-apps-sql.sh tests/system-bundles-schema.sql tests/function-exposure-schema.sql tests/system-bundles-rollback-schema.sql
