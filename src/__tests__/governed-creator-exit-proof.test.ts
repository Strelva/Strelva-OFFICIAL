import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exactCreatorWait, exactForwardLedger, qualifiedCreatorClone } from '../../scripts/lib/governed-creator-exit-proof.mjs';
const holder = { holderPid: 101, holderXid: '701' }, workerPid = 202, applicationName = 'owned-worker';
const witness = { workerPid, workerApplication: applicationName, holderPid: 101, holderXid: '701', blockedOnHolder: true, matchingHolderXidWait: true, workspaceRelationHeld: true, holderRelationHeld: true, holderTransactionAlive: true, blockingPids: [101], observedAt: '2026-10-09T08:00:00Z' };
const inventory = { forwardCount: 346, forwardFiles: Array.from({ length: 346 }, (_, i) => `${20260000000000 + i}_fictional.sql`) };
const installed = inventory.forwardFiles.map(file => file.split('_')[0]!).sort();
const qualification = { qualified: true, scope: 'owned-local-native-clone-schema-and-database-settings', database: 'governed_creator_exit_fictional', databaseOwner: 'postgres', databaseSettingsEqual: true, databaseSettingsSha256: 'a'.repeat(64), parentSchemaSha256: 'b'.repeat(64), cloneSchemaSha256: 'b'.repeat(64), parentQualification: '/private/tmp/owned/parent.json', fullReleaseQualified: false };
describe('creator exit native evidence admission', () => {
  it('accepts only the actual holder PID/xid, actual worker identity and observed workspace relation wait', () => {
    expect(exactCreatorWait(witness, holder, workerPid, applicationName)).toBe(true);
    for (const changed of [{ workerPid: 203 }, { workerApplication: 'other-worker' }, { holderPid: 102 }, { holderXid: '702' }, { blockedOnHolder: false }, { matchingHolderXidWait: false }, { workspaceRelationHeld: false }, { holderRelationHeld: false }, { holderTransactionAlive: false }, { blockingPids: [102] }]) expect(exactCreatorWait({ ...witness, ...changed }, holder, workerPid, applicationName)).toBe(false);
    expect(exactCreatorWait(null, holder, workerPid, applicationName)).toBe(false);
  });
  it('rejects another blocking PID even when all reported admission booleans are true', () => {
    expect(exactCreatorWait({ ...witness, blockingPids: [303] }, holder, workerPid, applicationName)).toBe(false);
  });
  it('consumes exact sorted unique346 identities rather than equal counts', () => {
    expect(exactForwardLedger(inventory, installed)).toEqual(installed);
    expect(() => exactForwardLedger(inventory, [...installed.slice(0, -1), '20990000000000'])).toThrow('exact unique sorted 346');
    expect(() => exactForwardLedger(inventory, [...installed].reverse())).toThrow();
    expect(() => exactForwardLedger({ ...inventory, forwardCount: 345 }, installed)).toThrow();
    expect(() => exactForwardLedger({ ...inventory, forwardFiles: [...inventory.forwardFiles.slice(0, -1), inventory.forwardFiles[0]] }, installed)).toThrow();
  });
  it('requires the actual database-qualified schema/settings and retains the external full-release boundary', () => {
    expect(qualifiedCreatorClone(qualification, qualification.database)).toEqual(qualification);
    for (const changed of [{ qualified: false }, { scope: 'count-only' }, { database: 'unowned' }, { databaseOwner: '' }, { databaseSettingsEqual: false }, { databaseSettingsSha256: 'unknown' }, { cloneSchemaSha256: 'c'.repeat(64) }, { parentQualification: 'relative.json' }, { fullReleaseQualified: true }]) expect(() => qualifiedCreatorClone({ ...qualification, ...changed }, qualification.database)).toThrow();
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
