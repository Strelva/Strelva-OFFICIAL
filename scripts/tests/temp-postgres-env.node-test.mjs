import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('temporary PostgreSQL scrubs inherited libpq routing and credentials before commands', () => {
  const helper = fileURLToPath(new URL('../temp-postgres.sh', import.meta.url));
  const result = spawnSync('bash', ['-c', 'set -euo pipefail; source "$1"; test -z "${PGHOSTADDR+x}${PGHOST+x}${PGSERVICE+x}${PGOPTIONS+x}${PGPASSWORD+x}${PGCUSTOM_SETTING+x}"; export PGOPTIONS="-c lock_timeout=150ms"; test "$PGOPTIONS" = "-c lock_timeout=150ms"', 'proof', helper], {
    encoding: 'utf8', env: { ...process.env, PGHOSTADDR: '203.0.113.77', PGHOST: 'remote.invalid', PGSERVICE: 'remote', PGOPTIONS: '-c transaction_read_only=on', PGPASSWORD: 'fictional', PGCUSTOM_SETTING: 'future-setting' },
  });
  assert.equal(result.status, 0, result.stderr);
});
