/**
 * Keep your site gates. Server only.
 *
 * Off unless STRELVA_KEEP_YOUR_SITE_RELEASE is `1` or `workspace`, connected
 * sites are on for the same business, and then per business by its
 * `keep_your_site` row.
 */
import { releaseFlagMayBeOn } from "@/platform/release-flags/resolve";
import { workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";
import { emailSendingEnabled } from "@/platform/infra/email/enabled";
import { ownerEmailStreamOn } from "@/platform/infra/email/owner-streams";
import { connectedSitesReleaseEnabled, connectedSitesReleasedFor } from "./release";

/** The cheap early gate: keep-your-site could be on for at least one business. */
export const keepYourSiteMayBeOn = () => connectedSitesReleaseEnabled() && releaseFlagMayBeOn("keep_your_site");

export async function keepYourSiteReleasedFor(actor: { userId: string }, workspaceId: string): Promise<boolean> {
  if (!keepYourSiteMayBeOn()) return false;
  if (!(await connectedSitesReleasedFor(actor, workspaceId).catch(() => false))) return false;
  const { releaseViewerFor } = await import("@/platform/release-flags/viewer");
  return workspaceReleaseFlagEnabled("keep_your_site", workspaceId, await releaseViewerFor(actor)).catch(() => false);
}

/** Built and default off: owner email for planned connected-site changes. The
 * needs_you owner email stream (confirmed owners only) counts as sending. */
export function connectedSiteChangeOwnerEmailEnabled(): boolean {
  return (emailSendingEnabled() || ownerEmailStreamOn("needs_you")) && process.env.STRELVA_CONNECTED_SITE_CHANGE_OWNER_EMAIL === "1";
}
