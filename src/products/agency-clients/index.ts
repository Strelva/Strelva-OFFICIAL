import { workspaceReleaseEnabled } from "@/platform/workspace-release";

export * from "./contracts";

/** Agencies add clients (#259). Off unless STRELVA_AGENCY_ADD_CLIENT_RELEASE=1, on top of the workspace release. */
export function agencyAddClientReleaseEnabled(
  environment: { STRELVA_AGENCY_ADD_CLIENT_RELEASE?: string } = { STRELVA_AGENCY_ADD_CLIENT_RELEASE: process.env.STRELVA_AGENCY_ADD_CLIENT_RELEASE },
): boolean {
  return workspaceReleaseEnabled() && environment.STRELVA_AGENCY_ADD_CLIENT_RELEASE === "1";
}
