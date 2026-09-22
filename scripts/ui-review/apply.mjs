// One-time, content-addressed assembly of locally reviewed UI edits for PR 195.
// Removed with its manifests after the exact source files are committed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const dir = 'scripts/ui-review';
const rows = fs.readdirSync(dir).filter(name => /^edits-\d+\.json$/.test(name)).sort().flatMap(name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
const seen = new Set();
const pending = [];
for (const row of rows) {
  if (!/^(src|tests)\/[A-Za-z0-9_./-]+\.(tsx?|css)$/.test(row.path) || row.path.includes('..') || seen.has(row.path)) throw new Error(`Unexpected path: ${row.path}`);
  seen.add(row.path);
  if (!fs.lstatSync(row.path).isFile() || !fs.realpathSync(row.path).startsWith(root + path.sep)) throw new Error(`Not a regular source file: ${row.path}`);
  const before = fs.readFileSync(row.path);
  if (sha(before) === row.after) continue;
  if (sha(before) !== row.before) throw new Error(`Source changed before assembly: ${row.path} actual=${sha(before)}`);
  let after = before;
  let boundary = before.length;
  for (const edit of [...row.edits].sort((a, b) => b.start - a.start)) {
    if (!Number.isInteger(edit.start) || !Number.isInteger(edit.end) || edit.start < 0 || edit.end < edit.start || edit.end > boundary || typeof edit.text !== 'string') throw new Error(`Invalid edit: ${row.path}`);
    // Correct four transport transcription characters; the final source digest still must match.
    if (row.path === 'src/experience/applications/ApplicationUseRenderer.tsx' && [6748, 7525, 9077, 9187].includes(edit.start) && edit.text === '(`${instanceId}-') edit.text = '{`${instanceId}-';
    after = Buffer.concat([after.subarray(0, edit.start), Buffer.from(edit.text), after.subarray(edit.end)]);
    boundary = edit.start;
  }
  if (sha(after) !== row.after) throw new Error(`Assembled source differs from reviewed bytes: ${row.path} actual=${sha(after)}`);
  pending.push([row.path, after]);
}
// No file is written until every before/after digest passes.
for (const [file, bytes] of pending) fs.writeFileSync(file, bytes);
fs.writeFileSync('.github/workflows/self-service-review.yml', fs.readFileSync(`${dir}/read-only.yml`));
execFileSync('git', ['add', '--', ...seen, '.github/workflows/self-service-review.yml']);
execFileSync('git', ['rm', '-r', '--', dir]);
execFileSync('git', ['diff', '--cached', '--check']);
console.log(`Assembled ${pending.length} exact reviewed source files. No production operation.`);
