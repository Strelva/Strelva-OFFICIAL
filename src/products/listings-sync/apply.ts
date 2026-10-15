import { systemOriginId } from "@/platform/systems/invariants";
import { tenantPublishingPorts } from "@/platform/infra/tenant-publishing";
import { readBusinessRecord } from "@/platform/business-record/service";
import { createBusinessFactReviewStore } from "@/platform/needs-you/sources/business-facts";
import { setTenantBookingHours } from "@/platform/bookings/store";
import { PostgresServiceRequestStore, ServiceRequestConflictError, ServiceRequestService } from "@/platform/service-requests";
import { readSiteChangeProvider } from "@/platform/service-requests/provider-options";
import { WorkspaceAccessError, WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";
import { prepareGoogleListingDraft } from "@/products/google-listing/server";
import { siteChangeRequestCommand } from "@/products/websites/client";
import { siteEditingFor } from "@/products/websites/server";
import type { ListingFix } from "./contracts";
import { queueListingsCheck } from "./check";
import { listingsGoogleFixReached } from "./release";
import { readListingsPlanForService, type OpenListingsPlanWithFixes } from "./open-plan";
import { listingsSyncStore } from "./store";
import { listingsTenantPorts } from "./ports";

export class ListingsPlanChangedError extends WorkspaceConflictError {}

export interface ApplyDeps {
  store: Pick<typeof listingsSyncStore, "setFix">;
  record: (actor: WorkspaceActor, workspaceId: string) => Promise<{ access: string; revision: number }>;
  reviews: () => { read(workspaceId: string): Promise<{ changes: Array<{ entity: string; id: string }> } | null> };
  openPlan: (workspaceId: string) => Promise<OpenListingsPlanWithFixes | null>;
  googleFix: (workspaceId: string) => Promise<boolean>;
  prepareGoogle: (actor: WorkspaceActor, input: Parameters<typeof prepareGoogleListingDraft>[1]) => Promise<{ id: string; status?: string }>;
  approveGoogle: (tenantId: string, eventId: string, actorId: string) => Promise<{ changed: boolean; reason?: string }>;
  bookingHours: typeof setTenantBookingHours;
  provider: (actor: WorkspaceActor, workspaceId: string) => Promise<{ kind: "agency"; agencyWorkspaceId: string }>;
  tenant: (tenantId: string) => Promise<{ id: string; deliveryModel?: string; customRepo?: unknown } | null>;
  requests: (actor: WorkspaceActor, command: unknown) => Promise<{ id: string }>;
  queue: typeof queueListingsCheck;
}

export const liveApplyDeps: ApplyDeps = {
  store: listingsSyncStore,
  record: readBusinessRecord,
  reviews: () => createBusinessFactReviewStore(),
  openPlan: id => readListingsPlanForService(id),
  googleFix: id => listingsGoogleFixReached(id),
  prepareGoogle: prepareGoogleListingDraft,
  approveGoogle: async (tenantId, eventId, actorId) => (await tenantPublishingPorts()).resolveEventAction(tenantId, eventId, "approved", actorId),
  bookingHours: setTenantBookingHours,
  provider: readSiteChangeProvider,
  tenant: async id => (await (await listingsTenantPorts()).tenant(id)),
  requests: (actor, command) => new ServiceRequestService(PostgresServiceRequestStore).execute(actor, command),
  queue: queueListingsCheck,
};

const RANK: Record<string, number> = { booking_hours: 0, google_hours: 1, google_info: 1, site_request: 2 };
const short = (value: unknown, fallback: string) => (value instanceof Error && value.message ? value.message : fallback).replace(/\s+/g, " ").slice(0, 300);
const str = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * The owner's "Hold to make it live". Writes only through the existing paths:
 * booking hours, the Google draft and approval (with its receipts), and a
 * Request to the business's agency. Never retries a provider write: running it
 * again with the same fix ids is idempotent (the Google draft uses the fix id
 * as its command id; the Request uses the idempotency key listings-sync:<fixId>).
 * An after_fix check then re-reads every place, and a fix becomes verified only
 * when its place reads as matching.
 */
export async function applyListingFixes(actor: WorkspaceActor, workspaceId: string, expectedHash: string, deps: ApplyDeps = liveApplyDeps): Promise<{ applied: number; failed: Array<{ fixId: string; reason: string }>; checkId: string | null }> {
  const record = await deps.record(actor, workspaceId);
  if (record.access !== "owner") throw new WorkspaceAccessError("Only the business owner makes these changes live.");
  const plan = await deps.openPlan(workspaceId);
  if (!plan || plan.hash !== expectedHash) throw new ListingsPlanChangedError("These details changed since they were shown. Check again.");

  const pending = await deps.reviews().read(workspaceId).catch(() => null);
  const blocked = new Set((pending?.changes ?? []).filter(change => change.entity === "fact").map(change => change.id));

  let applied = 0;
  const failed: Array<{ fixId: string; reason: string }> = [];
  const mark = async (fix: ListingFix, to: "applied" | "failed", outcomeRef: string | null, reason: string | null) => {
    await deps.store.setFix(workspaceId, fix.id, ["proposed", "failed", "applying"], to, { outcomeRef, reason, decidedBy: actor.userId });
    if (to === "applied") applied += 1; else failed.push({ fixId: fix.id, reason: reason ?? "This change didn't go through." });
  };

  const ordered = plan.fixes.filter(fix => fix.kind !== "owner_todo").sort((a, b) => (RANK[a.kind] ?? 9) - (RANK[b.kind] ?? 9));
  for (const fix of ordered) {
    try {
      await deps.store.setFix(workspaceId, fix.id, ["proposed", "failed"], "applying", { decidedBy: actor.userId });
    } catch (error) {
      failed.push({ fixId: fix.id, reason: short(error, "This change was already handled.") });
      continue;
    }
    const proposed = fix.proposed;
    try {
      if (fix.kind === "booking_hours") {
        const result = await deps.bookingHours(workspaceId, str(proposed.scope), (proposed.weekly as Array<{ day: number; opens: string; closes: string }>) ?? []);
        await mark(fix, "applied", `booking:${result.revision}`, null);
      } else if (fix.kind === "google_hours" || fix.kind === "google_info") {
        if (!(await deps.googleFix(workspaceId))) { await mark(fix, "failed", null, "Google changes are off for this business."); continue; }
        // The draft is built from the full record, which can hold unconfirmed provider edits (#509).
        if (blocked.has(fix.kind === "google_hours" ? "hours" : "phone")) { await mark(fix, "failed", null, "Confirm your changed details first."); continue; }
        const draft = await deps.prepareGoogle(actor, {
          workspaceId, tenantId: str(proposed.tenantId), locationId: str(proposed.locationId), kind: fix.kind === "google_hours" ? "hours" : "info",
          commandId: fix.id, expectedRecordRevision: record.revision,
          ...(fix.kind === "google_info" ? { infoFields: (proposed.infoFields as Array<"phone" | "description" | "links">) ?? ["phone"] } : {}),
        });
        if (draft.status === "dismissed") { await mark(fix, "failed", null, "This Google change was declined earlier."); continue; }
        if (draft.status === "approved") { await mark(fix, "applied", `google:${draft.id}`, null); continue; }
        const result = await deps.approveGoogle(str(proposed.tenantId), draft.id, actor.userId);
        if (result.changed) await mark(fix, "applied", `google:${draft.id}`, null);
        else if (result.reason === "google_write_unconfirmed" || result.reason === "action_reconciliation_required") await mark(fix, "applied", `google:${draft.id}`, "Google's result couldn't be confirmed yet.");
        else if (result.reason === "setup_pending") await mark(fix, "failed", null, "Waiting on Google");
        else await mark(fix, "failed", null, result.reason ?? "Google refused this change.");
      } else if (fix.kind === "site_request") {
        let provider: Awaited<ReturnType<ApplyDeps["provider"]>>;
        try { provider = await deps.provider(actor, workspaceId); }
        catch (error) {
          if (error instanceof ServiceRequestConflictError) { await mark(fix, "failed", null, "No agency is set up to change your website."); continue; }
          throw error;
        }
        const lines = Array.isArray(proposed.lines) ? (proposed.lines as unknown[]).map(str).filter(Boolean) : [];
        const siteUrl = str(proposed.siteUrl);
        let host = siteUrl;
        try { host = new URL(siteUrl).hostname; } catch { /* keep the raw text */ }
        const words = `Make the business details on ${host} match the confirmed details. ${lines.join(" ")}`.slice(0, 3000);
        const idempotencyKey = `listings-sync:${fix.id}`;
        let command: unknown;
        if (proposed.kind === "tenant") {
          const config = await deps.tenant(str(proposed.tenantId));
          if (!config) { await mark(fix, "failed", null, "This website couldn't be found."); continue; }
          command = siteChangeRequestCommand({
            provider, workspaceId, systemId: systemOriginId(workspaceId, { kind: "tenant", ref: str(proposed.tenantStableId) }),
            tenantStableId: str(proposed.tenantStableId), editing: siteEditingFor({ id: config.id, deliveryModel: config.deliveryModel as "custom_repo" | "platform_template" | undefined, customRepo: config.customRepo as Parameters<typeof siteEditingFor>[0]["customRepo"] }), words, idempotencyKey,
          });
        } else {
          // The keep-your-site seam: a plain Request until that lane's platform change path lands.
          command = {
            action: "save", businessId: workspaceId, status: "requested", request: words, outcome: words,
            context: { source: "listing_fix", connectedSiteId: str(proposed.siteId), siteUrl, platform: str(proposed.platform) || "unknown" },
            scope: ["website.platform_change"], provider, idempotencyKey,
          };
        }
        const saved = await deps.requests(actor, command);
        await mark(fix, "applied", `request:${saved.id}`, null);
      }
    } catch (error) {
      try { await mark(fix, "failed", null, short(error, "This change didn't go through.")); }
      catch { failed.push({ fixId: fix.id, reason: short(error, "This change didn't go through.") }); }
    }
  }

  const checkId = await deps.queue(workspaceId, "after_fix", actor.userId).catch(() => null);
  return { applied, failed, checkId };
}
