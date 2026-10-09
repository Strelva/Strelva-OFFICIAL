// Requirements only. Importing does not run a stack, seed actors or contact providers.
export function askNativeAppVersionProofRegistry() {
  return {
    sourceBaseline: '39e27a71e7a6ab505adaa3b9620000a04d96d955',
    execution: 'UNRUN', fullReleaseQualified: false, providerActions: 'held', newMigrations: 0,
    supported: ['native_application definition/recent release read', 'one title change', 'one existing field label change'],
    unsupported: ['new arbitrary app/code', 'field/type/record changes', 'accounts/maintenance changes', 'chat approval/publication'],
    native: {
      requiresOwnedRuntimeWindow: true, requiresSealedCluster: true, substitutionsAllowed: false,
      paths: ['read_existing_business_systems + current stored graph', 'read_system_version_for_system', 'read_version_native_runtime',
        'native application read/revise/rehearse', 'Version save override + record_version_preparation', 'current exact Needs you list'],
      races: ['native-app', 'native-Version'].flatMap(path => ['verified-email', 'owner-membership', 'workspace-exit', 'design-or-row-revision', 'work-or-System-link'].flatMap(boundary => ['read-first-withdrawal-before-write', 'write-first-withdrawal-after-admission'].map(order => ({ path, boundary, order })))),
      raceCount: 20,
      extra: ['native maker withdrawn', 'scoped candidate-editor grant withdrawn', 'pushed source standard refuses fields override',
        'Version preparation response loss', 'candidate/rehearsal response loss', 'Needs you sync/read failure', 'mismatched/closed decision receipt',
        'distinct source System/Version System/native work/command UUID', 'immutable source/live releases/accepted records/history survive'],
    },
    auth: {
      execution: 'UNRUN', freshStack: true, realMemberships: true, noLoginForbidden: true,
      viewports: ['desktop', '390px keyboard'],
      cases: ['canonical stored app read', 'exact native candidate draft and native decision', 'installed Version draft and exact Version decision',
        'non-maker owner original-word Request at Asked', 'current actor/workspace switching and revocation', 'saved conversation restart/current reread',
        'no approval/publish/send in chat', 'malformed/lost package reply, current GET only and late scope response'],
      intent: 'Scripted model transport may qualify HTTP/tool orchestration, not model understanding; capture real authorized model asks separately without inventing provider permission.',
    },
    fullRelease: 'P07/full native assistance, all eight levels, native34, no-login and commercial/provider proof remain open.',
  };
}
