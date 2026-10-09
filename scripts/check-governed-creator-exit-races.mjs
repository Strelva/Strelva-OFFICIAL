// PREPARED UNRUN. Root coordinator owns a separately qualified disposable clone.
// No provider operation, commercial approval or production authority is inferred.
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startRetainedNativeChild } from './lib/retained-native-child.mjs';
import { assertBaseline } from './full-model-stack-qualification.mjs';
import { exactCreatorWait, exactForwardLedger, qualifiedCreatorClone, validateParentQualification, ownerSettingsCanonical, normalizedOwnerSettings, canonicalSchemaDump } from './lib/governed-creator-exit-proof.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [db, evidence, qualificationPath] = process.argv.slice(2);
const url = new URL(db || 'http://invalid'), database = decodeURIComponent(url.pathname.slice(1));
if (process.env.STRELVA_GOVERNED_CREATOR_EXIT_PROOF !== '1' || !['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.password || url.search || url.hash || !/^governed_creator_exit_[a-z0-9]+$/.test(database)) throw Error('Requires explicit opt-in and a password-free owned governed_creator_exit_ loopback clone.');
function privateFile(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path) throw Error('Private evidence paths must be absolute and canonical.');
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600) throw Error('Qualification evidence must be a private owned regular file.');
  return readFileSync(path);
}
if (!evidence || !isAbsolute(evidence) || resolve(evidence) !== evidence || existsSync(evidence)) throw Error('Requires a fresh canonical private evidence directory.');
const parent = dirname(evidence), stat = lstatSync(parent);
if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700 || realpathSync(parent) !== parent) throw Error('Evidence parent must be canonical, private and owned.');
const qualificationBytes = privateFile(qualificationPath || '');
const qualification = qualifiedCreatorClone(JSON.parse(qualificationBytes), database);
const parentQualificationBytes = privateFile(qualification.parentQualification);
const parentQualification = JSON.parse(parentQualificationBytes), parentOwnerSettingsBytes = privateFile(qualification.parentOwnerSettingsEvidence), parentOwnerSettings = JSON.parse(parentOwnerSettingsBytes);
const baselinePath = join(parentQualification.current?.binding?.stack ?? '', 'full-model-bootstrap-baseline.json'), baselineBytes = privateFile(baselinePath), baseline = JSON.parse(baselineBytes);
if (assertBaseline(baseline, parentQualification.current).baselineSha256 !== parentQualification.baselineSha256) throw Error('Parent bootstrap baseline digest mismatch.');
mkdirSync(evidence, { mode: 0o700 });
const hash = value => createHash('sha256').update(value).digest('hex');
const outputs = [];
const retain = (name, value) => { writeFileSync(join(evidence, name), value, { mode: 0o600 }); if (!outputs.includes(name)) outputs.push(name); };
retain('clone-qualification.json', qualificationBytes); retain('parent-qualification.json', parentQualificationBytes); retain('parent-owner-settings.json', parentOwnerSettingsBytes); retain('parent-bootstrap-baseline.json', baselineBytes);
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
if (process.env.STRELVA_GOVERNED_CREATOR_EXIT_PASSWORD) env.PGPASSWORD = process.env.STRELVA_GOVERNED_CREATOR_EXIT_PASSWORD;
delete env.STRELVA_GOVERNED_CREATOR_EXIT_PASSWORD;
const args = [db, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'];
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const identifier = value => `"${String(value).replaceAll('"', '""')}"`;
const inventory = JSON.parse(readFileSync(join(root, 'scripts/sql/historical-forward-inventory.json'), 'utf8'));
const fixtureFiles = ['setup', 'holder', 'worker', 'observe'].map(kind => `tests/support/governed-creator-exit-race-${kind}.sql`);
const sourceFiles = ['scripts/check-governed-creator-exit-races.mjs', 'scripts/lib/governed-creator-exit-proof.mjs', 'scripts/lib/retained-native-child.mjs', 'scripts/sql/governed-creator-clone-state.sql', 'scripts/full-model-stack-qualification.mjs', 'scripts/check-workspace-target.mjs', 'scripts/full-model-journey-profile.mjs', 'scripts/journey-evidence-files.mjs', 'scripts/sql/governed-money-operations-contract.sql', 'scripts/sql/neutral-creator-version-money-contract.sql', 'scripts/sql/historical-forward-inventory.json', 'scripts/release-safety/batches.json', "scripts/sql/native-google-hash-portability-contract.sql", "scripts/sql/reward-durable-catalog-contract.sql", "supabase/migrations/rollback-20261021140100_native_google_hash_portability.sql", "supabase/migrations/rollback-20261022175000_reward_durable_mutations.sql", 'supabase/migrations/rollback-20261022172000_governed_money_operations.sql', ...fixtureFiles, ...inventory.forwardFiles.map(file => `supabase/migrations/${file}`)];
const snapshot = () => ({ files: Object.fromEntries(sourceFiles.map(path => [path, hash(readFileSync(join(root, path)))])), qualification: hash(privateFile(qualificationPath)), parentQualification: hash(privateFile(qualification.parentQualification)), parentOwnerSettings: hash(privateFile(qualification.parentOwnerSettingsEvidence)), parentBootstrapBaseline: hash(privateFile(baselinePath)) });
const sourceBefore = snapshot(); retain('source-before.json', JSON.stringify(sourceBefore, null, 2));
const parentCurrent = validateParentQualification(parentQualification, inventory, sourceBefore.files, qualification);
if (parentOwnerSettings.format !== 1 || parentOwnerSettings.fullReleaseQualified !== false || parentOwnerSettings.databaseUrlSha256 !== parentCurrent.binding.databaseUrlSha256 || parentOwnerSettings.ownerSettingsSha256 !== hash(ownerSettingsCanonical(parentOwnerSettings.state)) || parentOwnerSettings.state.systemIdentifier !== parentCurrent.databaseIdentity.systemIdentifier || String(parentOwnerSettings.state.database.oid) !== parentCurrent.databaseIdentity.databaseOid || parentOwnerSettings.state.database.datname !== parentCurrent.databaseIdentity.database) throw Error('Parent raw owner/settings sidecar is not bound to the qualified parent database.');
const children = new Set();
function processSql(name, command = 'psql', processArgs = args) { const child = startRetainedNativeChild(name, { spawn, args: processArgs, env, retain, command }); children.add(child); return child; }
function successful(result) { return result.closed && result.code === 0 && !result.signal && !result.error && !result.timedOut; }
async function run(name, sql) { const child = processSql(name); child.child.stdin.end(`${sql}\n`); const result = await child.completed; if (!successful(result)) throw Error(`${name}: native SQL failed; retained exact process/log identifies code, signal and error.`); return result.stdout; }
async function nativeCapture(name, command, commandArgs) {
  const child = processSql(name, command, commandArgs); child.child.stdin.end(); const result = await child.completed;
  if (!successful(result)) throw Error(`${name}: native capture failed; retained raw process diagnostics.`);
  return child.output(); // exact untrimmed dump bytes, including final newline
}
const rolesSql = "select jsonb_build_object('roles',(select jsonb_agg(jsonb_build_object('name',rolname,'super',rolsuper,'inherit',rolinherit,'createRole',rolcreaterole,'createDb',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,'bypassRls',rolbypassrls,'config',rolconfig) order by rolname) from pg_roles),'membership',(select coalesce(jsonb_agg(jsonb_build_object('role',r.rolname,'member',m.rolname,'grantor',g.rolname,'admin',a.admin_option,'inherit',a.inherit_option,'set',a.set_option) order by r.rolname,m.rolname,g.rolname),'[]'::jsonb) from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles m on m.oid=a.member join pg_roles g on g.oid=a.grantor))";
async function captureClone(phase) {
  const state = JSON.parse(await run(`${phase}-owner-static-settings`, readFileSync(join(root, 'scripts/sql/governed-creator-clone-state.sql'), 'utf8')));
  const roles = JSON.parse(await run(`${phase}-roles`, rolesSql));
  const dumpVersion = (await nativeCapture(`${phase}-dump-version`, 'pg_dump', ['--version'])).trim();
  const schema = canonicalSchemaDump(await nativeCapture(`${phase}-schema`, 'pg_dump', ['--dbname', db, '--schema-only']));
  const ledger = JSON.parse(await run(`${phase}-full-ledger`, "select coalesce(jsonb_agg(to_jsonb(m) order by version),'[]'::jsonb) from supabase_migrations.schema_migrations m"));
  const metadata = { state, ownerSettingsSha256: hash(ownerSettingsCanonical(state)), normalizedOwnerSettingsSha256: hash(ownerSettingsCanonical(normalizedOwnerSettings(state))), rolesSha256: hash(JSON.stringify(roles)), catalogSha256: hash(schema), dumpVersion, ledger };
  retain(`${phase}-actual-clone.json`, JSON.stringify(metadata, null, 2)); retain(`${phase}-canonical-schema.sql`, schema); retain(`${phase}-roles.json`, JSON.stringify(roles, null, 2));
  if (state.database.datname !== database || state.ownerName !== qualification.databaseOwner || state.systemIdentifier !== parentCurrent.databaseIdentity.systemIdentifier || metadata.ownerSettingsSha256 !== qualification.ownerSettingsSha256 || metadata.normalizedOwnerSettingsSha256 !== qualification.databaseSettingsSha256 || metadata.normalizedOwnerSettingsSha256 !== hash(ownerSettingsCanonical(normalizedOwnerSettings(parentOwnerSettings.state))) || metadata.catalogSha256 !== parentCurrent.catalogSha256 || metadata.catalogSha256 !== qualification.cloneSchemaSha256 || metadata.rolesSha256 !== parentCurrent.rolesSha256 || dumpVersion !== parentCurrent.dumpVersion || JSON.stringify(ledger) !== JSON.stringify(parentCurrent.ledger)) throw Error(`${phase}: actual database schema/roles/owner/static-settings/ledger differ from qualified parent or clone evidence.`);
  return metadata;
}
async function closeChildren(owned = [...children]) {
  for (const child of owned) if (!child.done()) child.terminate();
  const results = await Promise.allSettled(owned.map(child => child.completed));
  if (results.some(result => result.status !== 'fulfilled') || owned.some(child => !child.done())) throw Error('Owned child CLOSE unconfirmed; qualification receipt refused.');
}
async function waitUntil(check, message) { const end = Date.now() + 5000; while (Date.now() < end) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 25)); } throw Error(message); }
const forward = join(root, 'supabase/migrations/20261022172000_governed_money_operations.sql'), inverse = join(root, 'supabase/migrations/rollback-20261022172000_governed_money_operations.sql');
const signature = 'public.register_governed_creator_listing(uuid,text,jsonb)';
const catalogSql = "select p.oid::regprocedure::text||'|'||md5(pg_get_functiondef(p.oid))||'|'||p.proowner||'|'||coalesce(p.proacl::text,'') from pg_proc p where p.pronamespace='public'::regnamespace order by 1";
const ledgerSql = "select coalesce(jsonb_agg(version::text order by version::text),'[]'::jsonb) from supabase_migrations.schema_migrations";
const historySql = "select 'agreement|'||id||'|'||md5(to_jsonb(a)::text) from public.money_agreements a where beneficiary_workspace_id='d1720000-0000-4000-8000-000000000020' union all select 'exit|'||id||'|'||md5(to_jsonb(e)::text) from public.workspace_exit_requests e where workspace_id='d1720000-0000-4000-8000-000000000020' order by 1";
let status = 'failed', error, installedLedger, owner, cloneBefore, cloneAfter, sequence = 0;
try {
  cloneBefore = await captureClone('before');
  const databaseFacts = JSON.parse(await run('database-binding', "select jsonb_build_object('database',current_database(),'owner',pg_get_userbyid(datdba)) from pg_database where datname=current_database()"));
  if (databaseFacts.database !== database || databaseFacts.owner !== qualification.databaseOwner) throw Error('Actual database identity/owner differs from qualified clone.');
  retain('database-binding.json', JSON.stringify(databaseFacts, null, 2));
  installedLedger = JSON.parse(await run('installed-forward-ledger', ledgerSql));
  const expected = exactForwardLedger(inventory, installedLedger); retain('installed-forward-ledger.json', JSON.stringify({ expected, installed: installedLedger }, null, 2));
  const owners = JSON.parse(await run('canonical-port-owners', "select jsonb_agg(distinct pg_get_userbyid(proowner)) from pg_proc where pronamespace='public'::regnamespace and proname in('record_governed_money_configuration','read_governed_money_configuration','read_governed_money_preparation','prepare_governed_collection_terms','register_governed_creator_listing','assert_governed_payout_dispatch')"));
  if (!Array.isArray(owners) || owners.length !== 1 || typeof owners[0] !== 'string') throw Error('Canonical producer owners differ; qualification refused.');
  owner = owners[0]; retain('canonical-port-owners.json', JSON.stringify({ owners, owner }, null, 2));
  // SET ROLE uses the actually observed canonical migrator; privileged probe
  // mutations are separate and never redefine what the canonical owner is.
  await run('source-contract', `set role ${identifier(owner)};\n\\i ${root}/scripts/sql/governed-money-operations-contract.sql`);
  await run('neutral-source-contract', `set role ${identifier(owner)};\n\\i ${root}/scripts/sql/neutral-creator-version-money-contract.sql`);
  await run('current-native-google-hash-portability-contract', `set role ${identifier(owner)};\n\\i ${root}/scripts/sql/native-google-hash-portability-contract.sql`);
  await run('current-reward-durable-catalog-contract', `set role ${identifier(owner)};\n\\i ${root}/scripts/sql/reward-durable-catalog-contract.sql`);
  if (await run('fixture-collision', "select exists(select 1 from public.users where id::text like 'd1720000-%') or exists(select 1 from public.offering_package_sources where definition_id='private_staff_requests' and definition_version='1.0.0')") !== 'f') throw Error('Requires a fresh fictional fixture scope; existing rows are not replaced.');
  await run('fixture-setup', `\\i ${root}/${fixtureFiles[0]}`);
  // Establish that the exact listing command was admissible before exit,
  // without retaining a listing that could disguise a failed new admission.
  const initialSql = readFileSync(join(root, fixtureFiles[2]), 'utf8').replace('commit;', 'rollback;');
  const initialListing = JSON.parse((await run('initial-listing-admission', initialSql)).split('\n').at(-1));
  if (!initialListing.id || initialListing.creatorWorkspaceId !== 'd1720000-0000-4000-8000-000000000020' || initialListing.definitionId !== 'private_staff_requests' || initialListing.agreementVersion !== 'fictional-gm-written-agreement') throw Error('Initial exact creator listing was not admitted.');
  retain('initial-listing-admission.json', JSON.stringify(initialListing, null, 2));
  if (await run('initial-listing-rollback', "select count(*) from public.creator_listings where creator_workspace_id='d1720000-0000-4000-8000-000000000020'") !== '0') throw Error('Initial admission rehearsal retained a listing.');
  const historyBefore = await run('history-before-race', historySql);
  const holder = processSql('creator-exit-holder'); let worker;
  try {
    holder.child.stdin.write(readFileSync(join(root, fixtureFiles[1]), 'utf8') + '\n');
    await waitUntil(() => holder.output().includes('GOVERNED_CREATOR_EXIT_HELD|'), 'Holder did not complete exit and acquire its live workspace lock.');
    const holding = JSON.parse(holder.output().split('\n').find(line => line.startsWith('GOVERNED_CREATOR_EXIT_HELD|')).slice('GOVERNED_CREATOR_EXIT_HELD|'.length));
    if (!Number.isInteger(holding.holderPid) || holding.holderPid <= 0 || !/^[0-9]+$/.test(holding.holderXid) || holding.workspaceId !== 'd1720000-0000-4000-8000-000000000020') throw Error('Actual holder backend/transaction/workspace identity invalid.');
    const app = `governed-creator-exit-${randomUUID()}`; retain('holder-binding.json', JSON.stringify({ ...holding, applicationName: app }, null, 2));
    worker = processSql('creator-listing-worker');
    const workerSql = readFileSync(join(root, fixtureFiles[2]), 'utf8').replace("set application_name='governed_creator_exit_worker';", `set application_name=${literal(app)};select 'GOVERNED_CREATOR_WORKER_PID|'||pg_backend_pid();`);
    worker.child.stdin.end(workerSql + '\n');
    await waitUntil(() => worker.output().includes('GOVERNED_CREATOR_WORKER_PID|'), 'Actual worker PID was not observed.');
    const workerPid = Number(worker.output().split('\n').find(line => line.startsWith('GOVERNED_CREATOR_WORKER_PID|')).slice('GOVERNED_CREATOR_WORKER_PID|'.length));
    if (!Number.isInteger(workerPid) || workerPid <= 0) throw Error('Worker backend identity invalid.');
    let witness;
    await waitUntil(async () => {
      const row = await run(`creator-wait-${++sequence}`, `select coalesce((select jsonb_build_object('workerPid',w.pid,'workerApplication',w.application_name,'workerXactStart',w.xact_start,'holderPid',${holding.holderPid},'holderXid',${literal(holding.holderXid)},'blockingPids',pg_blocking_pids(w.pid),'observedAt',clock_timestamp(),'blockedOnHolder',${holding.holderPid}=any(pg_blocking_pids(w.pid)),'matchingHolderXidWait',exists(select 1 from pg_locks l where l.pid=w.pid and l.locktype='transactionid' and l.transactionid::text=${literal(holding.holderXid)} and l.mode='ShareLock' and not l.granted),'workspaceRelationHeld',exists(select 1 from pg_locks l where l.pid=w.pid and l.relation='public.workspaces'::regclass and l.mode='RowShareLock' and l.granted),'holderRelationHeld',exists(select 1 from pg_locks l where l.pid=h.pid and l.relation='public.workspaces'::regclass and l.mode='RowShareLock' and l.granted),'holderTransactionAlive',h.backend_xid::text=${literal(holding.holderXid)} and h.state='idle in transaction') from pg_stat_activity w cross join pg_stat_activity h where w.pid=${workerPid} and w.application_name=${literal(app)} and w.wait_event_type='Lock' and h.pid=${holding.holderPid})::text,'')`);
      if (!row) return false; witness = JSON.parse(row); return exactCreatorWait(witness, holding, workerPid, app);
    }, 'Exact holder PID/xid/workspace relation wait was never observed.');
    retain('creator-exit-wait-witness.json', JSON.stringify(witness, null, 2));
    holder.child.stdin.end('commit;\n'); const held = await holder.completed;
    if (!successful(held)) throw Error('Actual holder exit commit failed.');
    const refused = await worker.completed;
    if (refused.code !== 3 || refused.signal || refused.error || refused.timedOut || !refused.closed || !refused.stderr.includes('workspace_exit_future_work_blocked')) throw Error('Listing did not refuse completed exit after the observed lock wait.');
  } finally { await closeChildren([holder, worker].filter(Boolean)); }
  const after = JSON.parse(await run('creator-exit-readback', "select jsonb_build_object('completedExit',public.workspace_exit_completed('d1720000-0000-4000-8000-000000000020'),'creatorListingCount',(select count(*) from public.creator_listings where creator_workspace_id='d1720000-0000-4000-8000-000000000020'),'retainedAgreementCount',(select count(*) from public.money_agreements where beneficiary_workspace_id='d1720000-0000-4000-8000-000000000020' and version='fictional-gm-written-agreement'))"));
  retain('creator-exit-readback.json', JSON.stringify(after, null, 2));
  if (after.completedExit !== true || after.creatorListingCount !== 0 || after.retainedAgreementCount !== 1) throw Error('Exit/listing/history readback invalid.');
  const retainedHistory = await run('history-before-inverse', historySql);
  if (!retainedHistory.includes(historyBefore)) throw Error('Previously recorded agreement history changed during exit.');
  const baseline = await run('catalog-before-probes', catalogSql);
  const probeRole = `gm_creator_probe_${randomUUID().replaceAll('-', '')}`;
  for (const [label, mutation, packet, expected] of [
    ['forward-existing-signature', '', forward, 'governed_money_unsupported_baseline'],
    ['inverse-custom-acl', `create role ${identifier(probeRole)};grant execute on function ${signature} to ${identifier(probeRole)};`, inverse, 'governed_money_acl_drift'],
    ['inverse-grant-option', `grant execute on function ${signature} to service_role with grant option;`, inverse, 'governed_money_acl_drift'],
    ['inverse-owner', `alter function ${signature} owner to service_role;`, inverse, 'governed_money_catalog_drift'],
    ['inverse-properties', `alter function ${signature} parallel safe;`, inverse, 'governed_money_catalog_drift'],
    ['inverse-body', `update pg_proc set prosrc='begin return null;end' where oid='${signature}'::regprocedure;`, inverse, 'governed_money_catalog_drift'],
    ['inverse-overload', "create function public.register_governed_creator_listing(text) returns jsonb language sql as 'select null::jsonb';", inverse, 'governed_money_catalog_drift'],
  ]) {
    const probe = processSql(label); probe.child.stdin.end(`begin;${mutation}set role ${identifier(owner)};select 'GOVERNED_PROBE_PREPARED';\n\\i ${packet}\n`); const result = await probe.completed;
    if (result.code !== 3 || result.signal || result.error || result.timedOut || !result.closed || !result.stdout.includes('GOVERNED_PROBE_PREPARED') || !result.stderr.includes(expected)) throw Error(`${label}: exact atomic refusal not observed.`);
    if (await run(`${label}-catalog-after`, catalogSql) !== baseline || await run(`${label}-history-after`, historySql) !== retainedHistory) throw Error(`${label}: refused packet changed catalog/history.`);
  }
  await run('legitimate-inverse', `set role ${identifier(owner)};\n\\i ${inverse}`);
  if (await run('removed-new-port', `select to_regprocedure('${signature}') is null`) !== 't' || await run('history-after-inverse', historySql) !== retainedHistory) throw Error('Legitimate inverse removal/history mismatch.');
  await run('legitimate-reapply', `set role ${identifier(owner)};\n\\i ${forward}`);
  await run('reapplied-source-contract', `set role ${identifier(owner)};\n\\i ${root}/scripts/sql/governed-money-operations-contract.sql`);
  await run('reapplied-neutral-source-contract', `set role ${identifier(owner)};\n\\i ${root}/scripts/sql/neutral-creator-version-money-contract.sql`);
  await run('reapplied-native-google-hash-portability-contract', `set role ${identifier(owner)};\n\\i ${root}/scripts/sql/native-google-hash-portability-contract.sql`);
  await run('reapplied-reward-durable-catalog-contract', `set role ${identifier(owner)};\n\\i ${root}/scripts/sql/reward-durable-catalog-contract.sql`);
  if (await run('catalog-after-reapply', catalogSql) !== baseline || await run('history-after-reapply', historySql) !== retainedHistory) throw Error('Reapply changed catalog or retained history.');
  const ledgerAfter = JSON.parse(await run('ledger-after-reapply', ledgerSql));
  if (JSON.stringify(ledgerAfter) !== JSON.stringify(installedLedger)) throw Error('Inverse/reapply changed ledger identity.');
  cloneAfter = await captureClone('end');
  if (JSON.stringify(cloneAfter) !== JSON.stringify(cloneBefore)) throw Error('Actual clone metadata/schema/roles/ledger changed across execution.');
  status = 'passed';
} catch (failure) { error = failure instanceof Error ? failure.message : String(failure); process.exitCode = 1; }
finally {
  try {
    await closeChildren();
    if (cloneBefore && !cloneAfter) {
      try { cloneAfter = await captureClone('end'); } catch (captureFailure) { status = 'failed'; error ||= String(captureFailure); process.exitCode = 1; }
    }
    await closeChildren(); const sourceAfter = snapshot(); retain('source-end.json', JSON.stringify(sourceAfter, null, 2));
    const sourceUnchanged = JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter);
    if (!sourceUnchanged) { status = 'failed'; error ||= 'Source/qualification evidence changed during execution.'; process.exitCode = 1; }
    retain('receipt.json', JSON.stringify({ status, error, allOwnedChildrenClosed: true, sourceUnchanged, installedLedger, canonicalOwner: owner, cloneBefore, cloneAfter, actualCloneEndVerified: !!cloneAfter, nativeProviderQualified: false, fullStackQualifiedByHarness: false, cleanupOwner: 'root coordinator-owned disposable clone; no fixture deletion', sourceBefore, sourceAfter, artifacts: Object.fromEntries(outputs.map(name => [name, hash(readFileSync(join(evidence, name)))])) }, null, 2));
  } catch (cleanupFailure) { process.exitCode = 1; retain('cleanup-closure-failure.json', JSON.stringify({ status: 'failed', error, cleanupError: String(cleanupFailure), allOwnedChildrenClosed: false }, null, 2)); }
  if (process.exitCode) console.error('Creator exit qualification failed; retained private logs preserve the exact failure.');
}
