import { builtInAppReleaseReached, builtInAppReleaseMayReach } from "@/platform/app-releases/server";
import { NO_VIEWER, type ReleaseViewer } from "@/platform/release-flags/resolve";
import { emailSendingEnabled } from "@/platform/infra/email/enabled";

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

/** Needs you email for listings items. Client email stays off by decision: this needs its own switch AND EMAIL_SENDING_ENABLED. */
export const listingsOwnerEmailEnabled = (env = process.env) => emailSendingEnabled() && env.STRELVA_LISTINGS_SYNC_OWNER_EMAIL?.trim() === "1";
