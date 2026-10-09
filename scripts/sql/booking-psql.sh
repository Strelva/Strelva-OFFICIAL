#!/usr/bin/env bash
# The same transport for observation, actions, background clients and cleanup.
# No caller libpq setting can redirect or configure a verified connection.
set -euo pipefail
for booking_pg_name in "${!PG@}"; do unset "$booking_pg_name"; done
unset booking_pg_name
export LC_ALL=C
export PGCONNECT_TIMEOUT=3
export PGOPTIONS='-c statement_timeout=3000 -c lock_timeout=1000'
exec psql "$@"
