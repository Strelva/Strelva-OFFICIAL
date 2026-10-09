import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readOwnedJourneyFile } from './journey-evidence-files.mjs';

// Closed inclusion inventory. Environment cleaning in the runner is the other
// half of this contract: an unlisted inherited switch must never become live.
export const releaseSwitches = [
  'SYSTEMS_RELEASE', 'NEEDS_YOU_RELEASE', 'OWNER_ENTRY', 'BOOKING_STORE_WRITE',
  'MAKE_REAL_OWNER_LINK_RELEASE', 'INQUIRIES_RELEASE', 'INQUIRY_RECORDS', 'AGENCY_ADD_CLIENT_RELEASE',
  'WEBSITE_REBUILD_RELEASE', 'MAKE_REAL_LIVE', 'GOOGLE_MAKE_REAL_RELEASE',
  'CONNECTED_SITES_RELEASE', 'PUBLISHING_RELEASE', 'RECORD_GOOGLE_APPROVAL_POLICY',
  'BUNDLE_MAINTENANCE_RELEASE', 'OWNER_DECISION_LINKS_RELEASE', 'OWNER_INVITATIONS_RELEASE',
  'OWNER_INVITATION_CLAIM', 'OPERATOR_QUEUE_RELEASE', 'INTERNAL_TOOL_NOTICES_RELEASE',
  'CATALOG_REPORTS_RELEASE', 'NEWSLETTER_CONTACTS_RELEASE', 'NEWSLETTER_SENDER_RELEASE',
  'AGENCY_PROSPECTING_RELEASE', 'AGENCY_SIGNUP_RELEASE', 'AGENT_CHANNEL_RELEASE',
  'MCP_OAUTH', 'AGENT_INQUIRIES', 'AGENT_IDENTITY_LIMITS', 'AGENT_ABUSE_MONITOR',
  'FINITE_JOBS_RELEASE', 'APPROVAL_STORE_RELEASE', 'ASK_RELEASE', 'BACKGROUND_WORK_RELEASE',
  'PLANNING_ENABLED', 'CUSTOMERS_RELEASE', 'BUSINESS_RECORD_READS', 'BUSINESS_PAGES',
  'CLIENT_RECORDS_DUAL_WRITE', 'BOOKING_SETTINGS', 'BOOKING_AGENTS', 'BOOKING_AGENT_VISIBILITY',
  'BOOKING_MESSAGES', 'BOOKING_CALENDAR_BUSY', 'BOOKING_CALENDAR_MIRROR', 'BOOKING_CALENDAR_REVOKE',
  'BOOKING_MANAGE_PAGE', 'BOOKING_REMINDERS', 'BOOKING_OWNER_NOTICE', 'BOOKING_PROVIDER_PROOF',
  'BOOKING_RECORD_FALLBACK', 'INQUIRY_OUTCOMES', 'INQUIRY_OWNER_NOTICES', 'INQUIRY_REPLIES',
  'INQUIRY_BUSINESS_FACTS', 'INQUIRY_BOOKING_HANDOFF', 'BOOKING_INQUIRY_OFFERS',
  'BUSINESS_OUTCOME_REPORTS', 'EXPORT_SCHEMA_3', 'EXPORT_RECOVERY', 'EXIT_HANDOFF',
  'BUSINESS_BILLING', 'CONNECT', 'AGENT_PAYMENTS', 'REVENUE_SPLITS', 'PLATFORM_COLLECTION',
  'MONEY_RECONCILIATION', 'PROVIDER_CHANGE', 'SPLIT_PAYOUT_EXECUTION', 'SPLIT_PAYOUTS_DRY_RUN',
  'SANDBOX_RUNTIME_APPROVED', 'SANDBOX_2048MB_CONTRACT_APPROVED',
  'AGENT_PAYMENT_SELLER_TERMS_APPROVED', 'WEBSITE_MODEL_CALLS_ENABLED',
  'WEBSITE_BUSINESS_FACTS_ENABLED', 'WEBSITE_NATIVE_FACTS_ENABLED', 'PRODUCT_LEARNING_RELEASE',
].map(name => `STRELVA_${name}`);

const spec = (name, count = 1) => ({ file: `tests/${name}-authenticated-local.spec.ts`, count });
export const fullAcceptance = [
  { rung: 1, requires: ['measured-public-check-and-conversion'] },
  { rung: 2, requires: ['owner-reviewed-live-site-readback-and-undo', 'qualified-public-domain'] },
  { rung: 3, requires: ['google-grant-readback-recovery-undo', 'weekly-responsibility-proof'] },
  { rung: 4, requires: ['real-oauth-consent-refresh-revoke', 'native-claude-and-codex', 'public-agent-booking-confirmation'] },
  { rung: 5, requires: ['ordinary-neutral-agency-workflow', 'accepted-partner-payer-royalty-policy'] },
  { rung: 6, requires: ['native-operation-and-planning-receipts', 'qualified-sandbox-build-and-billing'] },
  { rung: 7, requires: ['unit-standards-access-review', 'licensed-idx-brokerage-operation'] },
  { rung: 8, requires: ['qualified-connect-spt-payment-settlement-recovery', 'accepted-financial-responsibilities'] },
];

// Accepted native identities. Changing the journey requires an explicit contract edit.
const nativeCaseTitles = {
  "tests/public-continuation-authenticated-local.spec.ts": [
    "a browser-held public brief survives Auth, requires an explicit destination, and stays private after import"
  ],
  "tests/public-website-continuation-authenticated-local.spec.ts": [
    "a confirmed public brief can start one owned website draft after Auth"
  ],
  "tests/account-continuity-authenticated-local.spec.ts": [
    "a public continuation reaches the selected customer business once and keeps unsafe input recoverable",
    "an invitation recipient can recover the exact return path, while an expired link stays terminal"
  ],
  "tests/website-creation-authenticated-local.spec.ts": [
    "website creation, preview, approval and revision persist at 1440px",
    "website creation, preview, approval and revision persist at 390px"
  ],
  "tests/agency-workflow-authenticated-local.spec.ts": [
    "ordinary agency adds a client, gets the owner's exact approval, publishes, and reads the receipt"
  ],
  "tests/agency-website-authoring-authenticated-local.spec.ts": [
    "customer grants one managed website draft, agency prepares it, and customer publishes then revokes"
  ],
  "tests/agency-application-authoring-authenticated-local.spec.ts": [
    "a named agency operator revises one assigned application and returns it for customer publication"
  ],
  "tests/application-use-authenticated-local.spec.ts": [
    "a verified staff recipient uses one released version while a candidate changes, then survives rollback and revocation",
    "a verified recipient edits a date record through a stale correction and recovers it",
    "ordinary agency template becomes a private native app, then a live app without copying preview records"
  ],
  "tests/application-installation-authenticated-local.spec.ts": [
    "independently owned businesses install and update definitions without copying customer records"
  ],
  "tests/operational-assignments-authenticated-local.spec.ts": [
    "an accepted member runs exact zero-cost work as themselves, then revocation and expiry stop the next effect"
  ],
  "tests/horizontal-operations-authenticated-local.spec.ts": [
    "approved budgeted work completes a native document edit and refuses another account",
    "native scheduling keeps one reservation identity through cancel, reschedule and retry",
    "scheduling, generated applications and two-source investigation persist with their native checks"
  ],
  "tests/standing-responsibilities-authenticated-local.spec.ts": [
    "admits two current saved checks as distinct finite jobs, replays a trigger, and gates a revoked job",
    "an owner can discover, create, and reopen ongoing work in the workspace"
  ],
  "tests/work-authority-authenticated-local.spec.ts": [
    "verified outside contribution survives review and loses access on revocation"
  ],
  "tests/agent-access-authenticated-local.spec.ts": [
    "an exact-work personal AI token can read and propose, then revocation stops both"
  ],
  "tests/workspace-exit-authenticated-local.spec.ts": [
    "owner records a local exit choice through the real Auth route and can still review its retained state"
  ],
  "tests/public-check-conversion-authenticated-local.spec.ts": [
    "a real anonymous URL check survives Auth and becomes private business evidence, an unverified System and a prepared Possibility"
  ],
  "tests/make-real-live-authenticated-local.spec.ts": [
    "a real owner reviews and makes native inquiry/app changes live, proves receipts and rollback, and sees booking's pending verification"
  ],
  "tests/agent-business-booking-authenticated-local.spec.ts": [
    "bounded issuer fixture: native owner context stays business-bound and current authority removal stops access",
    "native public booking discovery, disabled admission, scanner preview and status rate limits produce no booking effect"
  ],
  "tests/access-review-authenticated-local.spec.ts": [
    "real Auth organization review excludes inaccessible businesses and revokes current member authority with audit"
  ],
  "tests/units-standards-authenticated-local.spec.ts": [
    "real Auth Units bind business Versions, preserve owner decisions on standards and stop writes after authority withdrawal"
  ],
  "tests/investigation-history-authenticated-local.spec.ts": [
    "real owner pages committed investigation runs, retries an evicted exact request, and loses history access after revocation"
  ],
  "tests/workspace-export-v3-authenticated-local.spec.ts": [
    "owner downloads real schema-3 categories after exit pauses work; linked-tenant masking, retained history and withdrawn agency authority hold"
  ],
  "tests/client-records-cutover-authenticated-local.spec.ts": [
    "all 13 stores backfill with measured parity; real durable reads and writes survive owned Redis outage and refuse unqualified cutover"
  ],
  "tests/assistant-connections-authenticated-local.spec.ts": [
    "bounded issuer fixture: real Auth connection renewal stops after owner disconnect",
    "bounded issuer fixture: real Auth connection renewal stops after owner authority withdrawal"
  ],
  "tests/billing-payments-prerequisites-authenticated-local.spec.ts": [
    "native unpriced billing homes preserve payer authority and merchant prerequisites after access withdrawal"
  ]
};

const nativeSpecs = [
  spec('public-continuation'), spec('public-website-continuation'), spec('account-continuity', 2),
  spec('website-creation', 2), spec('agency-workflow'), spec('agency-website-authoring'),
  spec('agency-application-authoring'), spec('application-use', 3), spec('application-installation'),
  spec('operational-assignments'), spec('horizontal-operations', 3), spec('standing-responsibilities', 2),
  spec('work-authority'), spec('agent-access'), spec('workspace-exit'),
  // Required new native paths are deliberately not replaced by passing previews.
  spec('public-check-conversion'), spec('make-real-live'), spec('agent-business-booking', 2),
  spec('access-review'), spec('units-standards'), spec('investigation-history'), spec('workspace-export-v3'),
  spec('client-records-cutover'),
  spec('assistant-connections', 2), spec('billing-payments-prerequisites'),
].map(item => ({ ...item, cases: nativeCaseTitles[item.file].map(title => ({ title, project: 'desktop' })) }));
const providerSpecs = [
  spec('google-make-real'), spec('assistant-oauth'), spec('sandbox-application'),
  spec('connect-agent-payment'), spec('home-finder'), spec('native-planning-provider'),
];

export function journeyProfile(name, masterOff = false) {
  if (!['full-native', 'full-dark', 'full-provider'].includes(name)) throw new Error('Unknown full-model profile.');
  if (masterOff && name !== 'full-dark') throw new Error('Master-off belongs to full-dark only.');
  const env = Object.fromEntries(releaseSwitches.map(key => [key, '0']));
  Object.assign(env, {
    STRELVA_WORKSPACE_RELEASE: masterOff ? '0' : '1', STRELVA_LOCAL_AUTH_PROOF: '1',
    STRELVA_FULL_MODEL_PROFILE: name, STRELVA_FULL_MODEL_MASTER_OFF: masterOff ? '1' : '0',
    STRELVA_APPLICATION_USE_JOURNEY: '1', STRELVA_MAKE_REAL_LIVE_JOURNEY: '0', STRELVA_CLIENT_RECORDS_READ: '',
    STRELVA_BOOKING_STORE_READ: 'legacy', STRELVA_LEADS_READ: 'legacy', STRELVA_LEADS_AUTHORITY: 'legacy',
    CONTENT_SOURCE: 'postgres', TENANTS_SOURCE: 'postgres', DATA_SOURCE: 'postgres',
    EMAIL_SENDING_ENABLED: 'false', CUSTOMER_EMAIL_ENABLED: 'false', OPERATOR_EMAILS_ENABLED: 'false',
    PROSPECT_EMAILS_ENABLED: 'false', REB_DEV_UNGATED_ACCESS: '0', SCAFFOLD_DEV_UNGATED_ACCESS: '0',
    // Selecting Sandbox without approval is an intentional fail-closed dark test.
    STRELVA_CUSTOM_APPLICATION_BUILD_PROVIDER: name === 'full-dark' ? 'vercel-sandbox' : 'docker',
  });
  if (name === 'full-native') {
    // CONNECT exposes the native merchant-prerequisite read surface. The clean
    // runner supplies no Stripe keys or approved Connect liability profile;
    // onboarding/provider writes remain held under their own admission guards.
    for (const suffix of ['SYSTEMS_RELEASE', 'NEEDS_YOU_RELEASE', 'OWNER_ENTRY', 'BOOKING_STORE_WRITE',
      'MAKE_REAL_OWNER_LINK_RELEASE', 'INQUIRIES_RELEASE', 'INQUIRY_RECORDS', 'AGENCY_ADD_CLIENT_RELEASE', 'WEBSITE_REBUILD_RELEASE', 'AGENCY_PROSPECTING_RELEASE', 'AGENCY_SIGNUP_RELEASE',
      'MAKE_REAL_LIVE', 'CONNECTED_SITES_RELEASE', 'OWNER_DECISION_LINKS_RELEASE', 'OWNER_INVITATIONS_RELEASE',
      'OWNER_INVITATION_CLAIM', 'OPERATOR_QUEUE_RELEASE', 'FINITE_JOBS_RELEASE', 'APPROVAL_STORE_RELEASE',
      'AGENT_CHANNEL_RELEASE', 'MCP_OAUTH', 'AGENT_INQUIRIES', 'AGENT_IDENTITY_LIMITS', 'BOOKING_AGENTS', 'BOOKING_AGENT_VISIBILITY', 'BOOKING_SETTINGS',
      'BUSINESS_BILLING', 'CONNECT', 'BUSINESS_RECORD_READS', 'BUSINESS_PAGES', 'CUSTOMERS_RELEASE',
      'CLIENT_RECORDS_DUAL_WRITE', 'EXPORT_SCHEMA_3', 'EXPORT_RECOVERY', 'EXIT_HANDOFF',
      'BUSINESS_OUTCOME_REPORTS', 'INQUIRY_OUTCOMES']) env[`STRELVA_${suffix}`] = '1';
    Object.assign(env, { STRELVA_MAKE_REAL_LIVE_JOURNEY: '1', STRELVA_BOOKING_STORE_READ: 'postgres', STRELVA_LEADS_READ: 'postgres',
      STRELVA_LEADS_AUTHORITY: 'postgres', STRELVA_CLIENT_RECORDS_READ: 'spam_held,inquiry_timeline,inquiry_reply,inquiry_delivery,booking_config,account_grouping,orders,provider_connections,provider_metadata,reward_members,reward_transactions,threads,tenant_settings' });
  }
  return { name, masterOff, env, specs: name === 'full-native' ? nativeSpecs : name === 'full-provider' ? providerSpecs : [
    { ...spec('full-model-flags-off'), title: masterOff
      ? 'master workspace switch refuses additive effects through real Auth'
      : 'additive switches refuse authority and provider effects through real Auth' },
  ], acceptance: fullAcceptance, completionClaim: 'local-profile-only', providerActions: 'held' };
}

export function preflight(profile, root) {
  const missing = profile.specs.filter(item => !existsSync(join(root, item.file))).map(item => item.file);
  const reasons = missing.map(file => `Missing required spec: ${file}`);
  if (profile.name === 'full-provider') reasons.push('Provider/client actions remain held; a flag or fixture does not authorize qualification.');
  if (reasons.length) throw new Error(reasons.join('\n'));
  return true;
}

export function validateReport(report, profile) {
  const expected = new Map(profile.specs.map(item => [basename(item.file), item]));
  const observed = new Map();
  const identities = new Set();
  const problems = [];
  function visit(suite) {
    for (const item of suite.specs || []) {
      const file = basename(item.file || suite.file || '');
      const contract = expected.get(file);
      if (!contract) { problems.push(`Unlisted spec: ${file}`); continue; }
      if (contract.title && item.title !== contract.title) problems.push(`Unexpected case title: ${file}`);
      for (const test of item.tests || []) {
        const identity = JSON.stringify([file, item.title, test.projectName]);
        if (identities.has(identity)) problems.push(`Duplicate case identity: ${file}`);
        identities.add(identity);
        if (contract.cases && !contract.cases.some(expectedCase => expectedCase.title === item.title && expectedCase.project === test.projectName))
          problems.push(`Unexpected case or project identity: ${file}`);
        if (contract.title && test.projectName !== 'desktop') problems.push(`Unexpected project identity: ${file}`);
        const results = test.results || [];
        if (test.status !== 'expected' || results.length !== 1 || results[0].status !== 'passed'
          || (results[0].retry ?? 0) !== 0 || results[0].error || results[0].errors?.length)
          problems.push(`Nonpassing, skipped or repeated attempt: ${file}`);
        observed.set(file, (observed.get(file) || 0) + 1);
      }
    }
    for (const child of suite.suites || []) visit(child);
  }
  for (const suite of report.suites || []) visit(suite);
  const total = profile.specs.reduce((sum, item) => sum + item.count, 0);
  for (const [file, item] of expected) {
    if (observed.get(file) !== item.count) problems.push(`Required case count differs: ${file}`);
    for (const required of item.cases || []) if (!identities.has(JSON.stringify([file, required.title, required.project])))
      problems.push(`Missing required case identity: ${file}`);
  }
  if (!report.stats || report.stats.expected !== total || report.stats.skipped !== 0 || report.stats.unexpected !== 0
    || report.stats.flaky !== 0 || report.errors?.length) problems.push('Report statistics or global errors violate the closed manifest.');
  if (problems.length) throw new Error([...new Set(problems)].join('\n'));
  return { profile: profile.name, masterOff: profile.masterOff, passed: total,
    completionClaim: profile.completionClaim, fullReleaseQualified: false, remainingAcceptance: profile.acceptance };
}

export function parseLocalStackEnv(text) {
  const allowed = new Set(['STRELVA_AUTH_STACK_DIR', 'STRELVA_LOCAL_DB_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'PLAYWRIGHT_BASE_URL', 'NEXT_PUBLIC_APP_URL']);
  const values = {};
  for (const line of text.split('\n').filter(Boolean)) {
    const index = line.indexOf('=');
    const key = line.slice(0, index), value = line.slice(index + 1);
    if (index < 1 || !allowed.has(key) || Object.hasOwn(values, key) || /[\r\0]/.test(value)) throw new Error('Invalid owned stack environment.');
    values[key] = value;
  }
  for (const key of ['STRELVA_LOCAL_DB_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL']) {
    const url = new URL(values[key] || '');
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || (key === 'STRELVA_LOCAL_DB_URL'
      ? !['postgres:', 'postgresql:'].includes(url.protocol) : url.protocol !== 'http:')) throw new Error('Only loopback stack services are allowed.');
  }
  for (const key of ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!values[key] || /[\s]/.test(values[key])) throw new Error('Owned local Auth keys are required.');
  }
  if (!values.STRELVA_AUTH_STACK_DIR || !existsSync(join(values.STRELVA_AUTH_STACK_DIR, 'supabase/config.toml')))
    throw new Error('The owned Supabase configuration is missing.');
  if (!/project_id\s*=\s*"strelva-proof-[a-f0-9]{16}"/.test(readFileSync(join(values.STRELVA_AUTH_STACK_DIR, 'supabase/config.toml'), 'utf8')))
    throw new Error('Only the prepared disposable Auth project is permitted.');
  return values;
}

const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
export const shellEnvironment = env => Object.entries(env).map(([key, value]) => `export ${key}=${quote(value)}`).join('\n');

export function sourceInventory(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const files = [...new Set(git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0'))]
    .filter(file => /^(src\/|scripts\/|tests\/|supabase\/|package\.json$|pnpm-lock\.yaml$|next\.config\.|playwright\.config\.|tsconfig\.json$)/.test(file)).sort();
  const sourceFiles = files.map(file => ({ file, sha256: existsSync(join(root, file))
    ? createHash('sha256').update(readFileSync(join(root, file))).digest('hex') : null }));
  return { head: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), sourceFiles, fullReleaseQualified: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, name, input, variant] = process.argv.slice(2);
    const profile = journeyProfile(name, variant === 'master-off');
    if (action === 'env') console.log(shellEnvironment(profile.env));
    else if (action === 'specs') console.log(profile.specs.map(item => item.file).join('\n'));
    else if (action === 'manifest') console.log(JSON.stringify(profile, null, 2));
    else if (action === 'preflight') { preflight(profile, resolve(input || '.')); console.log('Closed profile preflight passed; no release qualification is implied.'); }
    else if (action === 'validate') console.log(JSON.stringify(validateReport(JSON.parse(readOwnedJourneyFile(dirname(resolve(input)),resolve(input))), profile), null, 2));
    else if (action === 'stack-env') console.log(shellEnvironment(parseLocalStackEnv(readFileSync(input, 'utf8'))));
    else if (action === 'source') console.log(JSON.stringify(sourceInventory(resolve(input || '.')), null, 2));
    else if (action === 'schema') console.log(JSON.stringify(readdirSync(input).filter(file => /^\d{14}_.*\.sql$/.test(file)).sort()
      .map(file => ({ file, sha256: createHash('sha256').update(readFileSync(join(input, file))).digest('hex') }))));
    else throw new Error('Unknown profile action.');
  } catch (error) { console.error(error instanceof Error ? error.message : 'Full-model profile failed.'); process.exitCode = 1; }
}
