import { workspaceReleaseEnabled } from "@/platform/workspace-release";

/**
 * The agency front door (agency 1.0 #258): "I run a business / I run an
 * agency" on /sign-up, the agency setup checklist at /workspace/agency/start
 * and its read, `GET /api/agency-onboarding`.
 *
 * Exposure only, on top of `STRELVA_WORKSPACE_RELEASE`. Off (the default):
 * sign-up reads as before, the checklist page redirects to /workspace and the
 * read answers 503. Agency creation itself (`create_agency`) is the ordinary
 * path and is not gated here.
 */
export function agencySignupReleaseEnabled(
  environment: { STRELVA_AGENCY_SIGNUP_RELEASE?: string } = { STRELVA_AGENCY_SIGNUP_RELEASE: process.env.STRELVA_AGENCY_SIGNUP_RELEASE },
): boolean {
  return workspaceReleaseEnabled() && environment.STRELVA_AGENCY_SIGNUP_RELEASE === "1";
}

export const AGENCY_START_PATH = "/workspace/agency/start";
