import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectDiskHeadroom, minimumDiskBytes } from '../full-model-disk-headroom.mjs';
const input = { stage: 'primary-native', paths: ['/checkout', '/evidence'] };
const read = bytes => () => ({ bsize: 1n, bavail: bytes });
test('admission uses unprivileged available bytes and preserves exact large values', () => {
  const result = inspectDiskHeadroom(input, read(9007199254740993n));
  assert.equal(result.status, 'admitted');
  assert.equal(result.observations[0].availableBytes, '9007199254740993');
  assert.equal(result.fullReleaseQualified, false);
  assert.equal(result.capacityReserved, false);
});
test('one path below the floor refuses the whole window, without combining volumes', () => {
  const result = inspectDiskHeadroom(input, path => ({ bsize: 1024n, bavail: path === '/checkout' ? minimumDiskBytes / 1024n : 1n }));
  assert.equal(result.status, 'refused');
  assert.equal(result.observations[0].sufficient, true);
  assert.equal(result.observations[1].sufficient, false);
});
test('the floor can increase but cannot be lowered or disabled', () => {
  for (const minimumBytes of ['0', '1', '-1', 'off', '1e10', ''])
    assert.equal(inspectDiskHeadroom({ ...input, minimumBytes }, read(minimumDiskBytes * 2n)).status, 'refused');
  const increased = String(minimumDiskBytes * 2n);
  assert.equal(inspectDiskHeadroom({ ...input, minimumBytes: increased }, read(minimumDiskBytes)).status, 'refused');
  assert.equal(inspectDiskHeadroom({ ...input, minimumBytes: increased }, read(BigInt(increased))).status, 'admitted');
});
test('missing, unavailable or invalid measurement never admits a window', () => {
  assert.equal(inspectDiskHeadroom({ ...input, paths: [] }, read(minimumDiskBytes)).status, 'refused');
  const failed = inspectDiskHeadroom(input, () => { const error = new Error('unavailable'); error.code = 'EIO'; throw error; });
  assert.equal(failed.status, 'refused');
  assert.equal(failed.observations[0].availableBytes, null);
  assert.equal(failed.observations[0].measurementError, 'EIO');
  assert.equal(inspectDiskHeadroom(input, () => ({ bsize: 0n, bavail: 1n })).status, 'refused');
});
