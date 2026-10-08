import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('../../', import.meta.url).pathname;
test('composed tail executes migrations once, in order, with rollback fixtures before successors', () => {
  const output = execFileSync('bash', ['-c', 'repo_root="$1"; psql_args=(); psql() { printf "%s\\n" "$*"; }; source "$repo_root/scripts/sql/full-model-current-tail.sh"; check_full_model_current_tail', 'test', root], { encoding: 'utf8' });
  assert.ok(!output.includes("/migrations/rollback-"), "release inverses must never run destructively on the shared final schema");
  const migrations = [...output.matchAll(/supabase\/migrations\/(202610211\w+\.sql)/g)].map(x => x[1]);
  assert.equal(migrations.length, 15);
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
