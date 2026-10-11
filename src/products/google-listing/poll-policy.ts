import { publishingReleaseEnabled } from "@/products/publishing/server";
import { tenantReleaseFlagEnabled } from "@/platform/release-flags/store";
import { readBindingTarget } from "@/platform/account-bindings/store";
import { readListingControl } from "./controls";
import { noteListingAccess } from "./controls";
import { classifyGoogleFailure } from "./client";

/** Pause stops drafting, never review synchronization. Off keeps the old poller path. */
export async function listingDraftingAllowed(tenantId: string, locationId?: string): Promise<boolean> {
  if (!publishingReleaseEnabled()) return true;
  if (!(await tenantReleaseFlagEnabled("publishing", tenantId))) return true;
  const target = await readBindingTarget(tenantId);
  if (!target) return true;
  try {
    if (!locationId) {
      const { readGoogleBindingForTenant } = await import("@/platform/account-bindings/store");
      const binding = await readGoogleBindingForTenant(tenantId);
      const primary = binding?.locations.find(item => item.isPrimary) ?? binding?.locations[0];
      if (!primary) return false;
      locationId = primary.locationId;
    }
    return !(await readListingControl(target.workspaceId, locationId.replace(/^locations\//, ""))).paused;
  }
  catch { return false; }
}

/** The poller's read result is health evidence, never authority to write.
 * Flags off performs no new storage calls. A quota-zero read keeps drafts
 * waiting even if nobody has tried approving a write yet. */
export async function noteTenantListingRead(tenantId: string, locationId: string, result: { status: number; detail?: string }, deps = {
  release: publishingReleaseEnabled,
  enabled: (tenant: string) => tenantReleaseFlagEnabled("publishing", tenant),
  target: readBindingTarget,
  note: noteListingAccess,
}): Promise<void> {
  if (!deps.release() || !(await deps.enabled(tenantId))) return;
  const target = await deps.target(tenantId);
  if (!target) return;
  if (result.status >= 200 && result.status < 300) await deps.note(target.workspaceId, locationId.replace(/^locations\//, ""), false);
  else if (classifyGoogleFailure(result.status, result.detail ?? "") === "setup_pending") await deps.note(target.workspaceId, locationId.replace(/^locations\//, ""), true);
}
