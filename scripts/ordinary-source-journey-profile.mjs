import { journeyProfile, preflight } from './full-model-journey-profile.mjs';
import admission from '../tests/support/ordinary-source-admission.cjs';
export const ordinarySourceCase = admission.ordinarySourceCase;
export function ordinarySourceProfile() {
 const native = journeyProfile('full-native');
 return { ...native, name: 'ordinary-source-local', specs: [{ file: 'tests/ordinary-source-authenticated-local.spec.ts', count: 1, cases: [{ title: ordinarySourceCase, project: 'desktop' }] }], providerActions: 'held', completionClaim: 'local-ordinary-source-only', serverProfile: 'full-native', supplementalSwitches: [] };
}
export function ordinarySourcePreflight(root, env) { preflight(ordinarySourceProfile(), root); return admission.ordinarySourcePreflight(env); }
