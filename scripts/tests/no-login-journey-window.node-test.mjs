import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { noLoginWindowProfile, parseNoLoginRuntime, assertNoLoginEnvironment, assertNoLoginAuthConfiguration, redactNoLoginEvidence } from '../no-login-journey-window.mjs';
import { journeyProfile, shellEnvironment, validateReport } from '../full-model-journey-profile.mjs';
import { cleanupWindowProfile } from '../tenant-cleanup-journey-window.mjs';

const root = resolve(import.meta.dirname, '../..');
function report(profile) {
  const specs = profile.specs.flatMap(spec => spec.cases.map(item => ({ file: spec.file, title: item.title,
    tests: [{ projectName: item.project, status: 'expected', results: [{ status: 'passed', retry: 0 }] }] })));
  return { suites: [{ specs }], stats: { expected: specs.length, skipped: 0, unexpected: 0, flaky: 0 }, errors: [] };
}
const owned = { STRELVA_AUTH_STACK_DIR: '/private/tmp/strelva-auth.test', STRELVA_LOCAL_DB_URL: 'postgresql://postgres:fixture@127.0.0.1:5433/postgres',
  SUPABASE_URL: 'http://127.0.0.1:5432', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:5432', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-anon', SUPABASE_SERVICE_ROLE_KEY: 'local-service' };
const environment = () => ({ ...journeyProfile('full-native').env, ...owned, PLAYWRIGHT_BASE_URL: 'http://localhost:3100', NEXT_PUBLIC_APP_URL: 'http://localhost:3100',
  APPROVE_LINK_SECRET: 'local-signer-secret', CRON_SECRET: 'local-cron-secret', SECRETS_ENC_KEY: 'local-encryption-key', PUBLIC_CONTINUATION_SECRET: 'local-continuation-secret',
  UPSTASH_REDIS_REST_URL: 'http://127.0.0.1:3101', UPSTASH_REDIS_REST_TOKEN: 'local-redis-token' });

test('separate fixed two-case baseline preserves native34, cleanup2, held providers and all acceptance', () => {
  const native = structuredClone(journeyProfile('full-native')), cleanup = structuredClone(cleanupWindowProfile());
  const profile = noLoginWindowProfile();
  assert.equal(profile.specs.length, 1);
  assert.equal(profile.specs[0].file, 'tests/email-only-owner-authenticated-local.spec.ts');
  assert.equal(validateReport(report(profile), profile).passed, 2);
  assert.equal(validateReport(report(profile), profile).fullReleaseQualified, false);
  assert.deepEqual(profile.acceptance, native.acceptance);
  assert.deepEqual(profile.env, native.env);
  assert.equal(profile.emailDelivery, 'held'); assert.equal(profile.providerActions, 'held');
  assert.deepEqual(journeyProfile('full-native'), native); assert.deepEqual(cleanupWindowProfile(), cleanup);
  assert.equal(validateReport(report(native), native).passed, 34);
  assert.equal(validateReport(report(cleanup), cleanup).passed, 2);
  assert.throws(() => validateReport(report(profile), native));
  assert.throws(() => validateReport(report(profile), cleanup));
  const actual = readFileSync(resolve(root, profile.specs[0].file), 'utf8');
  for (const item of profile.specs[0].cases) assert.ok(actual.includes(`test("${item.title}"`));
  assert.ok(actual.includes('status: "suppressed"'));
  assert.ok(actual.includes('decidedByKind: "owner_link"')); assert.ok(actual.includes('isolated copy'));
});
test('rejects missing, duplicate, extra, wrong identity, skip, retry, flaky and failed reports', () => {
  const profile = noLoginWindowProfile();
  for (const mutate of [r => r.suites[0].specs.pop(), r => { r.suites[0].specs[1] = structuredClone(r.suites[0].specs[0]); },
    r => r.suites[0].specs.push({ file: 'preview.spec.ts', tests: [] }), r => { r.suites[0].specs[0].title = 'preview works'; },
    r => { r.suites[0].specs[0].tests[0].projectName = 'mobile'; }, r => { r.stats.skipped = 1; }, r => { r.stats.flaky = 1; },
    r => { r.suites[0].specs[0].tests[0].results[0].retry = 1; }, r => { r.suites[0].specs[0].tests[0].results[0].status = 'failed'; },
    r => { r.errors.push({ message: 'global failure' }); }]) {
    const data = report(profile); mutate(data); assert.throws(() => validateReport(data, profile));
  }
});
test('requires exact owned server flags, mail hold, signer and loopback services', () => {
  const runtime = environment(); assert.equal(assertNoLoginEnvironment(environment(), owned, runtime), true);
  for (const change of [{ EMAIL_SENDING_ENABLED: 'true' }, { CUSTOMER_EMAIL_ENABLED: 'true' }, { OPERATOR_EMAILS_ENABLED: 'true' },
    { PROSPECT_EMAILS_ENABLED: 'true' }, { STRELVA_LOCAL_AUTH_PROOF: '0' }, { REB_DEV_UNGATED_ACCESS: '1' },
    { STRELVA_LEADS_AUTHORITY: 'legacy' }, { STRELVA_SYSTEMS_RELEASE: '0' }, { STRELVA_AUTH_STACK_DIR: '/other-stack' },
    { APPROVE_LINK_SECRET: 'other-signer' }, { CRON_SECRET: 'other-cron' }, { SUPABASE_URL: 'http://remote.example' },
    { PLAYWRIGHT_BASE_URL: 'https://app.strelva.com' }, { NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3100' },
    { UPSTASH_REDIS_REST_URL: 'https://remote.upstash.io' }, { UPSTASH_REDIS_REST_TOKEN: 'other-redis' },
    { RESEND_API_KEY: 'fixture' }, { SMTP_HOST: 'live-mail.example' }, { SENDGRID_API_KEY: 'fixture' },
    { VERCEL_API_TOKEN: 'fixture' }, { STRIPE_SECRET_KEY: 'fixture' }]) assert.throws(() => assertNoLoginEnvironment({ ...environment(), ...change }, owned, runtime));
  for (const key of ['APPROVE_LINK_SECRET', 'CRON_SECRET', 'UPSTASH_REDIS_REST_TOKEN']) {
    const absent = environment(); delete absent[key]; assert.throws(() => assertNoLoginEnvironment(absent, owned, absent));
  }
  for (const origin of ['http://localhost', 'http://user:password@localhost:3100', 'http://localhost:3100?redirect=remote']) {
    const value = { ...environment(), PLAYWRIGHT_BASE_URL: origin, NEXT_PUBLIC_APP_URL: origin };
    assert.throws(() => assertNoLoginEnvironment(value, owned, value));
  }
});
test('parses generated runtime safely and only permits one generated app-origin replacement', () => {
  const env = environment(); assert.deepEqual(parseNoLoginRuntime(shellEnvironment(env)), env);
  assert.equal(parseNoLoginRuntime("export PLAYWRIGHT_BASE_URL='http://127.0.0.1:3100'\nexport PLAYWRIGHT_BASE_URL='http://localhost:3199'").PLAYWRIGHT_BASE_URL, 'http://localhost:3199');
  for (const value of ["export EMAIL_SENDING_ENABLED='false'\nexport EMAIL_SENDING_ENABLED='true'", "export UNLISTED_PROVIDER_SECRET='fixture'", 'source external.env',
    "export PLAYWRIGHT_BASE_URL='http://localhost:3100'\nexport PLAYWRIGHT_BASE_URL='http://localhost:3199'\nexport PLAYWRIGHT_BASE_URL='http://localhost:3200'",
    'export CRON_SECRET=$(curl https://remote.example)', 'export CRON_SECRET="fixture"']) assert.throws(() => parseNoLoginRuntime(value));
});
test('requires disabled local SMTP and refuses an Auth SMTP transport', () => {
  assert.equal(assertNoLoginAuthConfiguration('[local_smtp]\nenabled = false\n[auth]\nenabled = true\n'), true);
  for (const text of ['', '[local_smtp]\nenabled = true\n', '[local_smtp]\nenabled = false\n[auth.email.smtp]\nenabled = true\nhost = "remote.example"'])
    assert.throws(() => assertNoLoginAuthConfiguration(text));
});
test('redacts nested evidence, local credential values and signed URL parameters', () => {
  const env = environment();
  const data = { error: `Database ${env.STRELVA_LOCAL_DB_URL}; signer ${env.APPROVE_LINK_SECRET}`, nested: [env.SUPABASE_SERVICE_ROLE_KEY,
    'http://localhost:3100/approve?token=signed-value&signature=other-value', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJsb2NhbCJ9.signature-value'] };
  const redacted = JSON.stringify(redactNoLoginEvidence(data, env));
  for (const secret of [env.STRELVA_LOCAL_DB_URL, env.APPROVE_LINK_SECRET, env.SUPABASE_SERVICE_ROLE_KEY, 'signed-value', 'other-value', 'signature-value']) assert.ok(!redacted.includes(secret));
  assert.ok(redacted.includes('[redacted'));
});
test('CLI refuses arbitrary spec/profile override before executing anything', () => {
  assert.throws(() => execFileSync(process.execPath, [resolve(root, 'scripts/no-login-journey-window.mjs'), 'run', root, '/not-an-owned-work', 'arbitrary.spec.ts'], { stdio: 'pipe' }), /Command failed/);
  const manifest = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/no-login-journey-window.mjs'), 'manifest'], { encoding: 'utf8' }));
  assert.deepEqual(manifest, noLoginWindowProfile());
});
