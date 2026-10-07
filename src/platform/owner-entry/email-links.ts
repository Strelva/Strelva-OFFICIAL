import { resolveTenantOwnerRecipient } from "@/platform/business-record/service";
import { workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";
import { askReleaseMayBeOn } from "@/platform/ask/release";
import { needsYouReleaseEnabled } from "@/platform/needs-you/release";
import { ownerEntryPossible } from "./env";
import { routeDashboardRequest } from "./decision";

/** Navigation only. The destination still authorizes the viewer; this grants no access. */
export async function ownerNoticeWorkspaceUrl(tenant: { id: string; stableId?: string }, path: string, legacyUrl: string): Promise<string> {
  if (!ownerEntryPossible() || tenant.id === "demo") return legacyUrl;
  try {
    const recipient = await resolveTenantOwnerRecipient(tenant.id);
    if (!recipient?.workspaceId || !(await workspaceReleaseFlagEnabled("owner_entry", recipient.workspaceId))) return legacyUrl;
    const flags = new Map<string, boolean>();
    const [systems, inquiries, rebuild] = await Promise.all(["systems", "inquiries", "website_rebuild"].map(flag => workspaceReleaseFlagEnabled(flag as "systems" | "inquiries" | "website_rebuild", recipient.workspaceId!)));
    flags.set("systems", systems); flags.set("inquiries", inquiries); flags.set("website_rebuild", rebuild);
    flags.set("needs_you", needsYouReleaseEnabled()); flags.set("ask", systems && askReleaseMayBeOn());
    const result = routeDashboardRequest({ decision: { kind: "workspace", workspaceId: recipient.workspaceId,
      tenantStableId: tenant.stableId ?? null, operator: false, tester: false }, pathWithSearch: path, flagOn: flag => flags.get(flag) === true });
    return result.kind === "redirect" ? new URL(result.location, legacyUrl).toString() : legacyUrl;
  } catch { return legacyUrl; }
}
