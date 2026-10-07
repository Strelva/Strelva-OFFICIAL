import { customerEmailEnabled, emailSendingEnabled } from "@/platform/infra/email/enabled";
import { getClientEmailOverride } from "@/platform/infra/email/client-override";
import { workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";
import { getEventRaw } from "@/lib/events";
import type { DeliveryRow } from "@/platform/needs-you/repository";

export const PUBLISHING_EVENT_KINDS = new Set([
  "workspace_collection_publish", "workspace_newsletter_issue", "workspace_google_write", "record_google_change", "workspace_google_listing_draft",
]);

/** New publishing notices require every launch gate. A tenant override can
 * stop delivery, but cannot bypass either global gate for these new sends. */
export async function publishingNoticesEnabled(workspaceId: string, tenantId?: string | null): Promise<boolean> {
  if (process.env.STRELVA_PUBLISHING_NOTICES_SEND !== "1" || !emailSendingEnabled() || !customerEmailEnabled()) return false;
  if (!(await workspaceReleaseFlagEnabled("publishing", workspaceId))) return false;
  return !tenantId || await getClientEmailOverride(tenantId) !== "off";
}

/** A narrow extension of the existing Needs you digest. Legacy items keep
 * their existing delivery policy, and publishing items use the new gates. */
export async function publishingDecisionDeliveryAllowed(row: DeliveryRow): Promise<boolean> {
  if (row.sourceLifecycle !== "tenant_event") return true;
  const separator = row.sourceId.indexOf(":");
  if (separator <= 0) return true;
  const tenantId = row.sourceId.slice(0, separator);
  const event = await getEventRaw(row.sourceId.slice(separator + 1));
  if (!event || !PUBLISHING_EVENT_KINDS.has(String(event.metadata?.kind ?? ""))) return true;
  return publishingNoticesEnabled(row.workspaceId, tenantId);
}

/** A restored grant does not refresh an old approval. Drafts remain stored;
 * the executor must ask again when approval predates the seven-day cutoff. */
export function requiresGoogleReapprovalAfterReconnect(approvedAt: string | null, reconnectedAt: string, now = Date.now()): boolean {
  const approved = approvedAt ? Date.parse(approvedAt) : Number.NaN;
  const restored = Date.parse(reconnectedAt);
  return !Number.isFinite(approved) || !Number.isFinite(restored) || (approved < restored && now - approved > 7 * 24 * 60 * 60 * 1000);
}
