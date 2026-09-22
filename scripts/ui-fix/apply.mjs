// Temporary exact-source transport for reviewed PR 195 fixes. Removed in its source commit.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = process.cwd();
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const rows = JSON.parse(fs.readFileSync('scripts/ui-fix/edits.json', 'utf8'));
const pending = [];
const seen = new Set();
for (const row of rows) {
  if (!(row.path === 'DESIGN.md' || /^(src|tests|docs)\/[A-Za-z0-9_./-]+\.(tsx?|css|md)$/.test(row.path)) || row.path.includes('..') || seen.has(row.path)) throw new Error(`Unexpected path ${row.path}`);
  seen.add(row.path);
  if (!fs.lstatSync(row.path).isFile() || !fs.realpathSync(row.path).startsWith(root + path.sep)) throw new Error('Expected a regular repository file');
  let bytes = fs.readFileSync(row.path);
  if (digest(bytes) !== row.before) throw new Error(`Source changed: ${row.path}`);
  let boundary = bytes.length;
  for (const edit of [...row.edits].sort((a,b) => b.start - a.start)) {
    if (!Number.isInteger(edit.start) || !Number.isInteger(edit.end) || edit.start < 0 || edit.end < edit.start || edit.end > boundary || typeof edit.text !== 'string') throw new Error('Invalid edit');
    bytes = Buffer.concat([bytes.subarray(0, edit.start), Buffer.from(edit.text), bytes.subarray(edit.end)]);
    boundary = edit.start;
  }
  if (digest(bytes) !== row.after) throw new Error(`Source differs from reviewed bytes: ${row.path}`);
  pending.push([row.path, bytes]);
}
for (const [file, bytes] of pending) fs.writeFileSync(file, bytes);
execFileSync('git', ['add', '--', ...seen]);
execFileSync('git', ['rm', '-r', '--', 'scripts/ui-fix']);
execFileSync('git', ['diff', '--cached', '--check']);
console.log(`Validated and applied ${pending.length} reviewed files. No workflow or production changes.`);
