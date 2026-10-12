import { AsyncLocalStorage } from "node:async_hooks";
import type { AgencyAttribution } from "@/platform/infra/agency-attribution";
import { admitAgencyCheck, AgencyProspectingError } from "./server";

type Admission = { agencyId?: string; promise?: Promise<void> };
const combinedCheck = new AsyncLocalStorage<Admission>();

/** Only the server's combined route creates this scope. No request field can bypass admission. */
export function withCombinedCheckAdmission<T>(run: () => Promise<T>): Promise<T> {
  return combinedCheck.run({}, run);
}

export function admitPublicAgencyCheck(agency: AgencyAttribution): Promise<void> {
  const scope = combinedCheck.getStore();
  if (!scope) return admitAgencyCheck(agency);
  if (scope.agencyId && scope.agencyId !== agency.workspaceId) {
    return Promise.reject(new AgencyProspectingError("The agency identity changed during this check. Please try again.", 503));
  }
  if (!scope.promise) {
    scope.agencyId = agency.workspaceId;
    scope.promise = admitAgencyCheck(agency);
  }
  return scope.promise;
}
