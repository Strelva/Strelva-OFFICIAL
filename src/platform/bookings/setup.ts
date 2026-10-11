/** Booking-only setup. Instant mode is an owner-approved standing policy. */
import { resolveBookingScope } from "./booking-scope";
import { createHash } from "node:crypto";
import { z } from "zod";
import { bookingServicePolicySchema } from "./service-policy";
import { bookingReadSource, bookingStoreWriteEnabled } from "@/platform/bookings/flags";
import { bookingStoreDb } from "@/platform/bookings/store";
import type { SourceAdapter } from "@/platform/needs-you/adapters";
import type { ProposedItem } from "@/platform/needs-you/contracts";
import type { WorkspaceActor } from "@/platform/workspaces/types";

export const bookingSettingsChange = z.object({
  workspaceId: z.string().uuid(), tenantId: z.string().min(1).max(80).optional(), expectedRevision: z.number().int().min(0),
  services: z.array(bookingServicePolicySchema).max(100).optional().refine(rows => !rows || new Set(rows.map(row => row.businessServiceId)).size === rows.length, "Services must be unique."),
  mode: z.enum(["request", "instant"]), bufferMinutes: z.number().int().min(0).max(120),
  minNoticeMinutes: z.number().int().min(0).max(43_200), maxAdvanceDays: z.number().int().min(1).max(60),
  maxPerDay: z.number().int().min(1).max(1000).nullable(), cancellationCutoffHours: z.number().int().min(0).max(168),
}).strict();
export type BookingSettingsChange = z.infer<typeof bookingSettingsChange>;
export class BookingSettingsError extends Error {
  constructor(public code: "unavailable" | "forbidden" | "conflict", message: string) { super(message); }
}
export async function bookingSettingsEnabled(): Promise<boolean> {
  return process.env.STRELVA_BOOKING_SETTINGS === "1" && bookingStoreWriteEnabled() && await bookingReadSource() === "postgres";
}
export interface BookingSettingsPorts {
  enabled(): Promise<boolean>;
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
}
async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const db = bookingStoreDb();
  if (!db) throw new BookingSettingsError("unavailable", "Booking settings are unavailable. Nothing changed.");
  const result = await db.rpc(name, args);
  if (result.error) {
    const message = result.error.message ?? "";
    if (/booking_settings_denied|booking_not_found/.test(message)) throw new BookingSettingsError("forbidden", "Only this business's owner or admin can change booking settings.");
    if (/booking_settings_stale|booking_invalid/.test(message)) throw new BookingSettingsError("conflict", "Settings changed. Open them again before saving.");
    throw new BookingSettingsError("unavailable", "Booking settings are unavailable. Nothing changed.");
  }
  return result.data;
}
const defaults: BookingSettingsPorts = { enabled: bookingSettingsEnabled, rpc };
async function requireEnabled(ports: BookingSettingsPorts) {
  if (!await ports.enabled()) throw new BookingSettingsError("unavailable", "Booking setup is not enabled. Nothing changed.");
}
export async function readBookingSettings(actor: WorkspaceActor, workspaceId: string, tenantId?: string, ports = defaults) {
  await requireEnabled(ports);
  return ports.rpc("read_booking_setup", { p_workspace_id: workspaceId, p_tenant_id: resolveBookingScope(workspaceId,tenantId), p_user_id: actor.userId, p_email: actor.verifiedEmail });
}
export async function changeBookingSettings(actor: WorkspaceActor, input: BookingSettingsChange, ports = defaults) {
  const parsed = bookingSettingsChange.parse(input);
  await requireEnabled(ports);
  return ports.rpc("configure_booking_setup", { p_workspace_id: parsed.workspaceId, p_tenant_id: resolveBookingScope(parsed.workspaceId,parsed.tenantId),
    p_user_id: actor.userId, p_email: actor.verifiedEmail, p_settings: parsed });
}
const policySchema = z.object({ id: z.string().uuid(), workspaceId: z.string().uuid(), tenantId: z.string(), revision: z.number().int(),
  settingsRevision: z.number().int(), siteName: z.string(), serviceName: z.string().optional(), status: z.enum(["proposed", "active", "declined"]) });
type InstantPolicy = z.infer<typeof policySchema>;
function revision(policy: InstantPolicy) { return createHash("sha256").update(JSON.stringify([policy.id, policy.revision, policy.settingsRevision])).digest("hex"); }
function item(policy: InstantPolicy): ProposedItem {
  return { kind: "running.approve", route: "owner_decides", title: `Strelva confirms ${policy.serviceName ? policy.serviceName + " bookings" : "bookings"} for ${policy.siteName}`.slice(0, 200),
    detail: "Strelva confirms bookings in your open hours using the approved buffer, notice, horizon and daily limit. Calendar outages still require your decision.",
    approveEffect: "New bookings are confirmed automatically under these settings.", notYetEffect: "Bookings keep requiring your confirmation.",
    sourceLifecycle: "booking_settings", sourceId: policy.id, revisionHash: revision(policy), urgent: false, adminMayDecide: false,
    openHref: `/workspace/bookings?${new URLSearchParams({ workspaceId: policy.workspaceId })}` };
}
/** Needs you authenticates an owner link; SQL independently checks session owners. No new email path. */
export function bookingSettingsAdapter(ports: BookingSettingsPorts = defaults): SourceAdapter {
  async function list(workspaceId: string) {
    if (!await ports.enabled()) return [];
    const rows = await ports.rpc("read_booking_instant_policies", { p_workspace_id: workspaceId });
    return z.array(policySchema).parse(rows);
  }
  return { lifecycle: "booking_settings", needsMemberActor: false,
    async propose(ctx) {
      try { return { items: (await list(ctx.workspaceId)).filter(p => p.status === "proposed").map(item), complete: true }; }
      catch { return { items: [], complete: false }; }
    },
    async currentRevision(ctx, id) { const policy = (await list(ctx.workspaceId)).find(p => p.id === id && p.status === "proposed"); return policy ? revision(policy) : null; },
    async resolve(ctx, decisionItem, decision, by) {
      try {
        await requireEnabled(ports);
        const policy = (await list(ctx.workspaceId)).find(p => p.id === decisionItem.sourceId && p.status === "proposed");
        if (!policy) return { outcome: "done", reason: "already_resolved" };
        if (revision(policy) !== decisionItem.revisionHash) return { outcome: "failed", reason: "revision_changed" };
        const actor = by.kind === "session" ? by.actor : null;
        await ports.rpc("decide_booking_instant_policy", { p_workspace_id: ctx.workspaceId, p_policy_id: policy.id,
          p_revision: policy.revision, p_decision: by.kind === "expiry" ? "not_yet" : decision,
          p_user_id: actor?.userId ?? null, p_email: actor?.verifiedEmail ?? null, p_owner_link: by.kind !== "session" });
        return { outcome: "done", receiptRef: `booking-settings:${policy.id}:${decision}` };
      } catch { return { outcome: "failed", reason: "booking_settings_not_approved" }; }
    } };
}
