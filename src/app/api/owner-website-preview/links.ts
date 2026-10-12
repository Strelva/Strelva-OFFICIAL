import { ownerEntryPossible } from "@/platform/owner-entry/env";
import { releaseFlagMayBeOn } from "@/platform/release-flags/resolve";
import { needsYouReleaseEnabled } from "@/platform/needs-you/release";

export const OWNER_WEBSITE_PREVIEW_PATH = "/api/owner-website-preview";

/** Legacy approval pages need only this cheap gate and link, never the renderer. */
export function ownerWebsitePreviewMayBeOn(): boolean {
  return ownerEntryPossible() && needsYouReleaseEnabled()
    && releaseFlagMayBeOn("owner_decision_links") && releaseFlagMayBeOn("website_rebuild");
}

export function ownerWebsitePreviewHref(token: string): string {
  return `${OWNER_WEBSITE_PREVIEW_PATH}?${new URLSearchParams({ token })}`;
}
