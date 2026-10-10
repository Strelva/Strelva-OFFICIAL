import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const root = new URL('../../', import.meta.url).pathname;
function schedule(mode, focused) {
  return execFileSync('bash', ['-c', `set -e; repo_root="$1"; psql_args=(); fixture_scope="$3"; psql() { case "$*" in *google_review_content_retention.sql*|*google-review-content-retention*) if [[ "$fixture_scope" == focused ]]; then printf 'public.reviews missing in focused schema\\n' >&2; return 3; fi;; esac; printf '%s\\n' "$*"; }; source "$repo_root/scripts/sql/full-model-current-tail.sh"; check_full_model_current_tail "$2"`, 'test', root, mode, focused ? 'focused' : 'historical'], { encoding: 'utf8' });
}
test('focused tail never executes a legacy review upgrade on absent historical relations', () => {
  const output = schedule('focused-workspace', true);
  assert.ok(output.includes('full-schema owner'));
  assert.ok(!output.includes('--file=' + root + 'tests/google-review-content-retention'));
});
test('historical owner preserves all review upgrade and final-schema assertions in order', () => {
  const output = schedule('historical-upgrade', false);
  const before = output.indexOf('google-review-content-retention-upgrade-before.sql');
  const migration = output.indexOf('20261021100900_google_review_content_retention.sql');
  const after = output.indexOf('google-review-content-retention-upgrade-after.sql');
  const schema = output.indexOf('google-review-content-retention-schema.sql');
  assert.ok(before >= 0 && before < migration && migration < after && after < schema);
});
test('focused command requires successful actual full-schema retention rehearsal', () => {
  const source = readFileSync(`${root}scripts/check-workspace-sql.sh`, 'utf8');
  assert.ok(source.includes('check_full_model_current_tail focused-workspace'));
  assert.ok(source.includes('STRELVA_GOOGLE_REVIEW_RETENTION_SQL_PROOF=1 bash "$repo_root/scripts/check-guarded-teardown-fresh.sh"'));
  const owner = readFileSync(`${root}scripts/check-guarded-teardown-fresh.sh`, 'utf8');
  assert.ok(owner.includes('supabase/migrations/20*.sql | sort'));
  for (const fixture of ['upgrade-before', 'upgrade-after', 'schema']) assert.ok(owner.includes(`google-review-content-retention-${fixture}.sql`));
});

test('tail refuses an unknown schema owner before dispatching SQL', () => {
  assert.throws(() => schedule('unknown-owner', false), /Unknown full-model schema owner/);
});
