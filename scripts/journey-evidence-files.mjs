import { randomBytes } from 'node:crypto';
import { closeSync, constants, existsSync, fstatSync, fsyncSync, linkSync, lstatSync, openSync, readSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

const reportLimit = 64 * 1024 * 1024;
export function privateJourneyDirectory(input) {
  if (lstatSync(input).isSymbolicLink()) throw new Error('Private owned evidence directory required.');
  const path = realpathSync(input), stat = lstatSync(path);
  if (!stat.isDirectory() || stat.uid !== process.getuid?.() || (stat.mode & 0o077)) throw new Error('Private owned evidence directory required.');
  return path;
}
function ownedPath(input, file) {
  const work = privateJourneyDirectory(input), supplied = resolve(input), absolute = resolve(file);
  const path = absolute.startsWith(work + sep) ? absolute : absolute.startsWith(supplied + sep) ? join(work,relative(supplied,absolute)) : null;
  if (!path) throw new Error('Evidence file is outside the owned directory.');
  let parent = work;
  for (const part of relative(work,dirname(path)).split(sep).filter(Boolean)) {
    parent = join(parent,part); const stat = lstatSync(parent);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.()) throw new Error('Owned regular evidence ancestor required.');
  }
  return path;
}
function regular(stat) { return stat.isFile() && stat.uid === process.getuid?.() && stat.nlink === 1; }

/** Admission precedes any interpretation. Bound reads and inspect the opened
 * descriptor, so a leaf replacement cannot substitute different bytes. */
export function readOwnedJourneyFile(work, file, maxBytes = reportLimit) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > reportLimit) throw new Error('Bounded evidence read required.');
  const path = ownedPath(work,file), stat = lstatSync(path);
  if (!regular(stat)) throw new Error('Owned regular evidence file required.');
  const fd = openSync(path,constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(fd);
    if (!regular(opened) || opened.dev !== stat.dev || opened.ino !== stat.ino || opened.size > maxBytes) throw new Error('Owned bounded evidence file required.');
    const buffer = Buffer.alloc(opened.size+1); let bytes = 0;
    while (bytes < buffer.length) { const read = readSync(fd,buffer,bytes,buffer.length-bytes,null); if (!read) break; bytes += read; }
    const after = fstatSync(fd);
    if (bytes !== opened.size || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs) throw new Error('Evidence file changed during read.');
    return buffer.subarray(0,bytes).toString('utf8');
  } finally { closeSync(fd); }
}

/** Complete bytes are published atomically inside the owned tree. Replacing a
 * redacted raw report replaces its entry; it never writes through a symlink. */
export function writeOwnedJourneyFile(work, file, text, { replace = false } = {}) {
  const path = ownedPath(work,file);
  if (existsSync(path) || (() => { try { lstatSync(path); return true; } catch { return false; } })()) {
    if (!replace || !regular(lstatSync(path))) throw new Error('Existing evidence cannot be replaced.');
  }
  const temp = join(dirname(path),`.${basename(path)}.retention-${randomBytes(12).toString('hex')}`);
  const fd = openSync(temp,constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,0o600);
  try { writeFileSync(fd,text); fsyncSync(fd); } finally { closeSync(fd); }
  try {
    ownedPath(work,path);
    if (replace) {
      if (!regular(lstatSync(path))) throw new Error('Owned regular replacement required.');
      renameSync(temp,path);
    } else { linkSync(temp,path); unlinkSync(temp); }
  } catch (error) {
    try { ownedPath(work,temp); unlinkSync(temp); } catch { /* Failed bytes never qualify. */ }
    throw error;
  }
}
