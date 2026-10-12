import { statfsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Operational estimate for a full local stack + Next + retained proof, subject
// to review. This observation reserves no bytes and cannot prevent later fill.
export const minimumDiskBytes = 10n * 1024n ** 3n;
export function inspectDiskHeadroom({ stage, paths, minimumBytes = String(minimumDiskBytes) }, readSpace = path => statfsSync(path, { bigint: true })) {
  const errors = [];
  let required = null;
  if (typeof minimumBytes === 'string' && /^[1-9][0-9]{0,19}$/.test(minimumBytes)) {
    required = BigInt(minimumBytes);
    if (required < minimumDiskBytes) errors.push('threshold-below-review-floor');
  } else errors.push('invalid-threshold');
  if (!Array.isArray(paths) || paths.length === 0) errors.push('missing-paths');
  const observations = (Array.isArray(paths) ? paths : []).map(input => {
    const path = resolve(input);
    try {
      const space = readSpace(path);
      if (typeof space.bsize !== 'bigint' || typeof space.bavail !== 'bigint' || space.bsize <= 0n || space.bavail < 0n)
        throw new Error('invalid-space-measurement');
      const available = space.bsize * space.bavail;
      return { path, availableBytes: String(available), requiredBytes: required === null ? null : String(required),
        sufficient: required !== null && required >= minimumDiskBytes && available >= required };
    } catch (error) {
      return { path, availableBytes: null, requiredBytes: required === null ? null : String(required), sufficient: false,
        measurementError: error?.code || 'space-measurement-unavailable' };
    }
  });
  const admitted = errors.length === 0 && observations.every(item => item.sufficient);
  return { format: 1, observedAt: new Date().toISOString(), stage, status: admitted ? 'admitted' : 'refused',
    requiredBytes: required === null ? null : String(required), reviewFloorBytes: String(minimumDiskBytes), observations, errors,
    capacityReserved: false, dockerInternalCapacityMeasured: false, fullReleaseQualified: false };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [stage, minimumBytes, ...paths] = process.argv.slice(2);
  try {
    const receipt = inspectDiskHeadroom({ stage, minimumBytes, paths });
    console.log(JSON.stringify(receipt));
    if (receipt.status !== 'admitted') {
      console.error('Disk headroom admission refused; retain disk-headroom.jsonl. No acceptance window was admitted.');
      process.exitCode = 1;
    }
  } catch {
    console.error('Disk headroom measurement failed; no acceptance window was admitted.');
    process.exitCode = 1;
  }
}
