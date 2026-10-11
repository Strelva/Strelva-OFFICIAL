import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { sourceInventory } from '../full-model-journey-profile.mjs';
import { retainJourneyEnd } from '../journey-evidence-retention.mjs';

const owner = fileURLToPath(new URL('../../', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'strelva-source-coverage-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  const put = (file, bytes) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), bytes); };
  try {
    git('init', '-q');
    put('.gitignore', '.env*\nnode_modules\n.next*\n');
    put('src/implementation.ts', 'export const current = true;');
    git('add', '.');
    git('-c', 'user.name=Local proof', '-c', 'user.email=proof@example.test', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'finite fixture');
    run({ root, git, put });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('all tracked bytes include real copied template/runtime, public assets and arbitrary root contracts', () => fixture(({ root, git, put }) => {
  const actual = ['custom-repo-starter/website-generation/renderer.ts', 'custom-repo-starter/website-generation/renderer.mjs',
    'custom-repo-starter/website-generation/capability-runtime.mjs', 'public/connect.js', 'pnpm-workspace.yaml', 'vercel.json', 'release-manifest.json'];
  for (const file of actual) put(file, readFileSync(join(owner, file)));
  put('future-runtime/no-allowlist.ts', 'new tracked executable outside the old roots');
  put('docs/binary source\twith\nseparators.bin', Buffer.from([0, 255, 195, 40]));
  git('add', '.');
  const inventory = sourceInventory(root);
  const tracked = git('ls-files', '-z').split('\0').filter(Boolean).sort();
  assert.deepEqual(inventory.sourceFiles.map(item => item.file), tracked);
  for (const file of tracked) assert.equal(inventory.sourceFiles.find(item => item.file === file)?.sha256, digest(readFileSync(join(root, file))));
  assert.equal(inventory.fullReleaseQualified, false);
}));

test('changing the actual website capability runtime changes proof despite unchanged Git head/tree', () => fixture(({ root, git, put }) => {
  const file = 'custom-repo-starter/website-generation/capability-runtime.mjs';
  const bytes = readFileSync(join(owner, file)); put(file, bytes); git('add', file);
  const before = sourceInventory(root);
  put(file, Buffer.concat([bytes, Buffer.from('\n// finite dirty-runtime regression\n')]));
  const after = sourceInventory(root);
  assert.equal(after.head, before.head); assert.equal(after.tree, before.tree);
  assert.notDeepEqual(after, before);
  assert.notEqual(after.sourceFiles.find(item => item.file === file)?.sha256, before.sourceFiles.find(item => item.file === file)?.sha256);
}));

test('untracked template/public inputs are admitted while ignored dependencies and private environment stay outside', () => fixture(({ root, put }) => {
  const before = sourceInventory(root);
  put('custom-repo-starter/visitor/new-client.mjs', 'new client'); put('public/new-client.js', 'new public client');
  const admitted = sourceInventory(root); assert.notDeepEqual(admitted, before);
  for (const file of ['custom-repo-starter/visitor/new-client.mjs', 'public/new-client.js']) assert.ok(admitted.sourceFiles.find(item => item.file === file)?.sha256);
  put('.env.local', 'private fixture, never output'); put('node_modules/runtime.js', 'external dependency');
  put('.next/generated.js', 'generated build'); put('private-proof.env', 'outside authored execution roots');
  assert.deepEqual(sourceInventory(root), admitted);
}));

test('tracked deletion remains visible and initial CLI admission refuses missing source', () => fixture(({ root }) => {
  const before = sourceInventory(root); rmSync(join(root, 'src/implementation.ts'));
  const after = sourceInventory(root); assert.notDeepEqual(after, before);
  assert.equal(after.sourceFiles.find(item => item.file === 'src/implementation.ts')?.sha256, null);
  assert.throws(() => execFileSync(process.execPath, [join(owner, 'scripts/full-model-journey-profile.mjs'), 'source', 'full-native', root], { stdio: 'pipe' }), /missing/i);
}));

test('leaf and ancestor symlinks cannot substitute outside bytes, including dangling links', () => fixture(({ root, put }) => {
  const outside = mkdtempSync(join(tmpdir(), 'strelva-source-outside-'));
  try {
    writeFileSync(join(outside, 'outside.js'), 'outside fixture never interpreted');
    symlinkSync(join(outside, 'outside.js'), join(root, 'src/linked.js'));
    assert.throws(() => sourceInventory(root), /regular|symbolic|owned/i);
    rmSync(join(root, 'src/linked.js')); symlinkSync(join(outside, 'absent.js'), join(root, 'src/linked.js'));
    assert.throws(() => sourceInventory(root), /regular|symbolic|owned/i);
    rmSync(join(root, 'src/linked.js')); put('src/nested/owned.js', 'owned bytes');
    execFileSync('git', ['add', 'src/nested/owned.js'], { cwd: root, stdio: 'pipe' });
    writeFileSync(join(outside, 'owned.js'), 'outside fixture never interpreted');
    rmSync(join(root, 'src/nested'), { recursive: true }); symlinkSync(outside, join(root, 'src/nested'));
    // A cached path remains admitted even when Git declines to traverse the link.
    assert.throws(() => sourceInventory(root), /regular|symbolic|owned/i);
  } finally { rmSync(outside, { recursive: true }); }
}));

test('tracked symbolic links and gitlinks are refused rather than qualifying target contents', () => fixture(({ root, git }) => {
  symlinkSync('src/implementation.ts', join(root, 'tracked-link')); git('add', 'tracked-link');
  assert.throws(() => sourceInventory(root), /unsupported|symbolic/i);
  git('reset', '-q', '--', 'tracked-link'); rmSync(join(root, 'tracked-link'));
  git('update-index', '--add', '--cacheinfo', `160000,${git('rev-parse', 'HEAD').trim()},external-submodule`);
  assert.throws(() => sourceInventory(root), /unsupported|gitlink/i);
}));

test('a hardlinked source cannot attest externally shared mutable bytes', () => fixture(({ root }) => {
  linkSync(join(root, 'src/implementation.ts'), join(root, 'outside-alias'));
  assert.throws(() => sourceInventory(root), /linked|regular/i);
}));

test('a subdirectory cannot claim complete Git coverage for only its own files', () => fixture(({ root }) => {
  assert.throws(() => sourceInventory(join(root, 'src')), /checkout root/i);
}));

test('changed starter bytes keep a failed primary failed and terminal retention unqualified', () => fixture(({ root, git, put }) => {
  const file = 'custom-repo-starter/website-generation/renderer.mjs';
  const bytes = readFileSync(join(owner, file)); put(file, bytes); git('add', file);
  const before = sourceInventory(root);
  const original = JSON.stringify(before); put(file, Buffer.concat([bytes, Buffer.from('\n// changed after primary\n')]));
  const output = join(root, 'retained'); mkdirSync(output, { mode: 0o700 });
  const terminal = retainJourneyEnd({ work: root, output, sourceBefore: before, captureSource: () => sourceInventory(root),
    qualify: () => ({ qualified: true }), browser: { status: 7 }, runnerExit: 7 });
  assert.equal(JSON.stringify(before), original, 'prior source evidence stays unchanged');
  assert.equal(terminal.sourceState, 'changed'); assert.equal(terminal.browserExit, 7); assert.equal(terminal.runnerExit, 7);
  assert.equal(terminal.retentionValidated, false); assert.equal(terminal.fullReleaseQualified, false);
  assert.equal(JSON.parse(readFileSync(join(output, 'terminal-state.json'))).browserExit, 7);
}));
