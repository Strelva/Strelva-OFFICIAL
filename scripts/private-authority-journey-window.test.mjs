import test from 'node:test';
import { proofEnvironment } from './private-authority-proof-environment.mjs';
import assert from 'node:assert/strict';
import { privateAuthorityProfile, closedPrivateEnvironment } from './private-authority-journey-window.mjs';
import { journeyProfile, validateReport } from './full-model-journey-profile.mjs';
const owned = { STRELVA_AUTH_STACK_DIR: '/tmp/fresh/strelva-auth.fixture', STRELVA_LOCAL_DB_URL: 'postgresql://postgres:fixture@127.0.0.1:54322/postgres', SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fictional-anon', SUPABASE_SERVICE_ROLE_KEY: 'fictional-service' };
const input = { ...journeyProfile('full-native').env, ...owned, PATH: '/untrusted', HOME: '/tmp/fictional', PLAYWRIGHT_BASE_URL: 'http://localhost:3100', NEXT_PUBLIC_APP_URL: 'http://localhost:3100', PLAYWRIGHT_DIST_DIR: '.next-private-authority-journeys', STRELVA_BUILD_CACHE: 'off', APPROVE_LINK_SECRET: 'fictional', CRON_SECRET: 'fictional', SECRETS_ENC_KEY: 'fictional', PUBLIC_CONTINUATION_SECRET: 'fictional', UPSTASH_REDIS_REST_URL: 'http://127.0.0.1:3101', UPSTASH_REDIS_REST_TOKEN: 'fictional', STRELVA_LOCAL_PACKAGE_REVIEWER_EMAIL: 'reviewer@example.test', STRELVA_LOCAL_PACKAGE_REVIEWER_PASSWORD: 'fictional', STRELVA_LOCAL_PACKAGE_REVIEWER_RECEIPT: '/tmp/fresh/reviewer.json' };
function report() {
  const p = privateAuthorityProfile();
  return { suites: [{ specs: p.specs[0].cases.map(c => ({ file: p.specs[0].file, title: c.title, tests: [{ projectName: c.project, status: 'expected', results: [{ status: 'passed', retry: 0 }] }] })) }], stats: { expected: 7, skipped: 0, unexpected: 0, flaky: 0 }, errors: [] };
}
test('supplemental seven preserves primary 34+2+2', () => {
  const p = privateAuthorityProfile();
  assert.equal(journeyProfile('full-native').specs.reduce((n, s) => n + s.count, 0), 34);
  assert.deepEqual(p.primaryWindows, { native: 34, cleanup: 2, noLogin: 2, substitutionAllowed: false });
  assert.equal(validateReport(report(), p).passed, 7);
});
test('report refuses missing, duplicate, skipped and repeated attempts', () => {
  for (const alter of [r => r.suites[0].specs.pop(), r => r.suites[0].specs.push(r.suites[0].specs[0]), r => { r.suites[0].specs[0].tests[0].results[0].status = 'skipped'; }, r => r.suites[0].specs[0].tests[0].results.push({ status: 'passed', retry: 1 })]) {
    const r = report(); alter(r); assert.throws(() => validateReport(r, privateAuthorityProfile()));
  }
});
test('finite child drops database overrides, preloads and provider secrets', () => {
  const poison = { NODE_OPTIONS: '--import=fake', PYTHONPATH: '/fake', PGSERVICE: 'fake', PGOPTIONS: '-cfake', PSQLRC: '/fake', LD_PRELOAD: '/fake', DYLD_INSERT_LIBRARIES: '/fake', OPENAI_API_KEY: 'fake', STRIPE_SECRET_KEY: 'fake', STRELVA_PRIVATE_SOURCE_NATIVE_PROOFS: '1' };
  const child = closedPrivateEnvironment({ ...input, ...poison }, owned, '/tmp/fresh');
  for (const key of Object.keys(poison)) assert.equal(child[key], undefined);
  assert.equal(child.PATH, '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin');
});
test('changed native flags, stack and nonlocal endpoints are refused', () => {
  for (const mutation of [{ STRELVA_SYSTEMS_RELEASE: '0' }, { STRELVA_LOCAL_DB_URL: 'postgresql://other' }, { UPSTASH_REDIS_REST_URL: 'https://provider.example' }, { NEXT_PUBLIC_APP_URL: 'http://localhost:4100' }]) assert.throws(() => closedPrivateEnvironment({ ...input, ...mutation }, owned, '/tmp/fresh'));
});

test('both Python harness callers receive the exact owned Auth URL and no ambient PG/PSQL values', () => {
  const poison = { PGSERVICE: 'fake', PGSERVICEFILE: '/fake', PGOPTIONS: '-cfake', PGHOST: 'remote', PGPASSWORD: 'fake', PSQLRC: '/fake', NODE_OPTIONS: '--import=fake', PYTHONPATH: '/fake', DYLD_INSERT_LIBRARIES: '/fake' };
  const fixture = { ...input, ...poison, STRELVA_PRIVATE_AUTHORITY_PROOF: '1', STRELVA_PRIVATE_SOURCE_PROOF_DIR: '/tmp/fresh' };
  const env = proofEnvironment(fixture);
  assert.equal(env.SUPABASE_URL, owned.SUPABASE_URL);
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, owned.SUPABASE_URL);
  for (const key of Object.keys(poison)) assert.equal(env[key], undefined);
  assert.throws(() => proofEnvironment({ ...fixture, SUPABASE_URL: '' }));
  assert.throws(() => proofEnvironment({ ...fixture, SUPABASE_URL: 'http://127.0.0.1:54320' }));
  assert.throws(() => proofEnvironment({ ...fixture, SUPABASE_URL: 'https://remote.example', NEXT_PUBLIC_SUPABASE_URL: 'https://remote.example' }));
});
