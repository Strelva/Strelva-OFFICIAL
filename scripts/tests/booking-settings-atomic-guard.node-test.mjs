import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fakePsqlSource } from './support/booking-proof-fake.mjs';

const root = process.cwd();
const helper = resolve(root, 'scripts/sql/booking-settings-atomicity.sh');
const forward = readFileSync(resolve(root, 'supabase/migrations/20261022182000_booking_settings_atomic_patch.sql'), 'utf8');
const inverse = readFileSync(resolve(root, 'supabase/migrations/rollback-20261022182000_booking_settings_atomic_patch.sql'), 'utf8');
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;

test('inverse pins actual forward source and refuses metadata/owner/ACL drift before DROP', () => {
  const body = forward.split(' as $$')[1].split('$$;')[0];
  const hash = createHash('sha256').update(body).digest('hex');
  assert.ok(inverse.includes(hash), 'inverse body pin must match exact prepared forward bytes');
  for (const check of ['catalog.proowner', 'catalog.proargtypes', 'catalog.proconfig', 'catalog.prosecdef', 'a.grantor', 'a.is_grantable', "catalog.provolatile<>'v'", 'booking_settings_atomic_rollback_source_drift', 'booking_settings_atomic_rollback_authority_drift']) {
    assert.ok(inverse.includes(check), `missing rollback identity boundary: ${check}`);
  }
  assert.ok(inverse.indexOf('execute \'drop function') > inverse.indexOf('booking_settings_atomic_rollback_authority_drift'));
});

test('forward checks the complete created function authority inside its transaction', () => {
  const body = forward.split(' as $$')[1].split('$$;')[0];
  const hash = createHash('sha256').update(body).digest('hex');
  const admissionStart = forward.indexOf('do $admission$');
  assert.ok(admissionStart > forward.indexOf('grant execute on function'), 'post-create admission must inspect final inherited grants');
  const admission = forward.slice(admissionStart, forward.indexOf('end $admission$;') + 'end $admission$;'.length);
  assert.ok(admission.includes(hash));
  for (const check of ['catalog.proowner', 'catalog.proargtypes', 'catalog.proconfig', 'catalog.prosecdef', 'a.grantor', 'a.is_grantable', 'a.grantee not in (catalog.proowner,service_owner)', '))))<>2', 'booking_settings_atomic_create_source_drift', 'booking_settings_atomic_create_authority_drift']) {
    assert.ok(admission.includes(check), `missing forward identity boundary: ${check}`);
  }
  assert.ok(forward.lastIndexOf('commit;') > forward.indexOf('end $admission$;'));
});

// This transport NEVER invokes PostgreSQL. It only exercises the actual shell
// helper's qualification exit and retained cleanup status handling.
const fake = fakePsqlSource;

for (const mode of ['success', 'terminate_false', 'terminate_error', 'delete_error', 'sessions_remain', 'fixture_remains', 'writer_error', 'hung_child']) {
  test(`fake transport: ${mode} retains cleanup evidence and qualifies only confirmed closure`, { timeout: 25000 }, () => {
    const dir = mkdtempSync('/private/tmp/strelva-booking-cleanup-unit-');
    let passed = false;
    try {
      writeFileSync(resolve(dir, 'psql'), fake, { mode: 0o755 });
      mkdirSync(resolve(dir, 'data'), {mode:0o700}); mkdirSync(resolve(dir, 'socket'), {mode:0o700});
      const epoch = String(Math.floor(Date.now()/1000));
      writeFileSync(resolve(dir, 'data/postmaster.pid'), [process.pid, resolve(dir,'data'), epoch, '54321', resolve(dir,'socket'), '', ''].join('\n'), {mode:0o600});
      writeFileSync(resolve(dir,'booking-settings-cleanup.log'), '', {mode:0o600});
      const command = `repo_root=${quote(root)}; cluster_root=${quote(dir)}; cluster_data=${quote(`${dir}/data`)}; cluster_socket=${quote(`${dir}/socket`)}; cluster_postmaster_pid=${process.pid}; psql_args=(--host=${quote(`${dir}/socket`)} --port=54321 --username=fixture --dbname=fixture); source ${quote(resolve(root, 'scripts/sql/booking-owned-cluster.sh'))}; seal_booking_settings_owned_cluster; source ${quote(helper)}; run_booking_settings_atomicity`;
      const result = spawnSync('bash', ['-c', command], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, BOOKING_FAKE_MODE: mode, BOOKING_FAKE_DATA: resolve(dir,'data'), BOOKING_FAKE_SOCKET: resolve(dir,'socket'), BOOKING_FAKE_EPOCH: epoch, BOOKING_FAKE_STATUS: resolve(dir,'booking-settings-cleanup.log') }, encoding: 'utf8', timeout: 20000 });
      assert.ifError(result.error); assert.equal(result.signal, null);
      assert.equal(result.status, mode === 'success' ? 0 : 1, result.stderr);
      const path = resolve(dir, 'booking-settings-cleanup.log');
      const log = readFileSync(path, 'utf8');
      assert.equal(statSync(path).mode & 0o777, 0o600);
      assert.ok(log.includes('phase=cleanup'), log + '\n' + result.stderr);
      assert.ok(log.includes('closed=1 exit_status='));
      if (mode === 'success') {
        assert.ok(log.includes('sessions_absent=t')); assert.ok(log.includes('fixture_delete=ok')); assert.ok(log.includes('fixture_absent=t'));
        assert.ok(log.includes('complete=1 qualification_status=0 cleanup_failed=0'));
      } else if (mode === 'writer_error') {
        assert.ok(log.includes('exit_status=7 expected=0 escalated=0')); assert.ok(log.includes('qualification_status=1'));
      } else if (mode === 'hung_child') {
        assert.ok(log.includes('signal=TERM sent=1')); assert.ok(log.includes('signal=KILL sent=1'));
        assert.ok(log.includes('escalated=1')); assert.ok(log.includes('qualification_status=1'));
      } else {
        assert.ok(log.includes('cleanup_failed=1')); assert.match(result.stderr, /cleanup.*unconfirmed/);
      }
      for (const pid of [...log.matchAll(/pid=(\d+) closed=1/g)].map(match => Number(match[1]))) {
        assert.throws(() => process.kill(pid, 0), error => error.code === 'ESRCH', `owned child ${pid} remained alive`);
      }
      passed = true;
    } catch (error) { error.message += `\nRetained fake-transport evidence: ${dir}`; throw error; }
    finally { if (passed) rmSync(dir, { recursive: true, force: true }); }
  });
}
