import { workspaceReleaseEnabled } from "@/platform/workspace-release";

/**
 * The owner door, "Use it yourself": direct business sign-up on /sign-up,
 * the check-to-business handoff ("Start with this fix" creates the business
 * from the check's name and website) and the Getting started first-run view.
 *
 * Exposure only, on top of `STRELVA_WORKSPACE_RELEASE`, modeled on
 * `agencySignupReleaseEnabled`. Off (the default): /sign-up shows the closed
 * copy to anyone without an invitation or an open agency door, a check result
 * saves into the current workspace as before, and setup lands where it did.
 * Supabase still creates an account on any first magic link or Google sign-in;
 * this flag decides what the public door offers, not who can authenticate.
 */
export function businessSignupReleaseEnabled(
  environment: { STRELVA_BUSINESS_SIGNUP_RELEASE?: string } = { STRELVA_BUSINESS_SIGNUP_RELEASE: process.env.STRELVA_BUSINESS_SIGNUP_RELEASE },
): boolean {
  return workspaceReleaseEnabled() && environment.STRELVA_BUSINESS_SIGNUP_RELEASE === "1";
}

export const GETTING_STARTED_PATH = "/workspace/getting-started";

/** The first-run view of one business. Navigation only; the page checks access. */
export function gettingStartedHref(workspaceId: string, requestId?: string | null, checkWorkId?: string | null): string {
  const query = new URLSearchParams({ workspaceId });
  if (requestId) query.set("request", requestId);
  if (checkWorkId) query.set("check", checkWorkId);
  return `${GETTING_STARTED_PATH}?${query}`;
}
