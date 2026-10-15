import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { policy, validatePolicy } from '../check-supply-chain.mjs';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const qualifier = fileURLToPath(new URL('../check-postgres-tools.sh', import.meta.url));

test('replay qualification accepts only a complete PostgreSQL 18 toolchain', () => {
  const bin = mkdtempSync(join(tmpdir(), 'strelva-pg-toolchain-'));
  try {
    const tool = (name, version) => writeFileSync(join(bin, name), `#!/bin/sh\nprintf '%s\\n' '${name} (PostgreSQL) ${version}'\n`, { mode: 0o700 });
    const qualify = () => spawnSync('bash', [qualifier], { encoding: 'utf8', env: { ...process.env, STRELVA_POSTGRES_BIN: bin } });
    for (const name of ['initdb', 'pg_ctl', 'postgres', 'psql']) tool(name, '18.1');
    assert.equal(qualify().status, 0);
    assert.equal(qualify().stdout, `${bin}\n`);
    for (const name of ['initdb', 'pg_ctl', 'postgres', 'psql']) {
      tool(name, '17.6');
      assert.equal(qualify().status, 1, name);
      assert.match(qualify().stderr, /different major version/);
      tool(name, '18.1');
    }
    rmSync(join(bin, 'pg_ctl'));
    assert.equal(qualify().status, 1);
    assert.match(qualify().stderr, /tool unavailable: pg_ctl/);
  } finally { rmSync(bin, { recursive: true, force: true }); }
});

test('push and nightly install and qualify the same replay tools and execute both SQL paths', () => {
  for (const file of ['ci', 'preview-nightly']) {
    const workflow = read(`.github/workflows/${file}.yml`);
    assert.match(workflow, /apt-get install -y -qq postgresql-18 redis-server/);
    assert.match(workflow, /bash scripts\/check-postgres-tools.sh >> "\$GITHUB_PATH"/);
    assert.match(workflow, /pnpm check:workspace-sql\s+pnpm check:workspace-upgrade/);
    assert.match(workflow, /pnpm check:migration-order/);
    assert.match(workflow, /run: pnpm check:supply-chain/);
    assert.doesNotMatch(workflow, /run: pnpm audit/);
    assert.ok(workflow.indexOf('bash scripts/check-postgres-tools.sh') < workflow.indexOf('pnpm check:workspace-sql'));
    if (file === 'ci') {
      assert.match(workflow, /if: github.event_name == 'push' \|\| github.event_name == 'workflow_dispatch' \|\| \(github.event_name == 'pull_request' && github.event.pull_request.draft == false\)/);
    }
    assert.deepEqual(validatePolicy(policy, {}, { [file]: workflow }, '2026-10-14'), []);
  }
});

test('secret scanner pins 8.30.1 and retains only exact reviewed historical exceptions', () => {
  const workflow = read('.github/workflows/security.yml');
  assert.equal(policy.scanner.version, '8.30.1');
  assert.ok(workflow.includes(policy.scanner.image));
  assert.match(workflow, /--gitleaks-ignore-path=\/repo\/\.gitleaksignore/);
  assert.match(workflow, /--log-opts="--all"/);
  const fingerprints = read('.gitleaksignore').split('\n').filter(line => line && !line.startsWith('#'));
  assert.equal(fingerprints.length, 47);
  assert.equal(new Set(fingerprints).size, 47);
  for (const fingerprint of fingerprints) {
    assert.match(fingerprint, /^[a-f0-9]{40}:.+:[a-z0-9-]+:\d+$/);
    assert.doesNotMatch(fingerprint, /dev-tenants\.json/);
  }
  assert.match(read('.gitleaks.toml'), /useDefault = true/);
  assert.doesNotMatch(read('.gitleaks.toml'), /\[allowlist\]/);
});

// The isolated environment must preserve setup-node and the qualified PG tools.
test('private authority runner preserves the caller toolchain without provider env', () => {
  const runner = read('scripts/check-private-authority-journeys.sh');
  assert.match(runner, /base_env=\("PATH=\$PATH"/);
  assert.match(runner, /env -i "\$\{base_env\[@\]\}"/);
  assert.doesNotMatch(runner, /PATH=\/opt\/homebrew/);
});
