// PREPARED, UNRUN: explicit owned loopback clone only. All rows are fictional.
// The coordinator retains this private evidence directory and owns DB cleanup.
import { spawn } from "node:child_process";
import { startRetainedNativeChild } from "./lib/retained-native-child.mjs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [db, evidence] = process.argv.slice(2);
const url = new URL(db || "http://invalid");
if (process.env.STRELVA_CHECKOUT_RACE_PROOF !== "1" || !["postgres:", "postgresql:"].includes(url.protocol) || !["127.0.0.1", "localhost"].includes(url.hostname) || url.password || !url.pathname.slice(1).startsWith("checkout_admission_") || url.search) throw new Error("Requires explicit checkout race opt-in and a password-free owned checkout_admission_ loopback clone.");
if (!evidence || !isAbsolute(evidence) || resolve(evidence) !== evidence || existsSync(evidence)) throw new Error("Requires a fresh canonical private evidence directory.");
const parent = dirname(evidence), stat = lstatSync(parent);
if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700 || realpathSync(parent) !== parent) throw new Error("Evidence parent must be canonical, private and owned by this user.");
mkdirSync(evidence, { mode: 0o700 });
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("PG")));
// A reviewed owned clone may require its private local credential. Keep it out
// of URL/argv and discard ambient libpq overrides before mapping this one secret.
if (process.env.STRELVA_CHECKOUT_RACE_PASSWORD) env.PGPASSWORD = process.env.STRELVA_CHECKOUT_RACE_PASSWORD;
delete env.STRELVA_CHECKOUT_RACE_PASSWORD;
const args = [db, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"];
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const inventory = JSON.parse(readFileSync(join(root, "scripts/sql/historical-forward-inventory.json"), "utf8"));
const sources = ["scripts/check-checkout-final-admission-races.mjs", "scripts/lib/retained-native-child.mjs", "scripts/sql/checkout-final-admission-contract.sql", "supabase/migrations/rollback-20261022171000_checkout_final_admission.sql", "scripts/sql/historical-forward-inventory.json", "scripts/sql/native-google-hash-portability-contract.sql", "scripts/sql/reward-durable-catalog-contract.sql", "scripts/sql/private-source-current-contract.sql", "supabase/migrations/rollback-20261022174000_private_source_exit_admission.sql", "supabase/migrations/rollback-20261022174500_private_source_exit_lock_order.sql", "supabase/migrations/rollback-20261021140100_native_google_hash_portability.sql", "supabase/migrations/rollback-20261022175000_reward_durable_mutations.sql", "scripts/release-safety/batches.json", ...inventory.forwardFiles.map(name => `supabase/migrations/${name}`)];
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const sourceSnapshot = () => Object.fromEntries(sources.map(path => [path, hash(readFileSync(join(root, path)))]));
const sourceBefore = sourceSnapshot();
const outputs = [];
const retain = (name, value) => { writeFileSync(join(evidence, name), value, { mode: 0o600 }); if (!outputs.includes(name)) outputs.push(name); };
retain("source-before.json", JSON.stringify(sourceBefore, null, 2));
const children = new Set();
function processSql(name) {
  const process = startRetainedNativeChild(name, { spawn, args, env, retain });
  children.add(process);
  return process;
}
async function closeOwnedChildren() {
  for (const process of children) if (!process.done()) process.terminate();
  const results = await Promise.allSettled([...children].map(process => process.completed));
  if (results.some(result => result.status !== 'fulfilled') || [...children].some(process => !process.done())) throw new Error('Owned child cleanup closure unconfirmed; final hash receipt refused.');
}
async function run(name, sql) {
  const process = processSql(name); process.child.stdin.end(sql + "\n"); const result = await process.completed;
  if (result.code !== 0 || result.signal || result.error || result.timedOut) throw new Error(`${name}: ${result.stderr}`); return result.stdout;
}
async function waitUntil(check, message) {
  const end = Date.now() + 5000;
  while (Date.now() < end) { if (await check()) return; await pause(25); }
  throw new Error(message);
}
let sequence = 0;
async function fixture(kind) {
  const owner = randomUUID(), manager = randomUUID(), business = randomUUID(), agency = randomUUID(), request = randomUUID(), booking = randomUUID();
  const token = randomBytes(32).toString("hex"), account = `acct_Checkout${randomBytes(6).toString("hex")}`;
  const ownerEmail = `checkout-${owner}@example.test`, managerEmail = `checkout-${manager}@example.test`;
  const agencyCase = kind.startsWith("agency");
  const sql = `
insert into public.users(id,email,verified_at) values('${owner}',${literal(ownerEmail)},clock_timestamp()),('${manager}',${literal(managerEmail)},clock_timestamp());
insert into public.workspaces(id,kind,name,created_by) values('${business}','customer','Fictional Checkout wait business','${owner}'),('${agency}','agency','Fictional Checkout wait agency','${manager}');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values('${business}','${owner}','owner','${owner}'),('${agency}','${manager}','owner','${manager}');
select public.ensure_native_business_billing_home('${business}');
select public.manage_connected_account('${agencyCase ? agency : business}','${agencyCase ? manager : owner}',${literal(agencyCase ? managerEmail : ownerEmail)},'reserve');
select public.record_connected_account('${agencyCase ? agency : business}',${literal(account)},array['merchant'],'fictional-native','{}','{}',true);
${agencyCase ? `
update public.accounts set payer_kind='agency',payer_workspace_id='${agency}' where workspace_id='${business}';
create temporary table ca_intent as select (public.agency_billing_intent_command(jsonb_build_object('action','propose','agencyWorkspaceId','${agency}','businessWorkspaceId','${business}','kind','pay_link','amountCents',1000,'currency','usd','description','Fictional exact native terms','idempotencyKey','fictional-wait-${request}'),'${manager}',${literal(managerEmail)})->>'id')::uuid id;
select public.agency_billing_intent_command(jsonb_build_object('action','accept','intentId',id,'businessWorkspaceId','${business}'),'${owner}',${literal(ownerEmail)}) from ca_intent;
select public.agency_billing_intent_command(jsonb_build_object('action','prepare','intentId',id),'${manager}',${literal(managerEmail)}) from ca_intent;
create temporary table ca_payment as select (public.reserve_business_payment('${agency}','agency-invoice:'||id::text,'pay_link',1000,'usd',id::text)->>'id')::uuid id from ca_intent;
` : `
${kind === "deposit cancellation" ? `insert into public.business_bookings(id,calendar_key,workspace_id,legacy_id,status,origin,service_name_at_booking,start_at,end_at,block_end_at,time_zone,customer_name,customer_email,recorded_via,created_at) values('${booking}','${business}','${business}','fictional-wait-${booking}','held','agent','Fictional consultation',clock_timestamp()+interval '4 days',clock_timestamp()+interval '4 days 30 minutes',clock_timestamp()+interval '4 days 30 minutes','UTC','Fictional customer','checkout@example.test','native',clock_timestamp());` : ""}
insert into public.business_payment_requests(id,workspace_id,kind,source_record_id,lines,amount_cents,currency,expires_at,token_hash,issued_by,idempotency_key) values('${request}','${business}','${kind === "deposit cancellation" ? "deposit" : "quote"}','${booking}','[{"name":"Fictional agreed work","quantity":1,"unitCents":1000}]',1000,'usd',clock_timestamp()+interval '${kind === "clock expiry" ? "5 seconds" : "1 hour"}','${token}','${owner}','fictional-wait-${request}');
select public.accept_public_payment_request('${token}');
create temporary table ca_payment as select id from public.business_payments where workspace_id='${business}' and idempotency_key='request:${request}';
`}
select public.claim_business_payment_channel(id,'checkout') from ca_payment;
select public.prepare_business_checkout(id) from ca_payment;
select jsonb_build_object('payment',p.id,'generation',c.generation,'intent',b.reference_id) from ca_payment p join public.business_payments b on b.id=p.id join public.connected_accounts c on c.workspace_id=b.workspace_id;
`;
  const output = await run(`fixture-${++sequence}`, sql);
  const facts = JSON.parse(output.split("\n").at(-1));
  return { ...facts, owner, manager, business, agency, request, booking, account, ownerEmail, managerEmail, workspace: agencyCase ? agency : business, agencyCase };
}
const cases = ["merchant restriction", "merchant generation", "clock expiry", "quote cancellation", "deposit cancellation", "agency actor withdrawal", "agency owner withdrawal", "agency payer withdrawal", "agency customer exit"];
const fixtureWorkspaces = [];
const signature = "public.assert_business_checkout_admission(uuid,text,bigint,uuid,text,text)";
const forward = join(root, "supabase/migrations/20261022171000_checkout_final_admission.sql");
const inverse = join(root, "supabase/migrations/rollback-20261022171000_checkout_final_admission.sql");
const catalogSql = "select p.oid::regprocedure::text||'|'||md5(pg_get_functiondef(p.oid))||'|'||p.proowner||'|'||coalesce(p.proacl::text,'') from pg_proc p where p.pronamespace='public'::regnamespace order by 1";
let status = "failed", error, installedLedger;
try {
  // Catalog-source check and exact installed forward identity bind this rehearsal.
  await run("source-contract", `\\i ${root}/scripts/sql/checkout-final-admission-contract.sql`);
  await run("current-native-google-hash-portability-contract", `\\i ${root}/scripts/sql/native-google-hash-portability-contract.sql`);
  await run("current-reward-durable-catalog-contract", `\\i ${root}/scripts/sql/reward-durable-catalog-contract.sql`);
  await run("current-private-source-current-contract", `\\i ${root}/scripts/sql/private-source-current-contract.sql`);
  const expectedLedger = inventory.forwardFiles.map(file => /^([0-9]+)_/.exec(file)?.[1]).sort();
  if (inventory.forwardCount !== 351 || expectedLedger.length !== 351 || expectedLedger.some(version => !version) || new Set(expectedLedger).size !== 351) throw new Error("Source inventory must contain the exact unique 351 forward versions");
  installedLedger = JSON.parse(await run("exact-forward-ledger", "select coalesce(jsonb_agg(version::text order by version::text),'[]'::jsonb) from supabase_migrations.schema_migrations"));
  retain("installed-forward-ledger.json", JSON.stringify({ expected: expectedLedger, installed: installedLedger }, null, 2));
  if (JSON.stringify(installedLedger) !== JSON.stringify(expectedLedger)) throw new Error("Requires the exact sorted qualified 351-migration identity; a same-count substituted ledger is refused.");
  for (const kind of cases) {
    const f = await fixture(kind), label = kind.replaceAll(" ", "-"), app = `checkout-wait-${randomUUID()}`;
    fixtureWorkspaces.push(f.business, f.agency);
    const admission = `select public.assert_business_checkout_admission('${f.payment}',${literal(f.account)},${f.generation},${f.agencyCase ? `'${f.manager}',${literal(f.managerEmail)},${literal(f.ownerEmail)}` : "null,null,null"});`;
    if (await run(`${label}-initial`, admission) !== "t") throw new Error(`${kind}: initial current authority was not admitted`);
    let relation = "connected_accounts";
    const merchantLock = `select 1 from public.connected_accounts where workspace_id='${f.workspace}' for update;`;
    let mutation = "", lock = merchantLock;
    if (kind === "merchant restriction") mutation = `update public.connected_accounts set state='restricted' where workspace_id='${f.workspace}';`;
    if (kind === "merchant generation") mutation = `update public.connected_accounts set generation=generation+1 where workspace_id='${f.workspace}';`;
    if (kind === "quote cancellation") { relation = "business_payment_requests"; lock = `select 1 from public.business_payment_requests where id='${f.request}' for update;`; mutation = `insert into public.payment_request_actions(request_id,action) values('${f.request}','cancelled');`; }
    if (kind === "deposit cancellation") { relation = "business_bookings"; lock = `select 1 from public.business_bookings where id='${f.booking}' for update;`; mutation = `update public.business_bookings set status='cancelled',cancelled_at=clock_timestamp() where id='${f.booking}';`; }
    if (kind === "agency actor withdrawal" || kind === "agency owner withdrawal") { relation = "users"; const id = kind === "agency actor withdrawal" ? f.manager : f.owner; lock = `select 1 from public.users where id='${id}' for update;`; mutation = `update public.users set verified_at=null where id='${id}';`; }
    if (kind === "agency payer withdrawal") { relation = "accounts"; lock = `select 1 from public.accounts where workspace_id='${f.business}' for update;`; mutation = `update public.accounts set payer_kind='business',payer_workspace_id=null where workspace_id='${f.business}';`; }
    if (kind === "agency customer exit") mutation = `insert into public.workspace_exit_requests(workspace_id,requested_by,idempotency_key,command_digest,future_work,provider_participation,maintained_resource_action,state,completed_at) values('${f.business}','${f.owner}','fictional-checkout-exit-${f.payment}',repeat('4',64),'pause','keep','stop','{"status":"completed"}',clock_timestamp());`;
    const holder = processSql(`${label}-holder`);
    let worker;
    try {
      holder.child.stdin.write(`begin;${lock}select 'CHECKOUT_LOCK_HELD|'||jsonb_build_object('pid',pg_backend_pid(),'transaction',pg_current_xact_id()::text)::text;\n`);
    await waitUntil(() => holder.output().includes("CHECKOUT_LOCK_HELD|"), `${kind}: holder did not acquire the expected lock`);
    const holding = JSON.parse(holder.output().split("\n").find(line => line.startsWith("CHECKOUT_LOCK_HELD|")).slice("CHECKOUT_LOCK_HELD|".length));
    if (!Number.isInteger(holding.pid) || holding.pid <= 0 || !/^[0-9]+$/.test(holding.transaction)) throw new Error("Holder backend identity was invalid");
    retain(`${label}-holder-binding.json`, JSON.stringify({ ...holding, relation, app }, null, 2));
      worker = processSql(`${label}-admission`); worker.child.stdin.end(`set application_name=${literal(app)};select 'CHECKOUT_WORKER_PID|'||pg_backend_pid();${admission}\n`);
      let witness;
      await waitUntil(() => worker.output().includes("CHECKOUT_WORKER_PID|"), `${kind}: actual worker PID was not observed`);
      const workerPid = Number(worker.output().split("\n").find(line => line.startsWith("CHECKOUT_WORKER_PID|")).slice("CHECKOUT_WORKER_PID|".length));
      if (!Number.isInteger(workerPid) || workerPid <= 0) throw new Error("Worker backend identity was invalid");
      await waitUntil(async () => {
        const output = await run(`${label}-wait-${++sequence}`, `select coalesce((select jsonb_build_object('workerPid',w.pid,'workerApplication',w.application_name,'workerXactStart',w.xact_start,'observedAt',clock_timestamp(),'holderPid',${holding.pid},'holderTransaction',${literal(holding.transaction)},'blockers',pg_blocking_pids(w.pid),'expectedRelation','public.${relation}','relationLocks',(select jsonb_agg(jsonb_build_object('pid',l.pid,'relation',l.relation::regclass::text,'mode',l.mode,'granted',l.granted)) from pg_locks l where l.pid in(${holding.pid},${workerPid}) and l.relation='public.${relation}'::regclass),'workerWaitLocks',(select jsonb_agg(jsonb_build_object('mode',l.mode,'transaction',l.transactionid::text,'granted',l.granted)) from pg_locks l where l.pid=w.pid and l.locktype='transactionid'),'expiresAt',(select expires_at from public.business_payment_requests where id='${f.request}'),'preExpiry',${kind === "clock expiry" ? `(select w.xact_start<expires_at and clock_timestamp()<expires_at from public.business_payment_requests where id='${f.request}')` : "true"}) from pg_stat_activity w where w.pid=${workerPid} and w.application_name=${literal(app)} and w.wait_event_type='Lock' and ${holding.pid}=any(pg_blocking_pids(w.pid)) and exists(select 1 from pg_locks l where l.pid=w.pid and not l.granted and l.locktype='transactionid' and l.mode='ShareLock' and l.transactionid::text=${literal(holding.transaction)}) and exists(select 1 from pg_locks l where l.pid=w.pid and l.granted and l.relation='public.${relation}'::regclass and l.mode='RowShareLock') and exists(select 1 from pg_locks l where l.pid=${holding.pid} and l.granted and l.relation='public.${relation}'::regclass and l.mode='RowShareLock'))::text,'')`);
        if (!output) return false;
        witness = JSON.parse(output);
        return true;
      }, `${kind}: exact holder/transaction/relation wait was never observed`);
      retain(`${label}-wait-witness.json`, JSON.stringify(witness, null, 2));
      if (kind === "clock expiry") {
        if (witness.preExpiry !== true) throw new Error("Expiry transaction did not begin AND actually wait before the PostgreSQL deadline");
        await waitUntil(async () => await run(`${label}-deadline-${++sequence}`, `select clock_timestamp()>=expires_at from public.business_payment_requests where id='${f.request}'`) === "t", "PostgreSQL expiry deadline never passed while the lock was held");
        const deadline = JSON.parse(await run(`${label}-deadline-state`, `select jsonb_build_object('observedAt',clock_timestamp(),'expiresAt',r.expires_at,'workerPid',w.pid,'workerXactStart',w.xact_start,'holderStillBlocking',${holding.pid}=any(pg_blocking_pids(w.pid)),'afterDeadline',clock_timestamp()>=r.expires_at) from public.business_payment_requests r cross join pg_stat_activity w where r.id='${f.request}' and w.pid=${workerPid} and w.application_name=${literal(app)}`));
        retain(`${label}-deadline-witness.json`, JSON.stringify(deadline, null, 2));
        if (deadline.afterDeadline !== true || deadline.holderStillBlocking !== true) throw new Error("Expiry lock was not still held after the PostgreSQL deadline");
      }
      holder.child.stdin.end(`${mutation}commit;\n`);
      const held = await holder.completed; if (held.code !== 0 || held.signal || held.error || held.timedOut) throw new Error(`${kind}: holder mutation failed`);
      const result = await worker.completed;
      const refusal = kind === "agency payer withdrawal" ? /ERROR:\s+agency_invoice_conflict(?:\r?\n|$)/ : /checkout_admission_denied|agency_invoice_denied/;
      if (result.code !== 3 || result.signal || result.error || result.timedOut || !refusal.test(result.stderr)) throw new Error(`${kind}: final admission did not refuse actual committed authority loss`);
      // Original accepted-effect port remains usable; no new session was sent.
      const session = `cs_CheckoutWait${randomBytes(6).toString("hex")}`;
      await run(`${label}-accepted-observation`, `select public.record_business_payment_event(${literal(f.account)},${literal(`checkout:${session}`)},${literal(session)},'${f.payment}','checkout_created',0);`);
      if (await run(`${label}-receipt`, `select public.prepare_business_checkout('${f.payment}')->>'sessionId'`) !== session) throw new Error(`${kind}: accepted-effect recovery was lost`);
      console.log(`Checkout final admission after observed lock wait PASS: ${kind}; accepted receipt remains readable.`);
    } finally {
      const owned = [holder, worker].filter(Boolean);
      for (const child of owned) if (!child.done()) child.terminate();
      const closed = await Promise.allSettled(owned.map(child => child.completed));
      if (closed.some(result => result.status !== "fulfilled") || owned.some(child => !child.done())) throw new Error(`${kind}: case child closure unconfirmed; global cleanup still required`);
    }
  }
  const baseline = await run("catalog-before-probes", catalogSql);
  const migrationRole = await run("migration-owner", `select proowner::regrole::text from pg_proc where oid='${signature}'::regprocedure`);
  if (!migrationRole) throw new Error("Original migration owner unavailable");
  retain("migration-owner.json", JSON.stringify({ role: migrationRole }, null, 2));
  for (const [label, mutation, packet, expected] of [
    ["forward-existing-signature", "", forward, "checkout_admission_unsupported_baseline"],
    ["inverse-custom-acl", `create role ca_checkout_probe;grant execute on function ${signature} to ca_checkout_probe;`, inverse, "checkout_admission_acl_drift"],
    ["inverse-grant-option", `grant execute on function ${signature} to service_role with grant option;`, inverse, "checkout_admission_acl_drift"],
    ["inverse-owner", `alter function ${signature} owner to service_role;`, inverse, "checkout_admission_catalog_drift"],
    ["inverse-properties", `alter function ${signature} parallel safe;`, inverse, "checkout_admission_catalog_drift"],
    ["inverse-body", `update pg_proc set prosrc='begin return true;end' where oid='${signature}'::regprocedure;`, inverse, "checkout_admission_catalog_drift"],
    ["inverse-overload", "create function public.assert_business_checkout_admission(text) returns boolean language sql as 'select true';", inverse, "checkout_admission_catalog_drift"],
  ]) {
    const probe = processSql(label); probe.child.stdin.end(`begin;${mutation}select 'CHECKOUT_PROBE_PREPARED';set local role ${literal(migrationRole)};\n\\i ${packet}\n`);
    const result = await probe.completed;
    if (result.code !== 3 || result.signal || result.error || result.timedOut || !result.stdout.includes("CHECKOUT_PROBE_PREPARED") || !result.stderr.includes(expected)) throw new Error(`${label}: mutation and exact atomic refusal were not observed`);
    if (await run(`${label}-catalog-after`, catalogSql) !== baseline) throw new Error(`${label}: refused packet changed the catalog`);
    console.log(`Checkout migration atomic refusal PASS: ${label}.`);
  }
  const history = `select 'payment|'||p.id||'|'||md5(to_jsonb(p)::text) from public.business_payments p where p.workspace_id in(${fixtureWorkspaces.map(literal).join(",")}) union all select 'event|'||e.id||'|'||md5(to_jsonb(e)::text) from public.business_payment_events e join public.business_payments p on p.id=e.payment_id where p.workspace_id in(${fixtureWorkspaces.map(literal).join(",")}) order by 1`;
  const retained = await run("history-before-inverse", history);
  await run("legitimate-inverse", `set role ${literal(migrationRole)};\n\\i ${inverse}`);
  if (await run("gate-removed", `select to_regprocedure('${signature}') is null`) !== "t") throw new Error("Legitimate inverse retained the new gate");
  if (await run("history-after-inverse", history) !== retained) throw new Error("Legitimate inverse changed retained accepted payment/history bytes");
  await run("legitimate-reapply", `set role ${literal(migrationRole)};\n\\i ${forward}`);
  await run("reapplied-native-google-hash-portability-contract", `set role ${literal(migrationRole)};\n\\i ${root}/scripts/sql/native-google-hash-portability-contract.sql`);
  await run("reapplied-reward-durable-catalog-contract", `set role ${literal(migrationRole)};\n\\i ${root}/scripts/sql/reward-durable-catalog-contract.sql`);
  await run("reapplied-private-source-current-contract", `set role ${literal(migrationRole)};\n\\i ${root}/scripts/sql/private-source-current-contract.sql`);
  if (await run("catalog-after-reapply", catalogSql) !== baseline) throw new Error("Reapply changed original historical functions or the current gate contract");
  if (await run("history-after-reapply", history) !== retained) throw new Error("Reapply changed retained accepted payment/history bytes");
  const ledgerAfter = JSON.parse(await run("ledger-after-reapply", "select coalesce(jsonb_agg(version::text order by version::text),'[]'::jsonb) from supabase_migrations.schema_migrations"));
  if (JSON.stringify(ledgerAfter) !== JSON.stringify(installedLedger)) throw new Error("Migration ledger identity changed during inverse/reapply");
  status = "passed";
} catch (failure) { error = failure instanceof Error ? failure.message : String(failure); process.exitCode = 1; }
finally {
  await closeOwnedChildren();
  const sourceAfter = sourceSnapshot();
  retain("source-end.json", JSON.stringify(sourceAfter, null, 2));
  const sourceUnchanged = JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter);
  if (!sourceUnchanged) { status = "failed"; error ||= "Execution source changed between native start and all owned child CLOSEs"; process.exitCode = 1; }
  retain("receipt.json", JSON.stringify({ status, error, allOwnedChildrenClosed: true, sourceUnchanged, nativeProviderQualified: false, fullStackQualifiedByHarness: false, cleanupOwner: "coordinator-owned disposable clone", installedLedger, sourceBefore, sourceAfter, artifacts: Object.fromEntries(outputs.map(name => [name, hash(readFileSync(join(evidence, name)))])) }, null, 2));
  if (error) console.error("Checkout admission race qualification failed. Retained private receipt and logs identify the exact native failure.");
}
