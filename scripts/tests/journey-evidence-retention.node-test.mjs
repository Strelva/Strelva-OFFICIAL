import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { inventoryJourneyArtifacts, retainJourneyEnd, validateTraceArchive, withJourneyAdmission } from '../journey-evidence-retention.mjs';
import { runNoLoginWindow, noLoginWindowProfile } from '../no-login-journey-window.mjs';
function fixture(t) {
  const work = mkdtempSync(join(tmpdir(), 'strelva-full-journeys.'));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const output = join(work, 'window'); mkdirSync(output, { mode: 0o700 });
  return { work, output };
}
// A complete zero-length stored member, including central directory and CRC.
// This fixture is actual ZIP bytes; the production system unzip validates them.
function zip() {
  const local = Buffer.alloc(31); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(1, 26); local[30] = 97;
  const central = Buffer.alloc(47); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(1, 28); central[46] = 97;
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(47, 12); end.writeUInt32LE(31, 16);
  return Buffer.concat([local, central, end]);
}
test('valid ZIP, central-directory truncation and CRC corruption retain distinct integrity states', t => {
  const { work, output } = fixture(t), artifacts = join(output, 'artifacts'); mkdirSync(artifacts);
  const valid = join(artifacts, 'valid.zip'), truncated = join(artifacts, 'truncated.zip'), corrupt = join(artifacts, 'crc.zip');
  writeFileSync(valid, zip()); writeFileSync(truncated, zip().subarray(0, 31));
  const wrong = zip(); wrong.writeUInt32LE(1, 14); wrong.writeUInt32LE(1, 47); writeFileSync(corrupt, wrong);
  assert.equal(validateTraceArchive(valid), 'valid'); assert.equal(validateTraceArchive(truncated), 'invalid'); assert.equal(validateTraceArchive(corrupt), 'invalid');
  const result = inventoryJourneyArtifacts({ work, artifactDir: artifacts });
  assert.equal(result.integrityValidated, false); assert.deepEqual(result.issues, ['archive-invalid']);
  assert.equal(result.files.length, 3); for (const item of result.files) { assert.match(item.sha256, /^[a-f0-9]{64}$/); assert.ok(item.bytes > 0); assert.equal(statSync(join(work, item.path)).mode & 0o777, 0o600); }
  assert.deepEqual(readFileSync(truncated), zip().subarray(0, 31));
});
test('unavailable validator and report-advertised missing trace refuse integrity qualification', t => {
  const { work, output } = fixture(t), artifacts = join(output, 'artifacts'); mkdirSync(artifacts);
  writeFileSync(join(artifacts, 'trace.zip'), zip());
  const reportPath = join(output, 'results.json'); writeFileSync(reportPath, JSON.stringify({ suites: [{ attachments: [{ path: join(artifacts, 'missing.zip') }] }] }));
  const result = inventoryJourneyArtifacts({ work, artifactDir: artifacts, reportPath, validateZip: () => 'unvalidated' });
  assert.equal(result.integrityValidated, false); assert.ok(result.issues.includes('archive-unvalidated')); assert.ok(result.issues.includes('missing-file'));
});
test('symlink artifacts and symlink ancestor cannot inspect or chmod outside bytes', t => {
  const { work, output } = fixture(t), outside = mkdtempSync(join(tmpdir(), 'outside-retention.'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const secret = join(outside, 'secret.txt'); writeFileSync(secret, 'fixture-secret', { mode: 0o644 });
  const link = join(output, 'link'); symlinkSync(outside, link);
  const result = inventoryJourneyArtifacts({ work, proofFiles: [link, join(link, 'secret.txt')] });
  assert.equal(result.integrityValidated, false); assert.equal(statSync(secret).mode & 0o777, 0o644); assert.ok(!JSON.stringify(result).includes('fixture-secret'));
});
test('failed child still captures source end and failed stack, preserves exact exit and no qualification', t => {
  const { work, output } = fixture(t), calls = [];
  const terminal = retainJourneyEnd({ work, output, sourceBefore: { pin: 'same' }, browser: { status: 7 },
    captureSource: () => { calls.push('source'); return { pin: 'same' }; }, qualify: () => { calls.push('stack'); throw new Error('fixture-private-token'); } });
  assert.deepEqual(calls, ['source', 'stack']); assert.equal(terminal.browserExit, 7); assert.equal(terminal.retentionValidated, false);
  assert.deepEqual(JSON.parse(readFileSync(join(output, 'source-end.json'))), { pin: 'same' });
  const failure = readFileSync(join(output, 'stack-after-failure.json'), 'utf8'); assert.ok(!failure.includes('fixture-private-token'));
  assert.equal(JSON.parse(readFileSync(join(output, 'terminal-state.json'))).fullReleaseQualified, false);
});
test('source-capture failure still captures post-stack; source drift and invalid trace never pass retention', t => {
  const { work, output } = fixture(t);
  const terminal = retainJourneyEnd({ work, output, sourceBefore: {}, browser: { status: 0 }, captureSource: () => { throw new Error('hidden'); }, qualify: () => ({ qualified: true }) });
  assert.equal(terminal.sourceState, 'unavailable'); assert.equal(terminal.stackState, 'captured'); assert.equal(terminal.retentionValidated, false);
  const second = join(work, 'second'); mkdirSync(second, { mode: 0o700 }); const invalid = join(second, 'trace.zip'); writeFileSync(invalid, zip().subarray(0, 31));
  const drift = retainJourneyEnd({ work, output: second, sourceBefore: { pin: 1 }, browser: { status: 0 }, captureSource: () => ({ pin: 2 }), qualify: () => ({ qualified: true }), proofFiles: [invalid] });
  assert.equal(drift.sourceState, 'changed'); assert.equal(drift.retentionValidated, false); assert.equal(drift.integrityValidated, false);
});
test('real no-login runtime admission failure retains not-run2 before any browser or stack command', t => {
  const { work } = fixture(t), root = resolve(import.meta.dirname, '../..');
  writeFileSync(join(work, 'env'), 'INVALID=fixture-secret\n', { mode: 0o600 });
  assert.throws(() => runNoLoginWindow(root, work));
  const terminal = JSON.parse(readFileSync(join(work, 'no-login-local', 'admission-terminal.json')));
  assert.equal(terminal.state, 'not-run'); assert.equal(terminal.required, 2); assert.equal(terminal.browserStarted, false); assert.equal(terminal.failedStage, 'runtime-admission');
  assert.ok(!JSON.stringify(terminal).includes('fixture-secret'));
  assert.throws(() => runNoLoginWindow(root, work)); // Existing evidence cannot be replaced.
});
test('admission distinguishes dispatched failure from not-run and preserves exact case identities', t => {
  const { work } = fixture(t), profile = noLoginWindowProfile();
  assert.throws(() => withJourneyAdmission(work, 'dispatch', profile, (_output, update) => { update('browser', true); throw new Error('secret'); }));
  const value = JSON.parse(readFileSync(join(work, 'dispatch', 'admission-terminal.json')));
  assert.equal(value.state, 'failed'); assert.equal(value.browserStarted, true);
  const admission = JSON.parse(readFileSync(join(work, 'dispatch', 'admission-1.json'))); assert.deepEqual(admission.cases, profile.specs);
});

test('executable primary failure flow preserves child7 through rejected report and both supplements, retaining both ends before shutdown', t => {
  const { work } = fixture(t), root = resolve(import.meta.dirname, '../..');
  const runner = readFileSync(join(root, 'scripts/check-full-model-journeys.sh'), 'utf8');
  const start = runner.indexOf('  status=0 browser_status=0\n'), end = runner.indexOf('\ndone', start);
  const flow = runner.slice(start, end);
  const script = `set -euo pipefail
work='$WORK' root=fixture profile=full-native variant=native manifest=fixture
base_env=(PATH=/usr/bin:/bin) variant_arg=() specs=(fixture)
run_clean() { if [[ "$1" == node ]]; then echo "supplement:$2" >> "$work/order"; return 2; fi; return 7; }
node() { return 1; }
env() { echo "retain:\${@: -2:1}" >> "$work/order"; return 1; }
stop_app() { echo stop-app >> "$work/order"; }
stop_redis() { echo stop-redis >> "$work/order"; }
${flow}`.replace('$WORK', work);
  let failure;
  try { execFileSync('/bin/bash', ['-c', script], { env: { PATH: '/usr/bin:/bin' }, stdio: 'pipe' }); } catch (error) { failure = error; }
  assert.equal(failure?.status, 7, failure?.stderr?.toString());
  const order = readFileSync(join(work, 'order'), 'utf8').trim().split('\n');
  assert.deepEqual(order, ['retain:native', 'supplement:scripts/tenant-cleanup-journey-window.mjs', 'supplement:scripts/no-login-journey-window.mjs', 'retain:final-native', 'stop-app', 'stop-redis']);
});

test('browser0 plus rejected report retains browser0 and aggregate1 without inventing a final browser failure', t => {
  const { work } = fixture(t), root = resolve(import.meta.dirname, '../..');
  const runner = readFileSync(join(root, 'scripts/check-full-model-journeys.sh'), 'utf8');
  const start = runner.indexOf('  status=0 browser_status=0\n'), end = runner.indexOf('\ndone', start);
  const flow = runner.slice(start, end);
  const script = `set -euo pipefail
work='$WORK' root=fixture profile=full-native variant=native manifest=fixture
base_env=(PATH=/usr/bin:/bin) variant_arg=() specs=(fixture)
run_clean() { return 0; }
node() { return 1; }
env() { echo "retain:\${@: -2:1}:\${@: -1}" >> "$work/order"; return 0; }
stop_app() { :; }
stop_redis() { :; }
${flow}`.replace('$WORK', work);
  let failure;
  try { execFileSync('/bin/bash', ['-c', script], { env: { PATH: '/usr/bin:/bin' }, stdio: 'pipe' }); } catch (error) { failure = error; }
  assert.equal(failure?.status, 1, failure?.stderr?.toString());
  assert.deepEqual(readFileSync(join(work, 'order'), 'utf8').trim().split('\n'), ['retain:native:0', 'retain:final-native:1']);
  const terminal = retainJourneyEnd({ work, output: join(work, 'window'), sourceBefore: {}, captureSource: () => ({}), qualify: () => ({ qualified: true }), runnerExit: 1 });
  assert.equal(terminal.browserAttempted, false); assert.equal(terminal.browserExit, null); assert.equal(terminal.runnerExit, 1);
});
test('captured unqualified stack is retained but cannot qualify terminal evidence', t => {
  const { work, output } = fixture(t);
  const terminal = retainJourneyEnd({ work, output, sourceBefore: {}, captureSource: () => ({}), qualify: () => ({ qualified: false }), browser: { status: 0 } });
  assert.equal(terminal.stackState, 'unqualified'); assert.equal(terminal.retentionValidated, false);
  assert.deepEqual(JSON.parse(readFileSync(join(output, 'stack-after.json'))), { qualified: false });
});
