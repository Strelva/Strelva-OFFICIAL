import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceInventory } from './full-model-journey-profile.mjs';

function privateDirectory(input) {
  const path = realpathSync(input), stat = lstatSync(path);
  if (!stat.isDirectory() || stat.uid !== process.getuid?.() || (stat.mode & 0o077)) throw new Error('Private owned evidence directory required.');
  return path;
}
function save(output, name, data) {
  writeFileSync(join(output, name), JSON.stringify(data, null, 2), { mode: 0o600, flag: 'wx' });
}
function digest(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW), hash = createHash('sha256'), buffer = Buffer.alloc(65536);
  try { let size; while ((size = readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, size)); }
  finally { closeSync(fd); }
  return hash.digest('hex');
}
export function validateTraceArchive(path) {
  // No package download, shell, credential environment or archive extraction.
  if (!existsSync('/usr/bin/unzip')) return 'unvalidated';
  const result = spawnSync('/usr/bin/unzip', ['-tqq', path], { env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' }, stdio: 'ignore', timeout: 60000 });
  if (result.error || result.status === null) return 'unvalidated';
  return result.status === 0 ? 'valid' : 'invalid';
}

/** Run only after the child exits. Preserve invalid bytes; a digest alone is
 * never archive validity. The enclosing per-run directory is the privacy bound. */
export function inventoryJourneyArtifacts({ work: input, artifactDir, proofFiles = [], reportPath, validateZip = validateTraceArchive }) {
  const work = privateDirectory(input), inputRoot = resolve(input), files = [], issues = [], seen = new Set();
  const ownedPath = path => {
    const absolute = resolve(path);
    if (absolute.startsWith(work + sep)) return absolute;
    // macOS TMPDIR may use /var while realpath resolves /private/var. Map only
    // this exact supplied owned root; never resolve an arbitrary outside path.
    return absolute.startsWith(inputRoot + sep) ? join(work, relative(inputRoot, absolute)) : null;
  };
  function inspect(inputPath) {
    const path = ownedPath(inputPath);
    if (!path) { issues.push('outside-owned-directory'); return; }
    const name = relative(work, path);
    if (seen.has(name)) return;
    seen.add(name);
    if (!existsSync(path)) { files.push({ path: name, state: 'missing' }); issues.push('missing-file'); return; }
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !realpathSync(path).startsWith(work + sep) || stat.uid !== process.getuid?.()) { files.push({ path: name, state: 'refused' }); issues.push('unowned-or-symbolic-file'); return; }
    if (stat.isDirectory()) {
      chmodSync(path, 0o700);
      for (const child of readdirSync(path).sort()) inspect(join(path, child));
      return;
    }
    if (!stat.isFile()) { issues.push('non-regular-file'); return; }
    chmodSync(path, 0o600);
    const sha256 = digest(path), trace = /\.zip$/i.test(name) ? validateZip(path) : undefined;
    const after = lstatSync(path);
    const stable = stat.dev === after.dev && stat.ino === after.ino && stat.size === after.size && sha256 === digest(path);
    files.push({ path: name, state: stable ? 'retained' : 'changed', bytes: after.size, sha256, ...(trace ? { archive: trace } : {}) });
    if (!stable) issues.push('file-changed');
    if (trace && trace !== 'valid') issues.push(`archive-${trace}`);
  }
  // Passing runs need not emit failure-only artifacts, but report attachments
  // must exist. Missing reports and missing advertised traces are failures.
  if (artifactDir && existsSync(artifactDir)) inspect(artifactDir);
  for (const file of proofFiles) inspect(file);
  if (reportPath) {
    inspect(reportPath);
    try {
      const path = ownedPath(reportPath);
      if (!path) throw new Error('Refused report.');
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.uid !== process.getuid?.() || !realpathSync(path).startsWith(work + sep)) throw new Error('Refused report.');
      const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      let raw;
      try { raw = readFileSync(fd, 'utf8'); } finally { closeSync(fd); }
      const report = JSON.parse(raw);
      const attachments = value => {
        if (Array.isArray(value)) { for (const item of value) attachments(item); }
        else if (value && typeof value === 'object') {
          if (Array.isArray(value.attachments)) for (const item of value.attachments) if (item.path) inspect(resolve(item.path));
          for (const [key, item] of Object.entries(value)) if (key !== 'attachments') attachments(item);
        }
      };
      attachments(report);
    } catch { issues.push('report-unreadable'); }
  }
  return { schema: 1, files, issues: [...new Set(issues)], integrityValidated: issues.length === 0, fullReleaseQualified: false };
}

/** Both terminal observations are attempted independently, including on child
 * failure. Errors are fixed codes; command output and credentials are not saved. */
export function retainJourneyEnd({ work, output, sourceBefore, captureSource, qualify, artifactDir, proofFiles = [], reportPath, browser, validateZip, runnerExit }) {
  privateDirectory(output);
  let after, sourceState = 'unavailable', stackState = 'unavailable';
  try { after = captureSource(); save(output, 'source-end.json', after); sourceState = JSON.stringify(sourceBefore) === JSON.stringify(after) ? 'matched' : 'changed'; }
  catch { save(output, 'source-end-failure.json', { reason: 'source-capture-failed', fullReleaseQualified: false }); }
  try { const stack = qualify(); save(output, 'stack-after.json', stack); stackState = stack?.qualified === true ? 'captured' : 'unqualified'; }
  catch { save(output, 'stack-after-failure.json', { reason: 'stack-qualification-failed', fullReleaseQualified: false }); }
  let inventory;
  try { inventory = inventoryJourneyArtifacts({ work, artifactDir, reportPath, validateZip, proofFiles: [...proofFiles, join(output, sourceState === 'unavailable' ? 'source-end-failure.json' : 'source-end.json'), join(output, stackState === 'unavailable' ? 'stack-after-failure.json' : 'stack-after.json')] }); }
  catch { inventory = { schema: 1, files: [], issues: ['inventory-capture-failed'], integrityValidated: false, fullReleaseQualified: false }; }
  save(output, 'artifact-inventory.json', inventory);
  const terminal = { browserAttempted: Boolean(browser), browserStarted: Boolean(browser && !browser.error), browserExit: browser?.status ?? null, browserSignal: browser?.signal ?? null, ...(runnerExit !== undefined ? { runnerExit } : {}), browserLaunchFailed: Boolean(browser?.error), sourceState, stackState, integrityValidated: inventory.integrityValidated,
    retentionValidated: sourceState === 'matched' && stackState === 'captured' && inventory.integrityValidated, fullReleaseQualified: false };
  save(output, 'terminal-state.json', terminal);
  return terminal;
}

/** Establish machine-readable admission before parsing runtime configuration. */
export function withJourneyAdmission(workInput, phase, profile, operation) {
  const work = privateDirectory(workInput);
  if (!basename(work).startsWith('strelva-full-journeys.') || !/^[a-z][a-z-]+$/.test(phase)) throw new Error('Owned journey phase required.');
  const output = join(work, phase);
  mkdirSync(output, { mode: 0o700 }); // Existing evidence is never reused.
  const history = [];
  const update = (stage, browserStarted = false) => {
    history.push({ stage, browserStarted });
    save(output, `admission-${history.length}.json`, { state: 'pending', required: profile.specs.reduce((sum, spec) => sum + spec.count, 0), cases: profile.specs, history, browserStarted, fullReleaseQualified: false });
  };
  update('admission');
  try {
    const value = operation(output, update);
    save(output, 'admission-terminal.json', { state: 'passed', history, browserStarted: history.some(item => item.browserStarted), fullReleaseQualified: false });
    return value;
  } catch (error) {
    const browserStarted = history.some(item => item.browserStarted);
    save(output, 'admission-terminal.json', { state: browserStarted ? 'failed' : 'not-run', failedStage: history.at(-1).stage, browserStarted, required: profile.specs.reduce((sum, spec) => sum + spec.count, 0), history, reason: 'phase-rejected', fullReleaseQualified: false });
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [root, workInput, profile, phase, exitInput, ...extra] = process.argv.slice(2);
    if (extra.length || !['full-native', 'full-dark'].includes(profile) || !/^[a-z][a-z-]+$/.test(phase) || !/^\d+$/.test(exitInput)) throw new Error('Fixed phase and child status required.');
    const work = privateDirectory(workInput), output = join(work, `retention-${phase}`);
    mkdirSync(output, { mode: 0o700 });
    const os = Object.fromEntries(['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
    const terminal = retainJourneyEnd({ work, output, sourceBefore: JSON.parse(readFileSync(join(work, 'source.json'), 'utf8')), captureSource: () => sourceInventory(root),
      qualify: () => JSON.parse(execFileSync(process.execPath, [join(root, 'scripts/full-model-stack-qualification.mjs'), 'verify', root, join(work, 'env')], { cwd: root, env: { ...os, LC_ALL: 'C' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 })),
      ...(phase.startsWith('final-') ? {} : { artifactDir: join(work, `artifacts-${phase}`), reportPath: join(work, `results-${phase}.json`), proofFiles: [join(work, `browser-${phase}.log`), join(work, 'source.json'), join(work, `manifest-${phase}.json`), join(work, 'schema.json'), join(work, 'stack-qualification.json')] }),
      ...(phase.startsWith('final-') ? { runnerExit: Number(exitInput) } : { browser: { status: Number(exitInput) } }) });
    if (Number(exitInput) !== 0) process.exitCode = Number(exitInput);
    else if (!terminal.retentionValidated) process.exitCode = 1;
  } catch { console.error('Private journey retention failed; retain the owned proof directory.'); process.exitCode = 1; }
}
