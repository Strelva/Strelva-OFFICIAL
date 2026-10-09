// Pure admission evidence checks. Importing this module starts no processes.
export function exactCreatorWait(witness, holder, workerPid, applicationName) {
  return !!witness && witness.workerPid === workerPid && witness.workerApplication === applicationName && witness.holderPid === holder.holderPid && witness.holderXid === holder.holderXid && witness.blockedOnHolder === true && witness.matchingHolderXidWait === true && witness.workspaceRelationHeld === true && witness.holderRelationHeld === true && witness.holderTransactionAlive === true && Array.isArray(witness.blockingPids) && witness.blockingPids.includes(holder.holderPid);
}
export function exactForwardLedger(inventory, installed) {
  const expected = inventory.forwardFiles?.map(file => /^([0-9]+)_/.exec(file)?.[1]).sort();
  if (inventory.forwardCount !== 351 || expected?.length !== 351 || expected.some(version => !version) || new Set(expected).size !== 351 || JSON.stringify(installed) !== JSON.stringify(expected)) throw Error('Requires the exact unique sorted 351-migration identity; same-count substitutions are refused.');
  return expected;
}
/** Same sorted-key compact ASCII JSON used by capture-db-owner-settings.py. */
export function ownerSettingsCanonical(value) {
  const sorted = item => Array.isArray(item) ? item.map(sorted) : item && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().map(key => [key, sorted(item[key])])) : item;
  return JSON.stringify(sorted(value)).replace(/[^\x00-\x7e]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
export function normalizedOwnerSettings(state) {
  const { oid, datname, ...database } = state.database;
  return { systemIdentifier: state.systemIdentifier, database, ownerName: state.ownerName, settings: state.settings.map(row => ({ ...row, databaseOid: row.databaseOid === oid ? 'current_database' : row.databaseOid })) };
}
export function canonicalSchemaDump(dump) { return dump.split('\n').filter(line => !/^\\(un)?restrict\s/.test(line)).join('\n'); }
export function qualifiedCreatorClone(qualification, database) {
  if (qualification.format !== 2 || qualification.qualified !== true || qualification.scope !== 'owned-local-native-clone-schema-and-database-settings' || qualification.database !== database || qualification.databaseSettingsEqual !== true || !/^[a-f0-9]{64}$/.test(qualification.databaseSettingsSha256 ?? '') || !/^[a-f0-9]{64}$/.test(qualification.ownerSettingsSha256 ?? '') || !/^[a-f0-9]{64}$/.test(qualification.parentSchemaSha256 ?? '') || qualification.parentSchemaSha256 !== qualification.cloneSchemaSha256 || typeof qualification.databaseOwner !== 'string' || !qualification.databaseOwner || typeof qualification.parentQualification !== 'string' || !qualification.parentQualification.startsWith('/') || typeof qualification.parentOwnerSettingsEvidence !== 'string' || !qualification.parentOwnerSettingsEvidence.startsWith('/') || qualification.fullReleaseQualified !== false) throw Error('Requires format2 source-qualified owned clone schema/settings and parent raw owner/settings evidence.');
  return qualification;
}
export function validateParentQualification(parent, inventory, sourceHashes, qualification) {
  const current = parent.current;
  if (parent.qualified !== true || parent.scope !== 'owned-local-schema-only' || parent.fullReleaseQualified !== false || !/^[a-f0-9]{64}$/.test(parent.baselineSha256 ?? '') || !current || current.catalogSha256 !== qualification.parentSchemaSha256 || !/^[a-f0-9]{64}$/.test(current.rolesSha256 ?? '') || typeof current.dumpVersion !== 'string' || !Array.isArray(current.migrations) || !Array.isArray(current.ledger)) throw Error('Parent schema qualification is missing or not bound to clone schema.');
  const expected = inventory.forwardFiles.map(file => ({ version: /^([0-9]+)_/.exec(file)?.[1], file, sha256: sourceHashes[`supabase/migrations/${file}`] }));
  if (JSON.stringify(current.migrations) !== JSON.stringify(expected)) throw Error('Parent qualification does not contain the exact current forward source bytes.');
  exactForwardLedger(inventory, current.ledger.map(row => row.version));
  if (!/^[0-9]+$/.test(current.databaseIdentity?.systemIdentifier ?? '') || !/^[0-9]+$/.test(current.databaseIdentity?.databaseOid ?? '') || !current.databaseIdentity?.database || !/^[a-f0-9]{64}$/.test(current.binding?.databaseUrlSha256 ?? '')) throw Error('Parent database identity binding is missing.');
  return current;
}
