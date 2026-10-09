import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('../../', import.meta.url).pathname;
test('composed tail executes migrations once, in order, with rollback fixtures before successors', () => {
  const output = execFileSync('bash', ['-c', 'repo_root="$1"; psql_args=(); psql() { printf "%s\\n" "$*"; }; source "$repo_root/scripts/sql/full-model-current-tail.sh"; check_full_model_current_tail historical-upgrade', 'test', root], { encoding: 'utf8' });
  assert.ok(!output.includes("/migrations/rollback-"), "release inverses must never run destructively on the shared final schema");
  const migrations = [...output.matchAll(/supabase\/migrations\/(202610211\w+\.sql)/g)].map(x => x[1]);
  const expected = readdirSync(`${root}supabase/migrations`).filter(file => /^202610211\d+_.*\.sql$/.test(file)).sort();
  assert.deepEqual(migrations, expected);
  assert.equal(new Set(migrations).size, migrations.length);
  assert.deepEqual(migrations, [...migrations].sort());
  assert.ok(output.indexOf('agent-oauth-connection-schema.sql') < output.indexOf('20261021131100'));
  assert.ok(output.indexOf('agent-oauth-renewable-rollback-schema.sql') < output.indexOf('20261021131200'));
  for (const fixture of ['runtime-data-investigation-history', 'runtime-data-client-authority', 'runtime-data-migration-atomicity', 'enterprise-home-finder', 'custom-sandbox-runtime', 'agent-website-tools']) assert.ok(output.includes(fixture));
});
test('historical runners preserve agency inverse before function successor and seed billing before its migration', () => {
  for (const file of ['check-workspace-sql.sh', 'check-workspace-upgrade.sh']) {
    const source = readFileSync(`${root}scripts/${file}`, 'utf8');
    const tail = source.slice(source.lastIndexOf('# #256:'));
    if (file === 'check-workspace-sql.sh') assert.ok(tail.indexOf('rollback-20261021093000') < tail.indexOf('20261021096000'));
    assert.ok(tail.indexOf('native-business-billing-home-upgrade.sql') < tail.indexOf('20261021095000'));
    assert.ok(tail.indexOf('20261021095000') < tail.indexOf('20261021096000'));
    assert.ok(tail.indexOf('check_full_model_current_tail') < tail.indexOf('20261022090000'));
    assert.ok(!tail.includes('/migrations/20261020090038'));
    assert.ok(!tail.includes('/migrations/20261020090039'));
  }
});

test('legacy superadmin fixture restores exact prior ACLs before the current audit migration tail', () => {
  const source = readFileSync(`${root}scripts/check-workspace-sql.sh`, 'utf8');
  const capture = source.indexOf('tests/support/super-admin-fixture-acl-restore.sql');
  const grant = source.indexOf('grant select on public.users, public.audit_logs');
  const refused = source.indexOf("Super-admin grant rollback did not refuse the populated audit trail");
  const restore = source.indexOf('--file="$cluster_root/super-admin-fixture-acl-restore.sql"');
  const tail = source.indexOf('for money_apps_migration');
  assert.ok(capture > 0 && capture < grant);
  assert.ok(restore > refused && restore < tail);
  const generator = readFileSync(`${root}tests/support/super-admin-fixture-acl-restore.sql`, 'utf8');
  assert.ok(generator.includes("a.grantee = r.oid and a.privilege_type = 'SELECT'"));
  assert.ok(generator.includes('a.is_grantable'));
  assert.ok(generator.includes('super_admin_fixture_acl_restore_failed'));
  assert.ok(generator.includes("select 'begin;'") && generator.includes("select 'commit;'"));
});

test('complete composed forward inventory has no unclassified workspace migration omissions', () => {
  const inventory = JSON.parse(readFileSync(`${root}scripts/sql/historical-forward-inventory.json`, 'utf8'));
  const actualForwards = readdirSync(`${root}supabase/migrations`).filter(file => /^20\d+_.*\.sql$/.test(file)).sort();
  assert.deepEqual(inventory.forwardFiles, actualForwards);
  for (const file of readdirSync(`${root}supabase/migrations`).filter(file => /^20\d+_.*\.sql$/.test(file))) assert.ok(inventory.forwardFiles.includes(file), `inventory must classify new forward migration: ${file}`);
  assert.equal(inventory.forwardFiles.length, inventory.forwardCount);
  assert.equal(new Set(inventory.forwardFiles).size, inventory.forwardCount);
  assert.deepEqual(inventory.forwardFiles, [...inventory.forwardFiles].sort());
  const source = ['scripts/check-workspace-sql.sh', 'scripts/sql/full-model-current-tail.sh', 'scripts/sql/historical-current-predecessors.sh'].map(file => readFileSync(`${root}${file}`, 'utf8')).join('\n');
  // Array-driven names omit .sql until invocation. Count only forward names.
  const names = new Set([...source.matchAll(/(?<!rollback-)(20\d+_[\w-]+?)(?=\.sql|[\s)"'])/g)].map(match => `${match[1]}.sql`));
  for (const file of inventory.forwardFiles) {
    if (file < inventory.workspaceBoundary || inventory.focusedLegacyExceptions[file]) continue;
    if (file.startsWith('20261020')) { assert.ok(source.includes('/supabase/migrations/20261020*.sql')); continue; }
    assert.ok(names.has(file), `unaccounted current predecessor: ${file}`);
  }
  const upgrade = readFileSync(`${root}scripts/check-workspace-upgrade.sh`, 'utf8');
  assert.ok(upgrade.includes("-name '20*.sql' | sort"));
  assert.ok(upgrade.includes('check_historical_current_predecessors'));
  assert.ok(!upgrade.includes('apply_historical_current_predecessors'));
  const scheduled = execFileSync('bash', ['-c', 'repo_root="$1"; psql_args=(); psql() { printf "%s\\n" "$*"; }; source "$repo_root/scripts/sql/historical-current-predecessors.sh"; apply_historical_current_predecessors', 'test', root], { encoding: 'utf8' });
  const applied = [...scheduled.matchAll(/migrations\/(20\d+_[\w-]+\.sql)/g)].map(match => match[1]);
  assert.equal(applied.length, 5); assert.equal(new Set(applied).size, 5);
  assert.deepEqual(applied, [...applied].sort());
  const predecessor = source.indexOf('apply_historical_current_predecessors');
  assert.ok(predecessor < source.indexOf('20261019100000_actor_rpc_service_boundary.sql'));
});


test('combined354 schedules both reviewed additions once before complete current catalog/exposure checks', () => {
  const inventory = JSON.parse(readFileSync(`${root}scripts/sql/historical-forward-inventory.json`, 'utf8'));
  assert.equal(inventory.forwardCount, 354);
  assert.equal(new Set(inventory.forwardFiles).size, 354);
  const google = '20261021140100_native_google_hash_portability.sql';
  const rewards = '20261022175000_reward_durable_mutations.sql';
  const tail = readFileSync(`${root}scripts/sql/full-model-current-tail.sh`, 'utf8');
  assert.equal(tail.split(`/supabase/migrations/${google}`).length - 1, 1);
  assert.ok(tail.indexOf('20261021140000_native_google_lifecycle.sql') < tail.indexOf(google));
  assert.ok(tail.indexOf(google) < tail.indexOf('/scripts/sql/native-google-hash-portability-contract.sql'));
  assert.ok(tail.indexOf('/scripts/sql/native-google-hash-portability-contract.sql') < tail.indexOf('for fixture in'));
  for (const owner of ['check-workspace-sql.sh', 'check-workspace-upgrade.sh']) {
    const source = readFileSync(`${root}scripts/${owner}`, 'utf8');
    assert.equal(source.split(`/supabase/migrations/${rewards}`).length - 1, 1);
    assert.ok(!source.includes(`/supabase/migrations/${google}`), 'shared tail owns Google exactly once');
    assert.ok(source.indexOf('20261022173000_neutral_creator_version_money.sql') < source.indexOf(rewards));
    assert.ok(source.indexOf(rewards) < source.indexOf('/scripts/sql/reward-durable-catalog-contract.sql'));
    assert.ok(source.indexOf('/scripts/sql/reward-durable-catalog-contract.sql') < source.lastIndexOf('/tests/function-exposure-schema.sql'));
    assert.ok(source.indexOf('/scripts/sql/reward-durable-catalog-contract.sql') < source.lastIndexOf('/scripts/check-readonly-rpcs.mjs'));
  }
});

test('current contracts retain complete accepted catalog guards and both native proof source captures', () => {
  const read = path => readFileSync(`${root}${path}`, 'utf8');
  const forward = read('supabase/migrations/20261022175000_reward_durable_mutations.sql');
  const begin = '-- BEGIN EXACT REWARDS CATALOG GUARD', end = '-- END EXACT REWARDS CATALOG GUARD';
  const guard = forward.slice(forward.indexOf(begin), forward.indexOf(end) + end.length);
  assert.ok(read('scripts/sql/reward-durable-catalog-contract.sql').includes(guard));
  const google = read('scripts/sql/native-google-hash-portability-contract.sql');
  for (const pin of ['597f3ffe25448bf40f2c82ba47828b8949ca7145920025b9e154dba5bd024bd2', 'e586808f9cb63173a97ae54cdead6da5e0752617b2fa509389d1de0500e6e3a3']) assert.ok(google.includes(pin));
  assert.ok(google.includes('target.applied_hash'));assert.ok(!google.includes('execute item'));assert.ok(!google.includes('definition:='));
  for (const path of ['scripts/check-governed-creator-exit-races.mjs','scripts/check-checkout-final-admission-races.mjs','scripts/check-creator-maintenance-operations.sh']) {
    const source=read(path);
    for (const name of ['scripts/sql/native-google-hash-portability-contract.sql','scripts/sql/reward-durable-catalog-contract.sql','supabase/migrations/rollback-20261021140100_native_google_hash_portability.sql','supabase/migrations/rollback-20261022175000_reward_durable_mutations.sql']) assert.ok(source.includes(name), `${path} must bind actual executed current source/inverses`);
  }
  const creator=read('scripts/check-governed-creator-exit-races.mjs');
  for (const label of ['current-native-google-hash-portability-contract','current-reward-durable-catalog-contract','reapplied-native-google-hash-portability-contract','reapplied-reward-durable-catalog-contract']) assert.ok(creator.includes(label));
});


test('current354 preserves historical phase checks and applies1740 then1745 once in both final owners', () => {
 const read = path => readFileSync(`${root}${path}`,'utf8');
 for (const name of ['check-workspace-sql.sh','check-workspace-upgrade.sh']) {
  const source=read(`scripts/${name}`), a=source.indexOf('/supabase/migrations/20261022174000_private_source_exit_admission.sql'), b=source.indexOf('/supabase/migrations/20261022174500_private_source_exit_lock_order.sql');
  assert.equal(source.split('/supabase/migrations/20261022174000_private_source_exit_admission.sql').length-1,1);assert.equal(source.split('/supabase/migrations/20261022174500_private_source_exit_lock_order.sql').length-1,1);
  assert.ok(source.indexOf('/scripts/sql/neutral-creator-version-money-contract.sql')<a && a<b && b<source.indexOf('/scripts/sql/private-source-current-contract.sql') && source.indexOf('/scripts/sql/private-source-current-contract.sql')<source.indexOf('/supabase/migrations/20261022175000_reward_durable_mutations.sql'));
 }
 const current=read('scripts/sql/private-source-current-contract.sql');assert.ok(current.includes('begin read only;'));
 for(const hash of ['c5102a2adad96ab31f2313ddfcc4eceb','1a08f3d5253b3d50037b9bce52fbd916'])assert.ok(current.includes(hash));
 assert.ok(current.includes('do $neutral_ports$')&&current.includes('do $contract$')&&current.includes('private_journal_incomplete'));
 assert.ok(read('scripts/sql/neutral-creator-version-money-contract.sql').includes('65070ed346aaff39df0c08a56c1afe2f'));
 assert.ok(read('tests/function-exposure-schema.sql').includes('private source manager exposed directly'));
});
