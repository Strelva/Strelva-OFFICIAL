#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Local implementation gate, never a production activation or migration command.
pnpm typecheck
pnpm check:boundaries
pnpm check:ontology
pnpm exec vitest run \
  src/__tests__/workspace-routes.test.ts \
  src/__tests__/workspace-presentation.test.ts \
  src/__tests__/workspaces-foundation.test.ts \
  src/__tests__/product-catalog.test.ts \
  src/__tests__/product-boundaries.test.ts \
  src/__tests__/ai-visibility.test.ts \
  src/__tests__/pinned-public-text.test.ts \
  src/__tests__/ai-visibility-results.test.ts \
  src/__tests__/ai-visibility-routes.test.ts \
  --maxWorkers=2
pnpm check:workspace-sql
printf 'Local release-one checks passed. Production activation and browser acceptance are separate gates.\n'
