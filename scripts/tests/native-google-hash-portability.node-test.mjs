import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = new URL('../../', import.meta.url).pathname;
const read = file => readFileSync(root + file, 'utf8');
const original = read('supabase/migrations/20261021140000_native_google_lifecycle.sql');
const successor = read('supabase/migrations/20261021140100_native_google_hash_portability.sql');
const hash = value => createHash('sha256').update(value).digest('hex');
test('additive successor pins original and only three extension-independent replacements', () => {
  const pins = JSON.parse(read('.scratch/google-native-hash-portability/source-pins.json'));
  let count = 0;
  for (const pin of pins) {
    const name = pin.signature.split('.')[1].split('(')[0];
    const match = original.match(new RegExp(`create function public\\.${name}\\(.*?\\bas \\$\\$(.*?)\\$\\$;`, 's'));
    assert.ok(match);
    const body = match[1];
    assert.equal(hash(body), pin.priorSourceSha256);
    const replacement = body.replaceAll('digest(', 'pg_catalog.sha256(').replaceAll(",'sha256')", ')');
    assert.equal(hash(replacement), pin.appliedSourceSha256);
    assert.equal((body.match(/digest\(/g) ?? []).length, pin.calls);
    assert.ok(!replacement.includes('digest('));
    assert.ok(successor.includes(pin.priorSourceSha256) && successor.includes(pin.appliedSourceSha256));
    count += pin.calls;
  }
  assert.equal(count, 3);
  assert.ok(successor.indexOf('native_google_hash_authority_drift') < successor.indexOf("execute item->>'definition'"));
  assert.ok(successor.includes("properties is distinct from item->'properties'"));
  assert.ok(successor.startsWith('-- Additive correction') && successor.includes('\nbegin;\n') && successor.endsWith('commit;\n'));
});
test('SQL fixture vectors equal Node native compact JSON including escaping, nulls and precision', () => {
  const vectors = JSON.parse(read('.scratch/google-native-hash-portability/vectors.json'));
  const fixture = read('tests/native-google-hash-portability-schema.sql');
  for (const vector of vectors) {
    assert.equal(vector.wire, JSON.stringify([vector.bindingId, vector.subject, vector.refreshTokenCiphertext, vector.createdAt]));
    assert.equal(vector.grantGeneration, hash(vector.wire));
    if (vector.subject !== null) assert.equal(vector.subjectDigest, hash(vector.subject));
    assert.ok(fixture.includes(vector.grantGeneration));
  }
  assert.ok(fixture.includes('native_google_hash_extension_shadow_called'));
  assert.ok(fixture.includes('set local role service_role;') && fixture.endsWith('rollback;\n'));
});
test('owned-disposable helper prepares 33 original refusals and eight real hash guard refusals', () => {
  const helper = read('tests/support/native-google-lifecycle-qualification.sh');
  const generator = helper.split("<<'PY'\n")[1].split('\nPY\n')[0];
  const destination = mkdtempSync(join(tmpdir(), 'native-hash-source-'));
  try {
    execFileSync('python3', ['-c', generator, root + 'supabase/migrations/20261021140000_native_google_lifecycle.sql', root + 'supabase/migrations/rollback-20261021140000_native_google_lifecycle.sql', destination, root + 'supabase/migrations/20261021140100_native_google_hash_portability.sql']);
    const variants = readdirSync(destination).filter(file => file.endsWith('.sql'));
    assert.equal(variants.length, 41);
    assert.equal(variants.filter(file => file.startsWith('hash-')).length, 8);
    for (const file of variants) {
      const source = readFileSync(join(destination, file), 'utf8');
      assert.equal((source.match(/^begin;$/gm) ?? []).length, 1);
      assert.ok(source.endsWith('commit;\n'));
    }
    assert.ok(helper.includes('hash-reapply.log') && helper.includes('final-hash-reapply.log'));
  } finally { rmSync(destination, { recursive: true, force: true }); }
});
test('corrective migration precedes native fixtures in the actual composed shell schedule', () => {
  const output = execFileSync('bash', ['-c', 'repo_root="$1"; psql_args=(); psql() { printf "%s\\n" "$*"; }; source "$repo_root/scripts/sql/full-model-current-tail.sh"; check_full_model_current_tail historical-upgrade', 'test', root], { encoding: 'utf8' });
  assert.ok(output.indexOf('20261021140000_') < output.indexOf('20261021140100_'));
  assert.ok(output.indexOf('20261021140100_') < output.indexOf('native-google-hash-portability-schema.sql'));
  assert.ok(output.indexOf('native-google-hash-portability-schema.sql') < output.indexOf('native-google-lifecycle-schema.sql'));
  assert.ok(read('supabase/migrations/rollback-20261021140100_native_google_hash_portability.sql').includes('native_google_hash_portability_forward_only'));
});
