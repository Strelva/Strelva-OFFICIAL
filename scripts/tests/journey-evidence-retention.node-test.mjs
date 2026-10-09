import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, linkSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { browserWasStarted, inventoryJourneyArtifacts, retainJourneyEnd, validateTraceArchive, withJourneyAdmission } from '../journey-evidence-retention.mjs';
import { readOwnedJourneyFile, writeOwnedJourneyFile } from '../journey-evidence-files.mjs';
import { runNoLoginWindow, noLoginWindowProfile, retainNoLoginReport } from '../no-login-journey-window.mjs';
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
  const secret = join(outside, 'secret.txt'); writeFileSync(secret, 'fixture-secret', { mode: 0o644 }); chmodSync(secret, 0o644);
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
# These original flows intentionally exercise admitted disk headroom.
disk_headroom() { return 0; }
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
# These original flows intentionally exercise admitted disk headroom.
disk_headroom() { return 0; }
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

for (const browserStatus of [7, 0]) {
  for (const refused of [['cleanup-native'], ['no-login-native'], ['cleanup-native', 'no-login-native']]) {
    test(`supplementary disk refusal ${refused.join('+')} preserves browser${browserStatus} and retains before shutdown`, t => {
      const { work } = fixture(t), root = resolve(import.meta.dirname, '../..');
      const runner = readFileSync(join(root, 'scripts/check-full-model-journeys.sh'), 'utf8');
      const start = runner.indexOf('  status=0 browser_status=0\n'), end = runner.indexOf('\ndone', start);
      assert.ok(start >= 0 && end > start);
      const flow = runner.slice(start, end);
      const script = `set -euo pipefail
work='$WORK' root=fixture profile=full-native variant=native manifest=fixture
base_env=(PATH=/usr/bin:/bin) variant_arg=() specs=(fixture)
refused_a='${refused[0]}' refused_b='${refused[1] || ''}'
disk_headroom() { echo "disk:$1" >> "$work/order"; [[ "$1" != "$refused_a" && "$1" != "$refused_b" ]]; }
run_clean() { if [[ "$1" == node ]]; then echo "supplement:$2" >> "$work/order"; return 0; fi; return ${browserStatus}; }
node() { return 0; }
env() { echo "retain:\${@: -2:1}:\${@: -1}" >> "$work/order"; return 0; }
stop_app() { echo stop-app >> "$work/order"; }
stop_redis() { echo stop-redis >> "$work/order"; }
${flow}`.replace('$WORK', work);
      const result = spawnSync('/bin/bash', ['-c', script], { env: { PATH: '/usr/bin:/bin' }, encoding: 'utf8', timeout: 5000 });
      assert.equal(result.error, undefined); assert.equal(result.signal, null);
      const expectedStatus = browserStatus || 1;
      assert.equal(result.status, expectedStatus, result.stderr);
      const expectedOrder = ['disk:primary-native', `retain:native:${browserStatus}`, 'disk:cleanup-native'];
      if (!refused.includes('cleanup-native')) expectedOrder.push('supplement:scripts/tenant-cleanup-journey-window.mjs');
      expectedOrder.push('disk:no-login-native');
      if (!refused.includes('no-login-native')) expectedOrder.push('supplement:scripts/no-login-journey-window.mjs');
      expectedOrder.push(`retain:final-native:${expectedStatus}`, 'stop-app', 'stop-redis');
      assert.deepEqual(readFileSync(join(work, 'order'), 'utf8').trim().split('\n'), expectedOrder);
    });
  }
}


test('disk admission snapshots pin each phase while raw history grows through final retention', t => {
  const { work } = fixture(t), raw = join(work, 'disk-headroom.jsonl');
  const initial = '{"stage":"primary-native","status":"admitted","availableBytes":"10737418240"}\n';
  const later = '{"stage":"cleanup-native","status":"refused","availableBytes":"10737418239"}\n';
  writeFileSync(raw, initial, { mode: 0o600 });
  const snapshots = [];
  for (const [phase, bytes] of [['native', initial], ['final-native', initial + later]]) {
    writeFileSync(raw, bytes, { mode: 0o600 });
    const output = join(work, `retention-${phase}`); mkdirSync(output, { mode: 0o700 });
    const terminal = retainJourneyEnd({ work, output, sourceBefore: {}, captureSource: () => ({}),
      qualify: () => ({ qualified: true }), diskHeadroom: true, runnerExit: 1 });
    assert.equal(terminal.diskHeadroomState, 'retained');
    assert.equal(terminal.runnerExit, 1); assert.equal(terminal.fullReleaseQualified, false);
    const snapshot = join(output, 'disk-headroom.jsonl');
    const inventory = JSON.parse(readOwnedJourneyFile(work, join(output, 'artifact-inventory.json')));
    const retained = inventory.files.find(file => file.path === `retention-${phase}/disk-headroom.jsonl`);
    assert.equal(retained.state, 'retained'); assert.equal(retained.bytes, Buffer.byteLength(bytes));
    assert.equal(retained.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(inventory.integrityValidated, true);
    assert.equal(readOwnedJourneyFile(work, snapshot), bytes); assert.equal(statSync(snapshot).mode & 0o777, 0o600);
    assert.ok(!inventory.files.some(file => file.path === 'disk-headroom.jsonl'));
    snapshots.push({ snapshot, retained });
  }
  writeFileSync(raw, initial + later + '{"stage":"later-window","status":"admitted"}\n');
  for (const { snapshot, retained } of snapshots) {
    const afterAppend = inventoryJourneyArtifacts({ work, proofFiles: [snapshot] });
    assert.equal(afterAppend.integrityValidated, true);
    assert.equal(afterAppend.files[0].sha256, retained.sha256);
  }
});
for (const kind of ['symbolic', 'outside-hardlink']) test(`disk admission snapshot refuses ${kind} evidence before outside read or chmod`, t => {
  const { work, output } = fixture(t), outside = mkdtempSync(join(tmpdir(), 'outside-disk-admission.'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const target = join(outside, 'disk-headroom.jsonl'), raw = join(work, 'disk-headroom.jsonl');
  writeFileSync(target, 'outside-only', { mode: 0o644 }); chmodSync(target, 0o644);
  if (kind === 'symbolic') symlinkSync(target, raw); else linkSync(target, raw);
  const terminal = retainJourneyEnd({ work, output, sourceBefore: {}, captureSource: () => ({}),
    qualify: () => ({ qualified: true }), diskHeadroom: true, runnerExit: 7 });
  assert.equal(terminal.diskHeadroomState, 'unavailable');
  assert.equal(terminal.retentionValidated, false); assert.equal(terminal.runnerExit, 7);
  const inventory = JSON.parse(readOwnedJourneyFile(work, join(output, 'artifact-inventory.json')));
  assert.ok(inventory.issues.includes('disk-admission-snapshot-unavailable'));
  assert.ok(!inventory.files.some(file => file.path.endsWith('/disk-headroom.jsonl')));
  assert.throws(() => readFileSync(join(output, 'disk-headroom.jsonl')));
  assert.equal(statSync(target).mode & 0o777, 0o644); assert.equal(readFileSync(target, 'utf8'), 'outside-only');
  const unowned = inventoryJourneyArtifacts({ work, proofFiles: [target] });
  assert.equal(unowned.integrityValidated, false); assert.deepEqual(unowned.issues, ['outside-owned-directory']);
});

test('captured unqualified stack is retained but cannot qualify terminal evidence', t => {
  const { work, output } = fixture(t);
  const terminal = retainJourneyEnd({ work, output, sourceBefore: {}, captureSource: () => ({}), qualify: () => ({ qualified: false }), browser: { status: 0 } });
  assert.equal(terminal.stackState, 'unqualified'); assert.equal(terminal.retentionValidated, false);
  assert.deepEqual(JSON.parse(readFileSync(join(output, 'stack-after.json'))), { qualified: false });
});

test('a refused symlink report is never parsed for attachments', t => {
  const { work, output } = fixture(t), outside = mkdtempSync(join(tmpdir(), 'outside-report.'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const outsideReport = join(outside, 'report.json'), forbiddenAttachment = join(output, 'proof-that-refused-report-was-parsed.txt');
  writeFileSync(outsideReport, JSON.stringify({ attachments: [{ path: forbiddenAttachment }] }));
  const reportPath = join(output, 'results.json'); symlinkSync(outsideReport, reportPath);
  const inventory = inventoryJourneyArtifacts({ work, reportPath });
  assert.equal(inventory.integrityValidated, false); assert.ok(inventory.issues.includes('unowned-or-symbolic-file'));
  assert.ok(!inventory.files.some(item => item.path.includes('proof-that-refused-report')));
  assert.ok(!JSON.stringify(inventory).includes(outsideReport));
});


test('a real ENOBUFS child remains dispatched/failed with exact signal rather than not-run', t => {
  const { work,output } = fixture(t);
  const browser = spawnSync(process.execPath,['-e','process.stdout.write("x".repeat(1024))'],{ encoding:'utf8',maxBuffer:128,env:{ PATH:'/usr/bin:/bin' } });
  assert.ok(browser.pid > 0); assert.equal(browser.error?.code,'ENOBUFS'); assert.equal(browserWasStarted(browser),true);
  const terminal = retainJourneyEnd({ work,output,sourceBefore:{ same:1 },captureSource:() => ({ same:1 }),qualify:() => ({ qualified:true }),browser });
  assert.equal(terminal.browserStarted,true); assert.equal(terminal.browserLaunchFailed,false); assert.equal(terminal.browserErrorCode,'ENOBUFS');
  assert.equal(terminal.browserExit,browser.status); assert.equal(terminal.browserSignal,browser.signal); assert.equal(terminal.fullReleaseQualified,false);
  assert.throws(() => withJourneyAdmission(work,'dispatch-overflow',noLoginWindowProfile(),(_output,update) => {
    update('browser'); update('terminal-evidence',browserWasStarted(browser)); throw new Error('Report rejected');
  }));
  const admission = JSON.parse(readFileSync(join(work,'dispatch-overflow','admission-terminal.json')));
  assert.equal(admission.state,'failed'); assert.equal(admission.browserStarted,true); assert.equal(admission.required,2);
});
test('an actual ENOENT spawn remains not-run while terminal source and stack are attempted', t => {
  const { work,output } = fixture(t), calls = [];
  const browser = spawnSync(join(work,'missing-executable'),[],{ env:{ PATH:'/usr/bin:/bin' } });
  assert.equal(browser.error?.code,'ENOENT'); assert.equal(browserWasStarted(browser),false);
  const terminal = retainJourneyEnd({ work,output,sourceBefore:{},captureSource:() => { calls.push('source'); return {}; },qualify:() => { calls.push('stack'); return { qualified:true }; },browser });
  assert.deepEqual(calls,['source','stack']); assert.equal(terminal.browserStarted,false); assert.equal(terminal.browserLaunchFailed,true); assert.equal(terminal.browserErrorCode,'ENOENT');
  assert.equal(terminal.browserExit,browser.status); assert.equal(terminal.browserSignal,browser.signal); assert.equal(terminal.fullReleaseQualified,false);
});
test('actual no-login report redaction refuses a symlink before any outside read or write', t => {
  const { work,output } = fixture(t), outside = mkdtempSync(join(tmpdir(),'outside-redaction.'));
  t.after(() => rmSync(outside,{ recursive:true,force:true }));
  const target = join(outside,'fictional-report.json'), raw = join(output,'results-raw.json');
  const before = JSON.stringify({ value:'fixture-secret',marker:'outside-only' }); writeFileSync(target,before); symlinkSync(target,raw);
  assert.throws(() => retainNoLoginReport(work,output,raw,{ APPROVE_LINK_SECRET:'fixture-secret' }),/Owned regular evidence/);
  assert.equal(readFileSync(target,'utf8'),before); assert.throws(() => readFileSync(join(output,'results.json')));
});
test('report reader refuses a symlink ancestor even when its target is inside the owned tree', t => {
  const { work,output } = fixture(t), real = join(work,'actual'); mkdirSync(real,{ mode:0o700 });
  const file = join(real,'report.json'); writeFileSync(file,'{}'); const link = join(output,'link'); symlinkSync(real,link);
  assert.throws(() => readOwnedJourneyFile(work,join(link,'report.json')),/ancestor/);
  assert.throws(() => writeOwnedJourneyFile(work,join(link,'new.json'),'{}'),/ancestor/);
  assert.throws(() => readFileSync(join(real,'new.json')));
});
test('guarded report read is bounded and never treats a directory as JSON bytes', t => {
  const { work,output } = fixture(t), report = join(output,'report.json'); writeFileSync(report,'x'.repeat(128));
  assert.throws(() => readOwnedJourneyFile(work,report,32),/bounded/);
  assert.throws(() => readOwnedJourneyFile(work,output),/regular/);
  assert.equal(readOwnedJourneyFile(work,report,128),'x'.repeat(128));
});
test('actual no-login redaction atomically retains both owned reports with no temporary files', t => {
  const { work,output } = fixture(t), raw = join(output,'results-raw.json');
  writeFileSync(raw,JSON.stringify({ suites:[],value:'fixture-secret' }),{ mode:0o600 });
  const report = retainNoLoginReport(work,output,raw,{ APPROVE_LINK_SECRET:'fixture-secret' });
  assert.equal(report.value,'fixture-secret');
  const evidence = JSON.parse(readOwnedJourneyFile(work,raw)); assert.equal(evidence.value,'[redacted-local-secret]');
  assert.deepEqual(JSON.parse(readOwnedJourneyFile(work,join(output,'results.json'))),evidence);
  assert.equal(statSync(raw).mode & 0o777,0o600); assert.equal(statSync(raw).nlink,1);
  const inventory = inventoryJourneyArtifacts({ work,proofFiles:[output] });
  assert.deepEqual(inventory.issues,[]); assert.ok(!inventory.files.some(file => file.path.includes('.retention-')));
});
test('atomic owned writes preserve existing evidence and refuse a dangling symlink destination', t => {
  const { work,output } = fixture(t), existing = join(output,'existing.json'); writeFileSync(existing,'original');
  assert.throws(() => writeOwnedJourneyFile(work,existing,'new'),/Existing evidence/); assert.equal(readFileSync(existing,'utf8'),'original');
  const target = join(work,'never-created.json'), link = join(output,'dangling.json'); symlinkSync(target,link);
  assert.throws(() => writeOwnedJourneyFile(work,link,'{}',{ replace:true }),/Existing evidence/);
  assert.throws(() => readFileSync(target));
});
test('primary profile CLI refuses an unowned symlink report before closed-manifest interpretation', t => {
  const { output } = fixture(t), outside = mkdtempSync(join(tmpdir(),'outside-primary-report.'));
  t.after(() => rmSync(outside,{ recursive:true,force:true }));
  const outsideReport = join(outside,'report.json'); writeFileSync(outsideReport,'{}'); const report = join(output,'results.json'); symlinkSync(outsideReport,report);
  const root = resolve(import.meta.dirname,'../..');
  const result = spawnSync(process.execPath,[join(root,'scripts/full-model-journey-profile.mjs'),'validate','full-native',report],{ cwd:root,encoding:'utf8',env:{ PATH:'/usr/bin:/bin' } });
  assert.equal(result.status,1); assert.match(result.stderr,/Owned regular evidence file required/); assert.equal(result.stdout,'');
  assert.equal(readFileSync(outsideReport,'utf8'),'{}');
});


test('artifact inventory refuses an outside hardlink before chmod, hash or ZIP validation', t => {
  const { work,output } = fixture(t), outside = mkdtempSync(join(tmpdir(),'outside-hardlink.'));
  t.after(() => rmSync(outside,{ recursive:true,force:true }));
  const target = join(outside,'original.zip'), artifact = join(output,'trace.zip'), before = zip();
  writeFileSync(target,before,{ mode:0o644 }); chmodSync(target,0o644); linkSync(target,artifact);
  let archiveCalls = 0;
  const result = inventoryJourneyArtifacts({ work,proofFiles:[artifact],validateZip:() => { archiveCalls++; return 'valid'; } });
  assert.equal(result.integrityValidated,false); assert.equal(result.fullReleaseQualified,false);
  assert.deepEqual(result.issues,['non-single-link-file']); assert.deepEqual(result.files,[{ path:'window/trace.zip',state:'refused' }]);
  assert.equal(archiveCalls,0); assert.equal(statSync(target).mode & 0o777,0o644); assert.deepEqual(readFileSync(target),before);
  assert.equal(statSync(target).nlink,2); assert.throws(() => readOwnedJourneyFile(work,artifact),/Owned regular evidence/);
});
