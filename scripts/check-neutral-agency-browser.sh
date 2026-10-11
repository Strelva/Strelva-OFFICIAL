#!/usr/bin/env bash
# Exact neutral-platform fixture under the owning flags-on/off runner.
# Actual local Auth/Postgres/Redis; no mail, billing or provider writes.
set -euo pipefail
exec bash "$(dirname "${BASH_SOURCE[0]}")/check-journeys.sh" --neutral "$@"
