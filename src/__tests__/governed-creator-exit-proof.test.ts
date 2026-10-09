import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { exactCreatorWait, exactForwardLedger, qualifiedCreatorClone, validateParentQualification, ownerSettingsCanonical, normalizedOwnerSettings, canonicalSchemaDump } from '../../scripts/lib/governed-creator-exit-proof.mjs';
const holder = { holderPid: 101, holderXid: '701' }, workerPid = 202, applicationName = 'owned-worker';
const witness = { workerPid, workerApplication: applicationName, holderPid: 101, holderXid: '701', blockedOnHolder: true, matchingHolderXidWait: true, workspaceRelationHeld: true, holderRelationHeld: true, holderTransactionAlive: true, blockingPids: [101], observedAt: '2026-10-09T08:00:00Z' };
const inventory = { forwardCount: 349, forwardFiles: Array.from({ length: 349 }, (_, i) => `${20260000000000 + i}_fictional.sql`) };
const installed = inventory.forwardFiles.map(file => file.split('_')[0]!).sort();
const qualification = { format: 2, ownerSettingsSha256: 'd'.repeat(64), parentOwnerSettingsEvidence: '/private/tmp/owned/parent-owner-settings.json', qualified: true, scope: 'owned-local-native-clone-schema-and-database-settings', database: 'governed_creator_exit_fictional', databaseOwner: 'postgres', databaseSettingsEqual: true, databaseSettingsSha256: 'a'.repeat(64), parentSchemaSha256: 'b'.repeat(64), cloneSchemaSha256: 'b'.repeat(64), parentQualification: '/private/tmp/owned/parent.json', fullReleaseQualified: false };
describe('creator exit native evidence admission', () => {
  it('accepts only the actual holder PID/xid, actual worker identity and observed workspace relation wait', () => {
    expect(exactCreatorWait(witness, holder, workerPid, applicationName)).toBe(true);
    for (const changed of [{ workerPid: 203 }, { workerApplication: 'other-worker' }, { holderPid: 102 }, { holderXid: '702' }, { blockedOnHolder: false }, { matchingHolderXidWait: false }, { workspaceRelationHeld: false }, { holderRelationHeld: false }, { holderTransactionAlive: false }, { blockingPids: [102] }]) expect(exactCreatorWait({ ...witness, ...changed }, holder, workerPid, applicationName)).toBe(false);
    expect(exactCreatorWait(null, holder, workerPid, applicationName)).toBe(false);
  });
  it('rejects another blocking PID even when all reported admission booleans are true', () => {
    expect(exactCreatorWait({ ...witness, blockingPids: [303] }, holder, workerPid, applicationName)).toBe(false);
  });
  it('consumes exact sorted unique349 identities rather than equal counts', () => {
    expect(exactForwardLedger(inventory, installed)).toEqual(installed);
    expect(() => exactForwardLedger(inventory, [...installed.slice(0, -1), '20990000000000'])).toThrow('exact unique sorted 349');
    expect(() => exactForwardLedger(inventory, [...installed].reverse())).toThrow();
    expect(() => exactForwardLedger({ ...inventory, forwardCount: 345 }, installed)).toThrow();
    expect(() => exactForwardLedger({ ...inventory, forwardFiles: [...inventory.forwardFiles.slice(0, -1), inventory.forwardFiles[0]] }, installed)).toThrow();
  });
  it('requires the actual database-qualified schema/settings and retains the external full-release boundary', () => {
    expect(qualifiedCreatorClone(qualification, qualification.database)).toEqual(qualification);
    for (const changed of [{ qualified: false }, { scope: 'count-only' }, { database: 'unowned' }, { databaseOwner: '' }, { databaseSettingsEqual: false }, { databaseSettingsSha256: 'unknown' }, { cloneSchemaSha256: 'c'.repeat(64) }, { parentQualification: 'relative.json' }, { fullReleaseQualified: true }]) expect(() => qualifiedCreatorClone({ ...qualification, ...changed }, qualification.database)).toThrow();
  });
  it('matches the existing Python sorted compact ASCII owner/static-settings contract', () => {
    expect(ownerSettingsCanonical({ value: String.fromCharCode(127) })).toBe('{"value":"\\u007f"}');
    expect(ownerSettingsCanonical({ z: 'Málaga', a: { b: 2, a: 1 } })).toBe('{"a":{"a":1,"b":2},"z":"M\\u00e1laga"}');
    const state = { systemIdentifier: '701', database: { oid: 5, datname: 'parent', datdba: 10, datconnlimit: -1 }, ownerName: 'postgres', settings: [{ databaseOid: 5, roleOid: 0, roleName: null, config: ['search_path=public'] }] };
    const clone = { ...state, database: { ...state.database, oid: 99, datname: 'clone' }, settings: [{ ...state.settings[0]!, databaseOid: 99 }] };
    expect(normalizedOwnerSettings(clone)).toEqual(normalizedOwnerSettings(state));
    for (const changed of [{ database: { ...clone.database, datdba: 11 } }, { database: { ...clone.database, datconnlimit: 0 } }, { ownerName: 'changed-owner' }, { settings: [{ ...clone.settings[0]!, config: ['search_path=evil'] }] }]) expect(normalizedOwnerSettings({ ...clone, ...changed })).not.toEqual(normalizedOwnerSettings(state));
  });
  it('preserves actual schema bytes except the existing pg_dump restrict nonce normalization', () => {
    const actual = '\\restrict nonce\ncreate table native(id uuid);\n\\unrestrict nonce\n';
    expect(canonicalSchemaDump(actual)).toBe('create table native(id uuid);\n');
    expect(canonicalSchemaDump(actual.replace('uuid', 'text'))).not.toBe(canonicalSchemaDump(actual));
  });
  it('refuses a parent receipt with substituted migration bytes even if its ledger count matches', () => {
    const hashes = Object.fromEntries(inventory.forwardFiles.map(file => [`supabase/migrations/${file}`, 'a'.repeat(64)]));
    const current = { migrations: inventory.forwardFiles.map(file => ({ version: file.split('_')[0], file, sha256: hashes[`supabase/migrations/${file}`] })), ledger: installed.map(version => ({ version })), catalogSha256: qualification.parentSchemaSha256, rolesSha256: 'b'.repeat(64), dumpVersion: 'pg_dump fictional', databaseIdentity: { systemIdentifier: '701', databaseOid: '5', database: 'postgres' }, binding: { databaseUrlSha256: 'c'.repeat(64) } };
    const parent = { qualified: true, scope: 'owned-local-schema-only', fullReleaseQualified: false, baselineSha256: 'd'.repeat(64), current };
    expect(validateParentQualification(parent, inventory, hashes, qualification)).toEqual(current);
    expect(() => validateParentQualification({ ...parent, current: { ...current, migrations: current.migrations.map((row, i) => i === 0 ? { ...row, sha256: 'e'.repeat(64) } : row) } }, inventory, hashes, qualification)).toThrow('exact current forward source bytes');
    expect(createHash('sha256').update(ownerSettingsCanonical({ a: 1 })).digest('hex')).toHaveLength(64);
  });
  it('pins source before execution and only records final hashes after all observed child closes', () => {
    const source = readFileSync('scripts/check-governed-creator-exit-races.mjs', 'utf8');
    expect(source.indexOf('const sourceBefore = snapshot()')).toBeLessThan(source.indexOf("await run('database-binding'"));
    expect(source).toContain('await closeChildren(); const sourceAfter = snapshot()');
    expect(source).toContain("sourceUnchanged = JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter)");
    expect(source).toContain("retain('clone-qualification.json', qualificationBytes)");
    expect(source).toContain("retain('parent-qualification.json', parentQualificationBytes)");
    expect(source).toContain("'scripts/lib/retained-native-child.mjs'");
    expect(source).toContain("'scripts/lib/governed-creator-exit-proof.mjs'");
    expect(source).toContain('...fixtureFiles');
    expect(source).toContain('...inventory.forwardFiles.map');
    expect(source).toContain("allOwnedChildrenClosed: false");
  });
  it('protects holder acquisition and worker lifetime with cleanup and proves no listing/history loss after the actual exit', () => {
    const source = readFileSync('scripts/check-governed-creator-exit-races.mjs', 'utf8');
    const acquisition = source.indexOf('holder.child.stdin.write');
    expect(source.lastIndexOf('try {', acquisition)).toBeGreaterThan(source.indexOf("const holder = processSql('creator-exit-holder')"));
    expect(source).toContain('finally { await closeChildren([holder, worker].filter(Boolean)); }');
    expect(source).toContain("refused.code !== 3"); expect(source).toContain("refused.stderr.includes('workspace_exit_future_work_blocked')");
    expect(source).toContain('after.creatorListingCount !== 0'); expect(source).toContain('after.retainedAgreementCount !== 1');
    expect(source).toContain("run('history-after-inverse', historySql) !== retainedHistory");
    expect(source).toContain("run('history-after-reapply', historySql) !== retainedHistory");
    expect(source).toContain('JSON.stringify(ledgerAfter) !== JSON.stringify(installedLedger)');
  });
});
