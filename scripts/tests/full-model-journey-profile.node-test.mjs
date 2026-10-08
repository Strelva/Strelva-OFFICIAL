import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { journeyProfile, parseLocalStackEnv, preflight, releaseSwitches, shellEnvironment, sourceInventory, validateReport } from '../full-model-journey-profile.mjs';

function report(profile) {
  const specs = profile.specs.flatMap(item => Array.from({ length: item.count }, (_, i) => ({
    file: item.file, title: item.title || `case-${i}`, tests: [{ status: 'expected', results: [{ status: 'passed', retry: 0 }] }],
  })));
  return { suites: [{ specs }], stats: { expected: specs.length, skipped: 0, unexpected: 0, flaky: 0 }, errors: [] };
}
test('closed dark profile owns every additive switch and separates master-off', () => {
  const profile = journeyProfile('full-dark');
  for (const key of releaseSwitches) assert.equal(profile.env[key], '0', key);
  assert.equal(profile.env.STRELVA_WORKSPACE_RELEASE, '1');
  assert.equal(journeyProfile('full-dark', true).env.STRELVA_WORKSPACE_RELEASE, '0');
  assert.equal(profile.env.STRELVA_CUSTOM_APPLICATION_BUILD_PROVIDER, 'vercel-sandbox');
  assert.equal(profile.acceptance.length, 8);
  assert.throws(() => journeyProfile('full-native', true));
});
test('missing required native coverage fails rather than substituting passing previews', () => {
  const root = mkdtempSync(join(tmpdir(), 'strelva-manifest-test-'));
  try {
    assert.throws(() => preflight(journeyProfile('full-native'), root), /Missing required spec/);
    mkdirSync(join(root, 'tests'));
    writeFileSync(join(root, 'tests/agent-connections-ui.spec.ts'), 'passing-preview');
    assert.throws(() => preflight(journeyProfile('full-native'), root), /assistant-connections-authenticated-local/);
  } finally { rmSync(root, { recursive: true }); }
});
test('provider profile stays held even when every listed spec exists', () => {
  const root = mkdtempSync(join(tmpdir(), 'strelva-manifest-test-'));
  const profile = journeyProfile('full-provider');
  try {
    mkdirSync(join(root, 'tests'));
    for (const item of profile.specs) writeFileSync(join(root, item.file), '');
    assert.throws(() => preflight(profile, root), /actions remain held/);
  } finally { rmSync(root, { recursive: true }); }
});
test('passing local report retains all-eight requirements without a full-release claim', () => {
  const profile = journeyProfile('full-dark');
  const receipt = validateReport(report(profile), profile);
  assert.equal(receipt.passed, 1);
  assert.equal(receipt.fullReleaseQualified, false);
  assert.equal(receipt.remainingAcceptance.length, 8);
});
test('skips, retries, flaky/global failures and missing cases are rejected', () => {
  const profile = journeyProfile('full-dark');
  const mutations = [
    r => { r.stats.skipped = 1; },
    r => { r.suites[0].specs[0].tests[0].results[0].retry = 1; },
    r => { r.suites[0].specs[0].tests[0].results.push({ status: 'passed', retry: 1 }); },
    r => { r.stats.flaky = 1; },
    r => { r.errors.push({ message: 'server died' }); },
    r => { r.suites[0].specs = []; },
    r => { r.suites[0].specs[0].tests[0].status = 'skipped'; },
    r => { r.suites[0].specs[0].tests[0].results[0].errors = [{ message: 'hidden teardown error' }]; },
  ];
  for (const change of mutations) { const r = report(profile); change(r); assert.throws(() => validateReport(r, profile)); }
});
test('unexpected files, extra cases and the wrong dark variant cannot satisfy the manifest', () => {
  const profile = journeyProfile('full-dark');
  const extra = report(profile);
  extra.suites[0].specs.push({ file: 'tests/agent-connections-ui.spec.ts', tests: [] });
  assert.throws(() => validateReport(extra, profile), /Unlisted/);
  const duplicate = report(profile);
  duplicate.suites[0].specs.push(duplicate.suites[0].specs[0]);
  assert.throws(() => validateReport(duplicate, profile), /count differs/);
  assert.throws(() => validateReport(report(journeyProfile('full-dark', true)), profile), /case title/);
});
test('new money Auth specs are required at their exact paths and case counts', () => {
  const profile = journeyProfile('full-native');
  assert.equal(profile.specs.find(item => basename(item.file) === 'assistant-connections-authenticated-local.spec.ts')?.count, 2);
  assert.equal(profile.specs.find(item => basename(item.file) === 'billing-payments-prerequisites-authenticated-local.spec.ts')?.count, 1);
  assert.equal(profile.env.STRELVA_CONNECT, '0');
  assert.equal(profile.env.STRELVA_SANDBOX_RUNTIME_APPROVED, '0');
  assert.equal(profile.env.STRELVA_MCP_OAUTH, '1');
  assert.ok(profile.env.STRELVA_CLIENT_RECORDS_READ.split(',').includes('orders'));
  assert.ok(!profile.env.STRELVA_CLIENT_RECORDS_READ.split(',').includes('postgres'));
});
test('owned stack parser rejects inherited provider credentials, hosted URLs and executable env syntax', () => {
  const root = mkdtempSync(join(tmpdir(), 'strelva-manifest-test-'));
  try {
    mkdirSync(join(root, 'supabase'));
    writeFileSync(join(root, 'supabase/config.toml'), 'project_id = "strelva-proof-0123456789abcdef"');
    const lines = [ `STRELVA_AUTH_STACK_DIR=${root}`, 'STRELVA_LOCAL_DB_URL=postgresql://postgres:password@127.0.0.1:55432/postgres',
      'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55431', 'SUPABASE_URL=http://127.0.0.1:55431',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY=owned-anon', 'SUPABASE_SERVICE_ROLE_KEY=owned-service' ];
    assert.equal(parseLocalStackEnv(lines.join('\n')).SUPABASE_SERVICE_ROLE_KEY, 'owned-service');
    assert.throws(() => parseLocalStackEnv([...lines, 'STRIPE_SECRET_KEY=hosted'].join('\n')), /Invalid/);
    assert.throws(() => parseLocalStackEnv([...lines, 'touch /tmp/unwanted'].join('\n')), /Invalid/);
    assert.throws(() => parseLocalStackEnv(lines.join('\n').replace('http://127.0.0.1:55431', 'https://hosted.example')), /loopback/);
    assert.throws(() => parseLocalStackEnv([...lines, lines[1]].join('\n')), /Invalid/);
    writeFileSync(join(root, 'supabase/config.toml'), 'project_id = "production"');
    assert.throws(() => parseLocalStackEnv(lines.join('\n')), /disposable/);
  } finally { rmSync(root, { recursive: true }); }
});
test('environment values are shell data, including apostrophes and command substitution', () => {
  const text = shellEnvironment({ NEXT_PUBLIC_APP_URL: "http://localhost/a'b$(never-run)" });
  assert.equal(text, "export NEXT_PUBLIC_APP_URL='http://localhost/a'\\''b$(never-run)'");
});
test('source pin includes untracked authored files and detects changed or deleted implementation', () => {
  const root = mkdtempSync(join(tmpdir(), 'strelva-manifest-test-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  try {
    git('init', '-q');
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/implementation.ts'), 'before');
    git('add', 'src/implementation.ts');
    git('-c', 'user.name=Local proof', '-c', 'user.email=proof@example.test', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture');
    mkdirSync(join(root, 'tests'));
    writeFileSync(join(root, 'tests/untracked.spec.ts'), 'actual new proof');
    const before = sourceInventory(root);
    assert.equal(before.sourceFiles.length, 2);
    writeFileSync(join(root, 'src/implementation.ts'), 'after');
    assert.notDeepEqual(sourceInventory(root), before);
    rmSync(join(root, 'src/implementation.ts'));
    assert.equal(sourceInventory(root).sourceFiles.find(file => file.file === 'src/implementation.ts').sha256, null);
  } finally { rmSync(root, { recursive: true }); }
});
