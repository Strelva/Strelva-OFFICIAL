import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const source = readFileSync(new URL('./check-full-model-journeys.sh', import.meta.url), 'utf8');
const start = source.indexOf('cleanup() {');
const end = source.indexOf('\nif [[ -n "$reuse" ]]; then\n  reuse=', start);
assert.ok(start >= 0 && end > start);
const actualCleanupAndTraps = source.slice(start, end);
function exercise({ stop = 0, original = 0, signal, keep = 0, owned = true, reuse = false }) {
  const work = mkdtempSync(join(tmpdir(), 'strelva-outer-status-unit-'));
  try {
    // Only the actual outer cleanup/trap source runs. The fake CLI returns a
    // selected status; no Docker/Auth/Redis/database/app/browser is reachable.
    const program = `set -euo pipefail\numask 077\nwork="$1"\nowned_stack=""\n[[ "$2" != 1 ]] || owned_stack="$work/strelva-auth.unit"\nkeep="$3"\nredis_pid=""\nreuse="$5"\nprofile=full-native\nbundler=webpack\nstop_app() { :; }\nstop_redis() { :; }\nbase_env=("PATH=/usr/bin:/bin")\ncli=(/bin/bash -c 'echo fictional-stop-attempt; exit "$1"' bash "$4")\n${actualCleanupAndTraps}\n${signal ? `kill -s ${signal} $$\nexit 0` : `exit ${original}`}\n`;
    const result = spawnSync('/bin/bash', ['-c', program, 'bash', work, owned ? '1' : '0', String(keep), String(stop), reuse ? "/tmp/fictional-reused-proof" : ""], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' }, timeout: 5000 });
    assert.equal(result.signal, null); assert.equal(result.error, undefined);
    const file = join(work, 'teardown-status.json');
    assert.equal(statSync(file).mode & 0o777, 0o600);
    const receipt = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(receipt.teardownQualified, false);
    return { status: result.status, receipt };
  } finally { rmSync(work, { recursive: true, force: true }); }
}
test('actual cleanup preserves success only when owned CLI stop succeeds', () => {
  const r = exercise({}); assert.equal(r.status, 0); assert.equal(r.receipt.stackState, 'stop-succeeded');
});
test('actual stop failure is retained and makes previous success nonzero', () => {
  const r = exercise({ stop: 27 }); assert.equal(r.status, 27); assert.equal(r.receipt.originalExitStatus, 0); assert.equal(r.receipt.stackStopExitStatus, 27); assert.equal(r.receipt.stackState, 'stop-failed');
});
test('earlier failure is not overwritten by owned stop failure', () => {
  const r = exercise({ original: 9, stop: 27 }); assert.equal(r.status, 9); assert.equal(r.receipt.originalExitStatus, 9); assert.equal(r.receipt.finalExitStatus, 9);
});
for (const [signal, status] of [['INT', 130], ['TERM', 143]]) test(`actual ${signal} trap preserves ${status} between successful commands`, () => {
  const r = exercise({ signal, stop: 27 }); assert.equal(r.status, status); assert.equal(r.receipt.originalExitStatus, status); assert.equal(r.receipt.finalExitStatus, status);
});
test('explicit keep retains stack without claiming successful teardown', () => {
  const r = exercise({ keep: 1, stop: 27 }); assert.equal(r.status, 0); assert.equal(r.receipt.stackState, 'retained'); assert.equal(r.receipt.stackStopExitStatus, null);
});
test('no created stack records not-created', () => {
  const r = exercise({ owned: false }); assert.equal(r.status, 0); assert.equal(r.receipt.stackState, 'not-created'); assert.equal(r.receipt.stackStopExitStatus, null);
});

test('reused stack is untouched and retains original interruption status', () => {
  const r = exercise({ owned: false, reuse: true, signal: 'TERM', stop: 27 });
  assert.equal(r.status, 143); assert.equal(r.receipt.stackState, 'reused'); assert.equal(r.receipt.stackStopExitStatus, null);
});
