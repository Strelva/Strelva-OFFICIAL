// Pure admission evidence checks. Importing this module starts no processes.
export function exactCreatorWait(witness, holder, workerPid, applicationName) {
  return !!witness && witness.workerPid === workerPid && witness.workerApplication === applicationName && witness.holderPid === holder.holderPid && witness.holderXid === holder.holderXid && witness.blockedOnHolder === true && witness.matchingHolderXidWait === true && witness.workspaceRelationHeld === true && witness.holderRelationHeld === true && witness.holderTransactionAlive === true && Array.isArray(witness.blockingPids) && witness.blockingPids.includes(holder.holderPid);
}
export function exactForwardLedger(inventory, installed) {
  const expected = inventory.forwardFiles?.map(file => /^([0-9]+)_/.exec(file)?.[1]).sort();
  if (inventory.forwardCount !== 346 || expected?.length !== 346 || expected.some(version => !version) || new Set(expected).size !== 346 || JSON.stringify(installed) !== JSON.stringify(expected)) throw Error('Requires the exact unique sorted 346-migration identity; same-count substitutions are refused.');
  return expected;
}
export function qualifiedCreatorClone(qualification, database) {
  if (qualification.qualified !== true || qualification.scope !== 'owned-local-native-clone-schema-and-database-settings' || qualification.database !== database || qualification.databaseSettingsEqual !== true || !/^[a-f0-9]{64}$/.test(qualification.databaseSettingsSha256 ?? '') || !/^[a-f0-9]{64}$/.test(qualification.parentSchemaSha256 ?? '') || qualification.parentSchemaSha256 !== qualification.cloneSchemaSha256 || typeof qualification.databaseOwner !== 'string' || !qualification.databaseOwner || typeof qualification.parentQualification !== 'string' || !qualification.parentQualification.startsWith('/') || qualification.fullReleaseQualified !== false) throw Error('Requires a source-qualified owned clone schema/settings receipt bound to this exact database.');
  return qualification;
}
