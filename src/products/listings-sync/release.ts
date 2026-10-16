import { builtInAppReleaseReached, builtInAppReleaseMayReach } from "@/platform/app-releases/server";
import { NO_VIEWER, type ReleaseViewer } from "@/platform/release-flags/resolve";
import { emailSendingEnabled } from "@/platform/infra/email/enabled";
import { ownerEmailStreamOn } from "@/platform/infra/email/owner-streams";

/** The Listings in sync App: switches only. Everything is off unless a flag is set. */
export const LISTINGS_APP = "listings_sync" as const;
export const LISTINGS_COMPARE = "listings_sync.compare";
export const LISTINGS_GOOGLE_FIX = "listings_sync.google_fix";

export const listingsSyncMayBeOn = (env = process.env) => builtInAppReleaseMayReach(LISTINGS_APP, LISTINGS_COMPARE, env);

export async function listingsSyncAvailable(workspaceId: string, viewer: ReleaseViewer = NO_VIEWER): Promise<boolean> {
  if (!listingsSyncMayBeOn()) return false;
  try { return await builtInAppReleaseReached(LISTINGS_APP, LISTINGS_COMPARE, workspaceId, viewer); } catch { return false; }
}

export async function listingsGoogleFixReached(workspaceId: string, viewer: ReleaseViewer = NO_VIEWER): Promise<boolean> {
  try { return await builtInAppReleaseReached(LISTINGS_APP, LISTINGS_GOOGLE_FIX, workspaceId, viewer); } catch { return false; }
}

export const listingsYelpEnabled = (env = process.env) => env.STRELVA_LISTINGS_SYNC_YELP?.trim() === "1";

/** Needs you email for listings items: its own switch AND sending (EMAIL_SENDING_ENABLED, or the needs_you owner email stream, which mails confirmed owners only). */
export const listingsOwnerEmailEnabled = (env = process.env) => (emailSendingEnabled() || ownerEmailStreamOn("needs_you", env)) && env.STRELVA_LISTINGS_SYNC_OWNER_EMAIL?.trim() === "1";
