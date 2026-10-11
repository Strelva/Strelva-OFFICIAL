import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanupWindowProfile, assertCleanupEnvironment } from '../tenant-cleanup-journey-window.mjs';
import { journeyProfile, validateReport } from '../full-model-journey-profile.mjs';
function report(profile) {
  const specs = profile.specs.flatMap(spec => spec.cases.map(item => ({ file: spec.file, title: item.title,
    tests: [{ projectName: item.project, status: 'expected', results: [{ status: 'passed', retry: 0 }] }] })));
  return { suites: [{ specs }], stats: { expected: specs.length, skipped: 0, unexpected: 0, flaky: 0 }, errors: [] };
}
test('separate two-case window preserves all native flags and all 34 required identities', () => {
  const before = journeyProfile('full-native'), snapshot = structuredClone(before);
  const profile = cleanupWindowProfile();
  assert.equal(validateReport(report(profile), profile).passed, 2);
  assert.equal(validateReport(report(profile), profile).fullReleaseQualified, false);
  assert.deepEqual(journeyProfile('full-native'), snapshot);
  assert.equal(validateReport(report(before), before).passed, 34);
  for (const [key, value] of Object.entries(before.env)) assert.equal(profile.env[key], value);
  assert.equal(profile.env.STRELVA_TENANT_CLEANUP_UI_PROOF, '1');
});
test('wrong title/project, duplicate, omission, extra spec, skipped, retried and global failures are rejected', () => {
  const profile = cleanupWindowProfile();
  for (const mutate of [r => { r.suites[0].specs[0].title = 'passing preview'; }, r => { r.suites[0].specs[0].tests[0].projectName = 'mobile'; },
    r => { r.suites[0].specs[1] = structuredClone(r.suites[0].specs[0]); }, r => { r.suites[0].specs.pop(); },
    r => { r.suites[0].specs.push({ file: 'extra.spec.ts', tests: [] }); }, r => { r.stats.skipped = 1; },
    r => { r.suites[0].specs[0].tests[0].results[0].retry = 1; }, r => { r.errors.push({ message: 'failure' }); }]) {
    const value = report(profile); mutate(value); assert.throws(() => validateReport(value, profile));
  }
  assert.throws(() => validateReport(report(profile), journeyProfile('full-native')));
});
const owned = { STRELVA_LOCAL_DB_URL: 'postgresql://postgres:fixture@127.0.0.1:5433/postgres', SUPABASE_URL: 'http://127.0.0.1:5432', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:5432', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-anon', SUPABASE_SERVICE_ROLE_KEY: 'local-service' };
const environment = () => ({ ...journeyProfile('full-native').env, ...owned, PLAYWRIGHT_BASE_URL: 'http://localhost:3100' });
test('requires unchanged current authority, provider-disabled flags and exact owned stack', () => {
  assert.equal(assertCleanupEnvironment(environment(), owned), true);
  for (const change of [{ REB_DEV_UNGATED_ACCESS: '1' }, { STRELVA_LOCAL_AUTH_PROOF: '0' }, { STRELVA_LEADS_AUTHORITY: 'legacy' },
    { SUPABASE_URL: 'http://remote.example' }, { PLAYWRIGHT_BASE_URL: 'http://remote.example' }, { VERCEL_API_TOKEN: 'fixture' }, { STRIPE_SECRET_KEY: 'fixture' }]) {
    assert.throws(() => assertCleanupEnvironment({ ...environment(), ...change }, owned));
  }
});
