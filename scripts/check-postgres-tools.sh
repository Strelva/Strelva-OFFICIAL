#!/usr/bin/env bash
# Print the qualified directory for GITHUB_PATH. Never start a database here.
# Push and nightly must use the same server/catalog version for source pins.
set -euo pipefail

postgres_bin_dir="${STRELVA_POSTGRES_BIN:-}"
if [[ -z "$postgres_bin_dir" ]]; then
  for candidate in /opt/homebrew/opt/postgresql@18/bin /usr/lib/postgresql/18/bin; do
    if [[ -x "$candidate/initdb" ]]; then
      postgres_bin_dir="$candidate"
      break
    fi
  done
fi
if [[ -z "$postgres_bin_dir" ]]; then
  postgres_bin_dir="$(pg_config --bindir 2>/dev/null || true)"
fi
for command_name in initdb pg_ctl postgres psql; do
  if [[ -z "$postgres_bin_dir" || ! -x "$postgres_bin_dir/$command_name" ]]; then
    printf 'PostgreSQL 18 server tool unavailable: %s\n' "$command_name" >&2
    exit 1
  fi
  version="$("$postgres_bin_dir/$command_name" --version)"
  if [[ ! "$version" =~ PostgreSQL\)?[[:space:]]+18\. ]]; then
    printf 'PostgreSQL 18 required for replay: %s has a different major version.\n' "$command_name" >&2
    exit 1
  fi
done
printf '%s\n' "$postgres_bin_dir"
