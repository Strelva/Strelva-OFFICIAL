import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { journeyProfile, parseLocalStackEnv, preflight, sourceInventory, validateReport } from './full-model-journey-profile.mjs';

export function cleanupWindowProfile() {
  const native = journeyProfile('full-native');
  return { ...native, name: 'tenant-cleanup-recovery',
    env: { ...native.env, STRELVA_TENANT_CLEANUP_UI_PROOF: '1' },
    specs: [{ file: 'tests/tenant-cleanup-authenticated-local.spec.ts', count: 2,
      cases: [1440, 390].map(width => ({ project: 'desktop', title: `real super-admin retains pending removal and retries the exact native receipt at ${width}px` })) }],
    completionClaim: 'local-cleanup-recovery-only', providerActions: 'held',
    serverProfile: 'full-native', runnerOnlySwitches: ['STRELVA_TENANT_CLEANUP_UI_PROOF'],
  };
}

export function assertCleanupEnvironment(env, owned) {
  const native = journeyProfile('full-native');
  for (const [name, value] of Object.entries(native.env)) {
    if (env[name] !== value) throw new Error(`Cleanup window requires unchanged full-native environment: ${name}`);
  }
  for (const name of ['STRELVA_LOCAL_DB_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!owned[name] || env[name] !== owned[name]) throw new Error(`Cleanup window does not match the qualified owned stack: ${name}`);
  }
  const app = new URL(env.PLAYWRIGHT_BASE_URL || '');
  if (app.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(app.hostname)) throw new Error('Cleanup window requires the existing loopback app.');
  for (const [name, value] of Object.entries(env)) {
    if (value && /^(VERCEL_(API_TOKEN|TOKEN)|STRIPE_(SECRET_KEY|RESTRICTED_KEY)|RESEND_API_KEY|GOOGLE_CLIENT_SECRET|ANTHROPIC_API_KEY|OPENAI_API_KEY|AI_GATEWAY_API_KEY)$/.test(name)) throw new Error('Provider credentials are forbidden in the cleanup window.');
  }
  return true;
}

/** Called only while the full-native runner still owns its app/Redis/Auth stack.
 * Starts no app, database, Redis or Docker stack. Preserves its own exact report. */
export function runCleanupWindow(rootInput, workInput) {
  const root = resolve(rootInput), work = resolve(workInput);
  const native = journeyProfile('full-native'), profile = cleanupWindowProfile();
  preflight(profile, root);
  const owned = parseLocalStackEnv(readFileSync(join(work, 'env'), 'utf8'));
  assertCleanupEnvironment(process.env, owned);
  // The separate 2-case window never substitutes for, or promotes, the native
  // 34-case report. It can retain useful recovery evidence even if an unrelated
  // native case failed; the caller's original failure status remains unchanged.
  if (native.specs.reduce((sum, item) => sum + item.count, 0) !== 34
    || JSON.stringify(native) !== JSON.stringify(JSON.parse(readFileSync(join(work, 'manifest-native.json'), 'utf8')))) throw new Error('Unchanged exact native manifest is required.');
  let nativeReportState = { state: 'not-run', required: 34, fullReleaseQualified: false };
  if (existsSync(join(work, 'results-native.json'))) {
    try { nativeReportState = { state: 'passed', ...validateReport(JSON.parse(readFileSync(join(work, 'results-native.json'), 'utf8')), native) }; }
    catch { nativeReportState = { state: 'failed', required: 34, fullReleaseQualified: false, evidence: '../results-native.json' }; }
  }
  const source = sourceInventory(root);
  if (JSON.stringify(source) !== JSON.stringify(JSON.parse(readFileSync(join(work, 'source.json'), 'utf8')))) throw new Error('Source changed after native proof.');
  const output = join(work, 'tenant-cleanup-recovery');
  if (existsSync(output)) throw new Error('Cleanup recovery evidence already exists; use a new owned proof directory.');
  mkdirSync(output, { mode: 0o700 });
  const save = (name, data) => writeFileSync(join(output, name), JSON.stringify(data, null, 2), { mode: 0o600 });
  save('manifest.json', profile); save('source.json', source); save('native-contract.json', native); save('native-report-state.json', nativeReportState);
  const qualify = () => JSON.parse(execFileSync(process.execPath,
    [join(root, 'scripts/full-model-stack-qualification.mjs'), 'verify', root, join(work, 'env')], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 }));
  save('stack-before.json', qualify());
  const resultPath = join(output, 'results.json');
  const browser = spawnSync('pnpm', ['exec', 'playwright', 'test', profile.specs[0].file,
    '--workers=1', '--retries=0', '--reporter=line,json', `--output=${join(output, 'artifacts')}`], {
    cwd: root, encoding: 'utf8', env: { ...process.env, STRELVA_TENANT_CLEANUP_UI_PROOF: '1', PLAYWRIGHT_JSON_OUTPUT_FILE: resultPath },
    maxBuffer: 16 * 1024 * 1024,
  });
  writeFileSync(join(output, 'browser.log'), `${browser.stdout || ''}\n${browser.stderr || ''}`, { mode: 0o600 });
  let receipt;
  try { receipt = validateReport(JSON.parse(readFileSync(resultPath, 'utf8')), profile); }
  catch (error) { throw new Error(`Cleanup recovery report rejected; retain ${output}: ${error.message}`); }
  if (browser.error || browser.status !== 0) throw new Error(`Cleanup recovery browser failed; retain ${output}.`);
  save('stack-after.json', qualify());
  const after = sourceInventory(root); save('source-end.json', after);
  if (JSON.stringify(source) !== JSON.stringify(after)) throw new Error('Source changed during cleanup recovery; no qualification retained.');
  save('receipt.json', receipt);
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, root, work] = process.argv.slice(2);
    if (action === 'preflight' && root) { preflight(cleanupWindowProfile(), resolve(root)); console.log('Closed cleanup recovery preflight passed; no execution or qualification.'); }
    else if (action === 'manifest') console.log(JSON.stringify(cleanupWindowProfile(), null, 2));
    else if (action === 'run' && root && work) console.log(JSON.stringify(runCleanupWindow(root, work), null, 2));
    else throw new Error('Use manifest, or run <source-root> <owned-full-native-work>.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
