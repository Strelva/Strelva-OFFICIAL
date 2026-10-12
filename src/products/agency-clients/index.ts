import { workspaceReleaseEnabled } from "@/platform/workspace-release";

export * from "./contracts";

/** Agencies add clients (#259). Off unless STRELVA_AGENCY_ADD_CLIENT_RELEASE=1, on top of the workspace release. */
export function agencyAddClientReleaseEnabled(
  environment: { STRELVA_AGENCY_ADD_CLIENT_RELEASE?: string } = { STRELVA_AGENCY_ADD_CLIENT_RELEASE: process.env.STRELVA_AGENCY_ADD_CLIENT_RELEASE },
): boolean {
  return workspaceReleaseEnabled() && environment.STRELVA_AGENCY_ADD_CLIENT_RELEASE === "1";
}

/**
 * The claim review (Getting started L3): the add keeps every Found fact with
 * its source, the adding agency holds Prepare in every area until the claim,
 * and the owner's claim shows what was found and prepared and decides each
 * area. Off unless STRELVA_CLAIM_REVIEW_RELEASE=1, on top of the add-client release.
 */
export function claimReviewReleaseEnabled(
  environment: { STRELVA_AGENCY_ADD_CLIENT_RELEASE?: string; STRELVA_CLAIM_REVIEW_RELEASE?: string } = {
    STRELVA_AGENCY_ADD_CLIENT_RELEASE: process.env.STRELVA_AGENCY_ADD_CLIENT_RELEASE,
    STRELVA_CLAIM_REVIEW_RELEASE: process.env.STRELVA_CLAIM_REVIEW_RELEASE,
  },
): boolean {
  return agencyAddClientReleaseEnabled(environment) && environment.STRELVA_CLAIM_REVIEW_RELEASE === "1";
}
