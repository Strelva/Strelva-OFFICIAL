import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { journeyProfile, parseLocalStackEnv, preflight, releaseSwitches, shellEnvironment, sourceInventory, validateReport } from '../full-model-journey-profile.mjs';

function report(profile) {
  const specs = profile.specs.flatMap(item => Array.from({ length: item.count }, (_, i) => ({
    file: item.file, title: item.cases?.[i]?.title || item.title || `case-${i}`, tests: [{ projectName: item.cases?.[i]?.project || 'desktop', status: 'expected', results: [{ status: 'passed', retry: 0 }] }],
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
  assert.equal(profile.env.STRELVA_CONNECT, '1');
  assert.equal(profile.env.STRELVA_SANDBOX_RUNTIME_APPROVED, '0');
  assert.equal(profile.env.STRELVA_MCP_OAUTH, '1');
  assert.ok(profile.env.STRELVA_CLIENT_RECORDS_READ.split(',').includes('orders'));
  assert.ok(!profile.env.STRELVA_CLIENT_RECORDS_READ.split(',').includes('postgres'));
});
test('native merchant prerequisite reads retain a clean, unapproved provider boundary', () => {
  const native = journeyProfile('full-native');
  assert.equal(native.env.STRELVA_CONNECT, '1');
  for (const profile of [journeyProfile('full-dark'), journeyProfile('full-dark', true), journeyProfile('full-provider')])
    assert.equal(profile.env.STRELVA_CONNECT, '0');
  assert.equal(native.specs.reduce((sum, spec) => sum + spec.count, 0), 34);
  assert.equal(native.providerActions, 'held');
  for (const key of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_CONNECT_WEBHOOK_SECRET',
    'STRIPE_CONNECT_THIN_WEBHOOK_SECRET', 'STRELVA_CONNECT_PROFILE_VERSION',
    'STRELVA_CONNECT_FEES_COLLECTOR', 'STRELVA_CONNECT_LOSSES_COLLECTOR'])
    assert.ok(!Object.hasOwn(native.env, key), key);
  for (const suffix of ['AGENT_PAYMENTS', 'REVENUE_SPLITS', 'PLATFORM_COLLECTION', 'SPLIT_PAYOUT_EXECUTION',
    'AGENT_PAYMENT_SELLER_TERMS_APPROVED']) assert.equal(native.env[`STRELVA_${suffix}`], '0', suffix);
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

test('native inquiry publication admission is explicit while both dark variants and provider preparation stay held', () => {
  const native = journeyProfile('full-native');
  assert.equal(native.env.STRELVA_INQUIRIES_RELEASE, '1');
  assert.ok(releaseSwitches.includes('STRELVA_INQUIRIES_RELEASE'));
  for (const profile of [journeyProfile('full-dark'), journeyProfile('full-dark', true), journeyProfile('full-provider')])
    assert.equal(profile.env.STRELVA_INQUIRIES_RELEASE, '0');
  assert.equal(native.specs.reduce((sum, item) => sum + item.count, 0), 34);
  assert.equal(native.env.STRELVA_CLIENT_RECORDS_READ.split(',').length, 13);
  assert.equal(native.providerActions, 'held');
  for (const suffix of ['GOOGLE_MAKE_REAL_RELEASE', 'BOOKING_CALENDAR_BUSY', 'BOOKING_CALENDAR_MIRROR',
    'BOOKING_PROVIDER_PROOF', 'NEWSLETTER_SENDER_RELEASE', 'AGENT_PAYMENTS'])
    assert.equal(native.env[`STRELVA_${suffix}`], '0', suffix);
});

test('runtime and proof root files change the source pin without a new commit', () => {
  const root = mkdtempSync(join(tmpdir(), 'strelva-root-source-test-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  try {
    git('init', '-q');
    for (const file of ['instrumentation.ts', 'postcss.config.mjs', 'vitest.config.ts', 'vitest.setup.ts', 'sentry.server.config.ts', 'sentry.edge.config.ts', 'sentry.client.config.ts', 'playwright.provider.config.ts', 'eslint.config.mjs'])
      writeFileSync(join(root, file), 'runtime or proof before');
    git('add', '.');
    git('-c', 'user.name=Local proof', '-c', 'user.email=proof@example.test', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture');
    const before = sourceInventory(root);
    writeFileSync(join(root, 'instrumentation.ts'), 'changed workspace registration');
    const changed = sourceInventory(root);
    assert.equal(changed.head, before.head); assert.equal(changed.tree, before.tree);
    assert.notDeepEqual(changed, before, 'unchanged HEAD/tree cannot hide changed registration');
    for (const file of ['instrumentation.ts', 'postcss.config.mjs', 'vitest.config.ts', 'vitest.setup.ts', 'sentry.server.config.ts', 'sentry.edge.config.ts', 'sentry.client.config.ts', 'playwright.provider.config.ts', 'eslint.config.mjs'])
      assert.ok(before.sourceFiles.find(item => item.file === file)?.sha256, `${file} executes runtime or proof code`);
    rmSync(join(root, 'instrumentation.ts'));
    assert.equal(sourceInventory(root).sourceFiles.find(item => item.file === 'instrumentation.ts').sha256, null);
    const deleted = sourceInventory(root);
    for (const file of ['instrumentation-client.ts', 'middleware.ts', 'proxy.ts', 'tailwind.config.ts'])
      writeFileSync(join(root, file), 'new untracked runtime entrypoint');
    const added = sourceInventory(root);
    assert.equal(added.head, before.head); assert.equal(added.tree, before.tree);
    assert.notDeepEqual(added, deleted, 'untracked root entrypoints must not disappear from the proof');
    for (const file of ['instrumentation-client.ts', 'middleware.ts', 'proxy.ts', 'tailwind.config.ts'])
      assert.ok(added.sourceFiles.find(item => item.file === file)?.sha256);
    for (const file of ['.env', '.env.local', 'private-proof.env', 'instrumentation-notes.md', 'unrelated.config.mjs'])
      writeFileSync(join(root, file), 'excluded private or unrelated fixture');
    assert.deepEqual(sourceInventory(root), added, 'environment and unrelated files remain outside source evidence');
  } finally { rmSync(root, { recursive: true }); }
});
