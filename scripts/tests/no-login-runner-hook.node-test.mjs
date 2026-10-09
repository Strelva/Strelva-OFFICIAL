import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { journeyProfile } from '../full-model-journey-profile.mjs';
import { cleanupWindowProfile } from '../tenant-cleanup-journey-window.mjs';
import { noLoginWindowProfile } from '../no-login-journey-window.mjs';

const root = resolve(import.meta.dirname, '../..'), runner = resolve(root, 'scripts/check-full-model-journeys.sh');
test('the executable runner retains exact native34 and keeps cleanup2 and no-login2 separate', () => {
  execFileSync('bash', ['-n', runner], { stdio: 'pipe' });
  const listed = JSON.parse(execFileSync('bash', [runner, '--profile', 'full-native', '--list'], { cwd: root, encoding: 'utf8' }));
  assert.deepEqual(listed, journeyProfile('full-native'));
  assert.equal(listed.specs.reduce((sum, spec) => sum + spec.count, 0), 34);
  assert.equal(cleanupWindowProfile().specs.reduce((sum, spec) => sum + spec.count, 0), 2);
  assert.equal(noLoginWindowProfile().specs.reduce((sum, spec) => sum + spec.count, 0), 2);
  assert.ok(!listed.specs.some(spec => spec.file.includes('email-only-owner') || spec.file.includes('tenant-cleanup')));
});
test('fixed no-login preflight and run hook precede service shutdown and preserve prior native failure', () => {
  const text = readFileSync(runner, 'utf8');
  const preflight = 'node scripts/no-login-journey-window.mjs preflight "$root"';
  const cleanup = 'run_clean node scripts/tenant-cleanup-journey-window.mjs run "$root" "$work" > "$work/cleanup-window.log" 2>&1 || status=1';
  const noLogin = 'run_clean node scripts/no-login-journey-window.mjs run "$root" "$work" > "$work/no-login-window.log" 2>&1 || status=1';
  assert.equal(text.split(preflight).length - 1, 1); assert.equal(text.split(noLogin).length - 1, 1);
  assert.ok(text.indexOf(preflight) < text.indexOf('docker info'));
  assert.ok(text.includes(`if [[ "$profile" == full-native ]]; then\n    ${cleanup}\n    ${noLogin}\n  fi\n  stop_app; stop_redis`));
  assert.ok(text.indexOf(noLogin) < text.lastIndexOf('stop_app; stop_redis'));
  assert.ok(!text.includes('status=0', text.indexOf(noLogin)));
  assert.ok(text.includes('node "$manifest" validate "$profile"'));
  assert.ok(text.includes('cmp -s "$work/source.json" "$work/source-end.json"'));
});
test('no-login hook does not reopen the held full-provider profile', () => {
  assert.throws(() => execFileSync(process.execPath, [resolve(root, 'scripts/full-model-journey-profile.mjs'), 'preflight', 'full-provider', root], { cwd: root, stdio: 'pipe' }), /Command failed/);
  assert.equal(journeyProfile('full-provider').providerActions, 'held');
});
