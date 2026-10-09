import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { retainJourneyEnd, withJourneyAdmission, browserWasStarted } from './journey-evidence-retention.mjs';
import { readOwnedJourneyFile, writeOwnedJourneyFile } from './journey-evidence-files.mjs';
import { journeyProfile, parseLocalStackEnv, preflight, validateReport } from './full-model-journey-profile.mjs';
import { assertCleanupEnvironment } from './tenant-cleanup-journey-window.mjs';

const fixedSpec = 'tests/email-only-owner-authenticated-local.spec.ts';
export function noLoginWindowProfile() {
  const native = journeyProfile('full-native');
  return { ...native, name: 'no-login-local', env: { ...native.env },
    specs: [{ file: fixedSpec, count: 2, cases: [
      'an owner who never signs in decides a booking request by email link only',
      'an owner without an account approves Make real by email link',
    ].map(title => ({ title, project: 'desktop' })) }],
    completionClaim: 'local-no-login-signed-link-only', providerActions: 'held',
    serverProfile: 'full-native', runnerOnlySwitches: [], emailDelivery: 'held',
  };
}

/** Parse only the runner's generated assignments, never source them as code. */
export function parseNoLoginRuntime(text) {
  const allowed = new Set([...Object.keys(journeyProfile('full-native').env),
    'STRELVA_AUTH_STACK_DIR', 'STRELVA_LOCAL_DB_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'PLAYWRIGHT_BASE_URL', 'NEXT_PUBLIC_APP_URL',
    'NEXT_PUBLIC_SITES_PATH_ORIGIN', 'PLAYWRIGHT_DIST_DIR', 'STRELVA_BUILD_CACHE', 'APPROVE_LINK_SECRET', 'CRON_SECRET', 'SECRETS_ENC_KEY',
    'PUBLIC_CONTINUATION_SECRET', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']);
  const env = {}, overrides = new Set();
  for (const line of text.split('\n').filter(Boolean)) {
    const match = /^(?:export )?([A-Z][A-Z0-9_]*)=(?:'([^'\r\0]*)'|([^'"\s\r\0]*))$/.exec(line);
    if (!match || !allowed.has(match[1])) throw new Error('Invalid owned no-login runtime assignment.');
    const key = match[1], value = match[2] ?? match[3];
    if (Object.hasOwn(env, key)) {
      if (!['PLAYWRIGHT_BASE_URL', 'NEXT_PUBLIC_APP_URL'].includes(key) || overrides.has(key)) throw new Error('Duplicate owned no-login runtime assignment.');
      overrides.add(key);
    }
    env[key] = value;
  }
  return env;
}

export function assertNoLoginEnvironment(env, owned, runtime) {
  assertCleanupEnvironment(env, owned);
  for (const [key, value] of Object.entries(runtime)) if (env[key] !== value) throw new Error(`No-login window differs from the owned server runtime: ${key}`);
  for (const key of ['STRELVA_AUTH_STACK_DIR', 'APPROVE_LINK_SECRET', 'CRON_SECRET', 'SECRETS_ENC_KEY',
    'PUBLIC_CONTINUATION_SECRET', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'PLAYWRIGHT_BASE_URL', 'NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_SITES_PATH_ORIGIN']) {
    if (!runtime[key]) throw new Error(`No-login window requires the owned server runtime: ${key}`);
  }
  if (env.STRELVA_AUTH_STACK_DIR !== owned.STRELVA_AUTH_STACK_DIR) throw new Error('No-login window requires the qualified owned Auth stack.');
  for (const key of ['PLAYWRIGHT_BASE_URL', 'NEXT_PUBLIC_APP_URL', 'UPSTASH_REDIS_REST_URL']) {
    const url = new URL(env[key]);
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname) || !url.port || url.username || url.password || url.search || url.hash)
      throw new Error(`No-login window requires an owned loopback origin: ${key}`);
  }
  if (env.NEXT_PUBLIC_APP_URL !== new URL(env.PLAYWRIGHT_BASE_URL).origin) throw new Error('No-login signed links must use the owned app origin.');
  // The primary native runner uses the separate owned sites host on this app's
  // exact port. Accepting its assignment never permits an external sites host.
  const sites = new URL(env.NEXT_PUBLIC_SITES_PATH_ORIGIN);
  const appPort = new URL(env.PLAYWRIGHT_BASE_URL).port;
  if (env.NEXT_PUBLIC_SITES_PATH_ORIGIN !== `http://sites.localhost:${appPort}`
    || sites.protocol !== 'http:' || sites.hostname !== 'sites.localhost' || sites.port !== appPort
    || sites.username || sites.password || sites.pathname !== '/' || sites.search || sites.hash)
    throw new Error('No-login window requires the exact owned separate sites origin.');
  for (const [key, value] of Object.entries(env)) if (value && (/SMTP/i.test(key) || /^(EMAIL_PROVIDER_API_KEY|SENDGRID_API_KEY|MAILGUN_API_KEY|POSTMARK_SERVER_TOKEN|BREVO_API_KEY)$/.test(key)))
    throw new Error('Mail transport configuration is forbidden in the no-login window.');
  return true;
}

export function assertNoLoginAuthConfiguration(text) {
  if (!/^\[local_smtp\]\s*\nenabled\s*=\s*false\s*$/m.test(text) || /^\[auth\.email\.smtp\]/m.test(text))
    throw new Error('No-login qualification requires local SMTP disabled and no Auth SMTP transport.');
  return true;
}

export function redactNoLoginEvidence(value, env) {
  const secrets = Object.entries(env).filter(([key, value]) => value && /(?:SECRET|TOKEN|KEY|STRELVA_LOCAL_DB_URL)$/.test(key)).map(([, value]) => value);
  const redact = text => {
    for (const secret of secrets) text = text.split(secret).join('[redacted-local-secret]');
    return text.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted-token]')
      .replace(/([?&](?:token|signature|sig|code|access_token|refresh_token)=)[^&#\s]+/gi, '$1[redacted-link-token]');
  };
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map(item => redactNoLoginEvidence(item, env));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactNoLoginEvidence(item, env)]));
  return value;
}

export function noLoginReportEvidence(raw, runtime) {
  try {
    const report = JSON.parse(raw);
    return { report, evidence: redactNoLoginEvidence(report, runtime) };
  } catch {
    return { report: null, evidence: { malformed: true, fullReleaseQualified: false,
      reason: 'The browser report was not valid JSON.', redactedExcerpt: redactNoLoginEvidence(raw, runtime).slice(0, 16_384) } };
  }
}

/** Guard the actual report before interpreting or rewriting its bytes. */
export function retainNoLoginReport(work, output, rawResult, runtime) {
  const { report,evidence } = noLoginReportEvidence(readOwnedJourneyFile(work,rawResult),runtime);
  writeOwnedJourneyFile(work,rawResult,JSON.stringify(evidence,null,2),{ replace:true });
  writeOwnedJourneyFile(work,join(output,'results.json'),JSON.stringify(evidence,null,2));
  return report;
}

/** The child sees only the finite OS baseline and this owner's parsed runtime.
 * PGOPTIONS, SDK secrets, preloads and arbitrary inherited switches stay out. */
export function noLoginChildEnvironment(parent, runtime) {
  const os = Object.fromEntries(['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR'].filter(key => parent[key]).map(key => [key, parent[key]]));
  return { ...os, LC_ALL: 'C', ...parseNoLoginRuntime(Object.entries(runtime).map(([key, value]) => `export ${key}='${value}'`).join('\n')) };
}

/** Fixed two-case window while the owning native runner keeps its stack alive.
 * No stack starts, native contract edits, arbitrary spec overrides or mail. */
export function runNoLoginWindow(rootInput, workInput) {
  const root = realpathSync(rootInput), work = realpathSync(workInput), native = journeyProfile('full-native'), profile = noLoginWindowProfile();
  if (!basename(work).startsWith('strelva-full-journeys.')) throw new Error('An owned full-native proof directory is required.');
  return withJourneyAdmission(work, 'no-login-local', profile, (output, update) => {
    preflight(profile, root);
    for (const file of ['.env', '.env.local', '.env.development', '.env.development.local']) if (existsSync(join(root, file))) throw new Error('No-login window refuses checkout environment files.');
    update('runtime-admission');
    const owned = parseLocalStackEnv(readFileSync(join(work, 'env'), 'utf8'));
    const runtime = parseNoLoginRuntime(readFileSync(join(work, 'runtime.env'), 'utf8'));
    assertNoLoginEnvironment(process.env, owned, runtime);
    const childEnv = noLoginChildEnvironment(process.env, runtime);
    assertNoLoginAuthConfiguration(readFileSync(join(owned.STRELVA_AUTH_STACK_DIR, 'supabase/config.toml'), 'utf8'));
    if (native.specs.reduce((sum, item) => sum + item.count, 0) !== 34
      || JSON.stringify(native) !== JSON.stringify(JSON.parse(readOwnedJourneyFile(work,join(work,'manifest-native.json'))))) throw new Error('Unchanged exact native manifest is required.');
    const captureSource = () => JSON.parse(execFileSync(process.execPath, [join(root, 'scripts/full-model-journey-profile.mjs'), 'source', 'full-native', root],
      { cwd: root, env: childEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 }));
    const source = captureSource();
    if (JSON.stringify(source) !== JSON.stringify(JSON.parse(readOwnedJourneyFile(work,join(work,'source.json'))))) throw new Error('Source changed after the native runner pin.');
    let nativeReportState = { state: 'not-run', required: 34, fullReleaseQualified: false };
    if (existsSync(join(work, 'results-native.json'))) {
      try { nativeReportState = { state: 'passed', ...validateReport(JSON.parse(readOwnedJourneyFile(work,join(work,'results-native.json'))), native) }; }
      catch { nativeReportState = { state: 'failed', required: 34, fullReleaseQualified: false, evidence: '../results-native.json' }; }
    }
    const save = (name,data) => writeOwnedJourneyFile(work,join(output,name),JSON.stringify(redactNoLoginEvidence(data,runtime),null,2));
    save('manifest.json', profile); save('source.json', source); save('native-contract.json', native); save('native-report-state.json', nativeReportState);
    const qualify = () => JSON.parse(execFileSync(process.execPath,
      [join(root, 'scripts/full-model-stack-qualification.mjs'), 'verify', root, join(work, 'env')], { cwd: root, env: childEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 }));
    save('stack-before.json', qualify());
    const rawResult = join(output, 'results-raw.json');
    update('browser');
    const browser = spawnSync('pnpm', ['exec', 'playwright', 'test', fixedSpec, '--workers=1', '--retries=0', '--reporter=line,json', `--output=${join(output, 'artifacts')}`], {
      cwd: root, encoding: 'utf8', env: { ...childEnv, PLAYWRIGHT_JSON_OUTPUT_FILE: rawResult }, maxBuffer: 16 * 1024 * 1024,
    });
    update('terminal-evidence',browserWasStarted(browser));
    writeOwnedJourneyFile(work,join(output,'browser.log'),redactNoLoginEvidence(`${browser.stdout || ''}\n${browser.stderr || ''}`,runtime));
    // Redact structured evidence before inventory and retain terminal observations
    // even when the report is missing, malformed or rejected.
    let report;
    try { report = retainNoLoginReport(work,output,rawResult,runtime); }
    catch { save('report-failure.json',{ reason:'browser-report-unreadable',fullReleaseQualified:false }); }
    const terminal = retainJourneyEnd({ work, output, sourceBefore: source, captureSource, qualify, browser,
      artifactDir: join(output, 'artifacts'), reportPath: join(output, 'results.json'), proofFiles: [output] });
    let receipt;
    try {
      if (!report) throw new Error('Malformed browser report.');
      receipt = validateReport(report, profile);
    } catch { throw new Error(`No-login report rejected; retain ${output}.`); }
    if (browser.error || browser.status !== 0) throw new Error(`No-login browser failed; retain ${output}.`);
    if (!terminal.retentionValidated) throw new Error('No-login terminal evidence is unqualified.');
    const heldReceipt = { ...receipt, emailDelivery: 'held', providerActions: 'held', realSentMailQualified: false };
    save('receipt.json', heldReceipt);
    return heldReceipt;
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, root, work, ...extra] = process.argv.slice(2);
    if (extra.length) throw new Error('No-login window accepts no spec or profile override.');
    if (action === 'manifest' && !root && !work) console.log(JSON.stringify(noLoginWindowProfile(), null, 2));
    else if (action === 'preflight' && root && !work) { preflight(noLoginWindowProfile(), resolve(root)); console.log('Closed no-login preflight passed; no Auth, mail or release qualification.'); }
    else if (action === 'run' && root && work) console.log(JSON.stringify(runNoLoginWindow(root, work), null, 2));
    else throw new Error('Use manifest, preflight <source-root>, or run <source-root> <owned-full-native-work>.');
  } catch { console.error('No-login window failed; retain the owned private proof artifacts.'); process.exitCode = 1; }
}
