import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, realpathSync, statSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { journeyProfile, parseLocalStackEnv, preflight, sourceInventory, validateReport } from './full-model-journey-profile.mjs';

export const privateAuthorityTitles = [
  'actual source producer commits before populated inverse refusal',
  'actual owner grant producer commits before populated inverse refusal',
  'actual expired install grant removes installed Version maker authority',
  'actual staff withdrawal removes installed Version maker authority',
  'qualified B draft retains exact A installation scope',
  'actual direct customer admin removal serializes installed Version writes',
  'actual dual role customer admin removal refuses expired provider fallback',
];
export function privateAuthorityProfile() {
  const native = journeyProfile('full-native');
  return { ...native, name: 'private-authority-local', serverProfile: 'full-native',
    env: { ...native.env, STRELVA_PRIVATE_AUTHORITY_PROOF: '1' },
    specs: [{ file: 'tests/private-authority-authenticated-local.spec.ts', count: 7,
      cases: privateAuthorityTitles.map(title => ({ project: 'desktop', title })) }],
    completionClaim: 'local-private-authority-only', providerActions: 'held',
    runnerOnlySwitches: ['STRELVA_PRIVATE_AUTHORITY_PROOF'],
    primaryWindows: { native: 34, cleanup: 2, noLogin: 2, substitutionAllowed: false },
  };
}
const baselineKeys = ['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR'];
const ownedKeys = ['STRELVA_AUTH_STACK_DIR', 'STRELVA_LOCAL_DB_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const runtimeKeys = ['PLAYWRIGHT_BASE_URL', 'NEXT_PUBLIC_APP_URL', 'PLAYWRIGHT_DIST_DIR', 'STRELVA_BUILD_CACHE', 'APPROVE_LINK_SECRET', 'CRON_SECRET', 'SECRETS_ENC_KEY', 'PUBLIC_CONTINUATION_SECRET', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'STRELVA_LOCAL_PACKAGE_REVIEWER_EMAIL', 'STRELVA_LOCAL_PACKAGE_REVIEWER_PASSWORD', 'STRELVA_LOCAL_PACKAGE_REVIEWER_RECEIPT'];
export function closedPrivateEnvironment(input, owned, work) {
  for (const [key, value] of Object.entries(journeyProfile('full-native').env)) if (input[key] !== value) throw new Error(`Full-native environment changed: ${key}`);
  for (const key of ownedKeys) if (!owned[key] || input[key] !== owned[key]) throw new Error(`Owned stack binding differs: ${key}`);
  for (const key of ['PLAYWRIGHT_BASE_URL', 'NEXT_PUBLIC_APP_URL', 'UPSTASH_REDIS_REST_URL']) {
    const url = new URL(input[key] || '');
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.username || url.password) throw new Error(`Owned loopback endpoint required: ${key}`);
  }
  if (input.NEXT_PUBLIC_APP_URL !== input.PLAYWRIGHT_BASE_URL) throw new Error('Local app bindings differ.');
  const env = { LC_ALL: 'C', ...journeyProfile('full-native').env, STRELVA_PRIVATE_AUTHORITY_PROOF: '1', STRELVA_PRIVATE_SOURCE_PROOF_DIR: work };
  for (const key of [...baselineKeys, ...ownedKeys, ...runtimeKeys]) {
    if (input[key]) env[key] = input[key];
    else if (runtimeKeys.includes(key)) throw new Error(`Missing local runtime value: ${key}`);
  }
  // Finite allowlist intentionally excludes PG/PSQL, loader and language preloads,
  // arbitrary profile/spec overrides, and every provider credential.
  env.PATH = '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin';
  return env;
}
export function runPrivateAuthorityWindow(rootInput, workInput) {
  const root = realpathSync(rootInput), work = realpathSync(workInput), profile = privateAuthorityProfile();
  preflight(profile, root);
  for (const file of ['scripts/check-private-installed-version-authority.py', 'scripts/check-private-producer-inverse-race.py', 'tests/support/private-authority-fixtures.ts']) if (!existsSync(join(root, file))) throw new Error(`Missing approved authority producer: ${file}`);
  if (!basename(work).startsWith('strelva-full-journeys.') || statSync(work).uid !== process.getuid?.() || statSync(work).mode & 0o077) throw new Error('Fresh private owned proof directory required.');
  for (const [file, hash] of Object.entries({
    'check-private-installed-version-authority.py': '6522cf521d827813f7b59a2afafbbeae59ecd1399d0aa190a0929f72704e5e5a',
    'check-private-producer-inverse-race.py': 'c4d056c62bfc14fe99212ed607e6fc8914b358935a4a594f00623749dbc6885c',
  })) if (createHash('sha256').update(readFileSync(join(root, 'scripts', file))).digest('hex') !== hash) throw new Error('Frozen fb740 authority harness bytes differ.');
  const owned = parseLocalStackEnv(readFileSync(join(work, 'env'), 'utf8'));
  if (dirname(realpathSync(owned.STRELVA_AUTH_STACK_DIR)) !== work || process.env.STRELVA_PRIVATE_AUTHORITY_FRESH_PATH !== work) throw new Error('Dedicated fresh stack required; reuse is forbidden.');
  const browserEnv = closedPrivateEnvironment(process.env, owned, work);
  const source = sourceInventory(root);
  if (JSON.stringify(source) !== readFileSync(join(work, 'source.json'), 'utf8').trim()) {
    if (JSON.stringify(source) !== JSON.stringify(JSON.parse(readFileSync(join(work, 'source.json'), 'utf8')))) throw new Error('Source differs from fresh orchestration snapshot.');
  }
  const output = join(work, 'private-authority');
  if (existsSync(output)) throw new Error('Authority evidence already exists; create a fresh stack.');
  mkdirSync(output, { mode: 0o700 });
  const save = (file, data) => writeFileSync(join(output, file), JSON.stringify(data, null, 2), { mode: 0o600, flag: 'wx' });
  save('manifest.json', profile); save('source.json', source); save('primary-contract.json', profile.primaryWindows);
  const qualify = () => {
    const value = JSON.parse(execFileSync(process.execPath, [join(root, 'scripts/full-model-stack-qualification.mjs'), 'verify', root, join(work, 'env')], {
      cwd: root, encoding: 'utf8', env: Object.fromEntries([...baselineKeys, 'LC_ALL'].filter(key => browserEnv[key]).map(key => [key, browserEnv[key]])), stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024,
    }));
    if (!value.qualified || value.current?.migrations?.length !== 343 || value.current?.ledger?.length !== 343) throw new Error('Exact actual 343-migration native catalog and ledger qualification required.');
    return value;
  };
  const before = qualify(); save('stack-before.json', before);
  const resultPath = join(output, 'results.json');
  const browser = spawnSync('pnpm', ['exec', 'playwright', 'test', profile.specs[0].file, '--workers=1', '--retries=0', '--reporter=line,json', `--output=${join(output, 'artifacts')}`], {
    cwd: root, encoding: 'utf8', env: { ...browserEnv, PLAYWRIGHT_JSON_OUTPUT_FILE: resultPath }, maxBuffer: 32 * 1024 * 1024,
  });
  writeFileSync(join(output, 'browser.log'), `${browser.stdout || ''}\n${browser.stderr || ''}`, { mode: 0o600, flag: 'wx' });
  // Preserve post-state even after failed Auth cases, while app and Redis are alive.
  let after, postError;
  try { after = qualify(); save('stack-after.json', after); } catch (error) { postError = error; save('stack-after-failure.json', { error: error.message, fullReleaseQualified: false }); }
  const sourceAfter = sourceInventory(root); save('source-end.json', sourceAfter);
  if (postError) throw postError;
  if (JSON.stringify(before) !== JSON.stringify(after) || JSON.stringify(source) !== JSON.stringify(sourceAfter)) throw new Error('Authority source/catalog/identity changed; retained evidence is unqualified.');
  const validated = validateReport(JSON.parse(readFileSync(resultPath, 'utf8')), profile);
  if (browser.error || browser.status !== 0) throw new Error(`Authority browser failed; retain ${output}.`);
  const result = { ...validated, primaryWindows: profile.primaryWindows, nativeExecuted: true, productionQualification: false, fullReleaseQualified: false };
  save('receipt.json', result); return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, root, work, ...extra] = process.argv.slice(2);
    if (extra.length) throw new Error('No arbitrary spec or profile overrides.');
    if (action === 'manifest' && !root) console.log(JSON.stringify(privateAuthorityProfile(), null, 2));
    else if (action === 'preflight' && root && !work) { preflight(privateAuthorityProfile(), resolve(root)); console.log('Fixed seven-case source preflight passed; native execution not claimed.'); }
    else if (action === 'run' && root && work) console.log(JSON.stringify(runPrivateAuthorityWindow(root, work), null, 2));
    else throw new Error('Use manifest, preflight <root>, or run <root> <fresh-owned-work>.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
