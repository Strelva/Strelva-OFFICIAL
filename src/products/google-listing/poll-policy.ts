import { publishingReleaseEnabled } from "@/products/publishing/server";
import { tenantReleaseFlagEnabled } from "@/platform/release-flags/store";
import { readBindingTarget } from "@/platform/account-bindings/store";
import { readListingControl } from "./controls";

/** Pause stops drafting, never review synchronization. Off keeps the old poller path. */
export async function listingDraftingAllowed(tenantId: string, locationId: string): Promise<boolean> {
  if (!publishingReleaseEnabled()) return true;
  if (!(await tenantReleaseFlagEnabled("publishing", tenantId))) return true;
  const target = await readBindingTarget(tenantId);
  if (!target) return true;
  try { return !(await readListingControl(target.workspaceId, locationId.replace(/^locations\//, ""))).paused; }
  catch { return false; }
}
