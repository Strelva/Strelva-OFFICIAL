import { journeyProfile, preflight } from './full-model-journey-profile.mjs';
import admission from "../tests/support/creator-maintenance-admission.cjs";
export const creatorMaintenanceCase = admission.creatorMaintenanceCase;
export function creatorMaintenanceProfile() {
  const native = journeyProfile('full-native');
  return { ...native, name: 'creator-maintenance-local', env: { ...native.env, STRELVA_REVENUE_SPLITS: '1' },
    specs: [{ file: 'tests/creator-maintenance-authenticated-local.spec.ts', count: 1, cases: [{ title: creatorMaintenanceCase, project: 'desktop' }] }],
    providerActions: 'held', completionClaim: 'local-creator-maintenance-only', serverProfile: 'full-native',
    supplementalSwitches: ['STRELVA_REVENUE_SPLITS'],
  };
}
export function creatorMaintenancePreflight(root, env) {
  preflight(creatorMaintenanceProfile(), root);
  return admission.creatorMaintenancePreflight(env);
}
