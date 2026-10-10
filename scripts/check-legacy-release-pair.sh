#!/usr/bin/env bash
# Exact old/candidate source, one disposable local Auth/Postgres/Redis stack.
# The environment file must be supplied by the owner of that disposable stack.
# Usage: bash scripts/check-legacy-release-pair.sh --stack-env /private/tmp/.../env \
#   --workspace-release 0|1 [--candidate <full commit>] [--keep]
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Drop every inherited provider setting before the controller or apps start.
exec env -i PATH="$PATH" HOME="$HOME" TMPDIR="${TMPDIR:-/tmp}" \
  node "$root/scripts/legacy-release-pair.mjs" "$@"
