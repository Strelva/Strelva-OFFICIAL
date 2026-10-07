/** Calendar health needs an owner action, never an approval or a provider write. */
import { z } from "zod";
import { resolveOwnerRecipient, type OwnerRecipient } from "@/platform/business-record";
import type { SendEmailInput, SendEmailResult } from "@/platform/infra/email/send";
import { needsYouReleaseEnabled } from "@/platform/needs-you/release";
import { bookingCalendarBusyEnabled, bookingOwnerNoticeEnabled, bookingReadSource, bookingStoreWriteEnabled } from "./flags";
import { bookingStoreDb } from "./store";

const snapshotSchema = z.object({ businessName: z.string(), timezone: z.string(), actions: z.array(z.object({
  id: z.string().uuid(), revision: z.string(), provider: z.enum(["google", "outlook"]),
  status: z.enum(["error", "revoked"]), delivery: z.enum(["not_sent", "claimed", "sent", "suppressed", "failed"]),
})).max(2) });
export type BookingCalendarHealthSnapshot = z.infer<typeof snapshotSchema>;
export interface BookingCalendarHealthPorts {
  enabled(): Promise<boolean>;
  sync(workspaceId: string): Promise<BookingCalendarHealthSnapshot>;
  recipient(workspaceId: string): Promise<OwnerRecipient | null>;
  claim(workspaceId: string, id: string, revision: string, day: string): Promise<boolean>;
  finish(workspaceId: string, id: string, status: "sent" | "suppressed" | "failed", provider: string | null, reason: string | null): Promise<void>;
}
async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const db = bookingStoreDb();
  if (!db) throw new Error("booking_calendar_health_unconfigured");
  const call = db.rpc(name, args);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      Promise.resolve(call.abortSignal ? call.abortSignal(AbortSignal.timeout(5000)) : call),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("booking_calendar_health_timeout")), 5000); }),
    ]);
    if (response.error) throw new Error("booking_calendar_health_unavailable");
    return response.data;
  } finally { if (timer) clearTimeout(timer); }
}
export const bookingCalendarHealthPorts: BookingCalendarHealthPorts = {
  async enabled() {
    // Off means no health reads, no ledger writes, no email.
    return needsYouReleaseEnabled() && bookingStoreWriteEnabled() && bookingCalendarBusyEnabled() && bookingOwnerNoticeEnabled()
      && await bookingReadSource() === "postgres";
  },
  async sync(workspaceId) { return snapshotSchema.parse(await rpc("sync_booking_calendar_health", { p_workspace_id: workspaceId })); },
  recipient: resolveOwnerRecipient,
  async claim(workspaceId, id, revision, day) {
    return await rpc("claim_booking_calendar_health", { p_workspace_id: workspaceId, p_id: id, p_revision: revision, p_day: day }) === true;
  },
  async finish(workspaceId, id, status, provider, reason) {
    const finished = await rpc("finish_booking_calendar_health", { p_workspace_id: workspaceId, p_id: id, p_status: status, p_provider: provider, p_reason: reason });
    if (finished !== true) throw new Error("booking_calendar_health_receipt_unavailable");
  },
};

/** Called by the existing hourly Needs You chase; only 07:00 local can send. */
export async function chaseBookingCalendarHealth(workspaceId: string, input: {
  now: number; appOrigin: string; sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
}, ports: BookingCalendarHealthPorts = bookingCalendarHealthPorts) {
  const summary = { digests: 0, ownerNotTold: 0, failed: 0, complete: true };
  if (!await ports.enabled()) return summary;
  let snapshot: BookingCalendarHealthSnapshot;
  try { snapshot = await ports.sync(workspaceId); }
  catch { return { ...summary, failed: 1, complete: false }; }
  const zone = (() => { try { new Intl.DateTimeFormat("en", { timeZone: snapshot.timezone }); return snapshot.timezone; } catch { return "America/New_York"; } })();
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: zone, hour: "numeric", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(input.now);
  if (local.find(part => part.type === "hour")?.value !== "07") return summary;
  const day = ["year", "month", "day"].map(type => local.find(part => part.type === type)?.value).join("-");
  for (const action of snapshot.actions) {
    if (action.delivery === "sent" || action.delivery === "claimed") continue;
    let recipient: OwnerRecipient | null;
    try {
      recipient = await ports.recipient(workspaceId);
      if (!await ports.claim(workspaceId, action.id, action.revision, day)) continue;
    } catch { summary.failed++; summary.complete = false; continue; }
    let status: "sent" | "suppressed" | "failed" = "failed";
    let provider: string | null = null;
    let reason: string | null = "send_failed";
    if (!recipient?.email?.trim()) { status = "suppressed"; reason = "no_owner_recipient"; }
    else {
      try {
        const result = await input.sendEmail({ audience: "client", to: recipient.email.trim().toLowerCase(),
          ...(recipient.tenantId ? { tenantId: recipient.tenantId } : {}),
          subject: `${snapshot.businessName}: reconnect your booking calendar`,
          idempotencyKey: `needs-you:booking-calendar:${action.id}`,
          tags: { stream: "needs_you", kind: "health.owner_action", lifecycle: "booking_calendar_health" },
          options: { heading: "Your booking calendar needs you", paragraphs: [
            `Your ${action.provider === "google" ? "Google" : "Outlook"} calendar connection for ${snapshot.businessName} needs reconnecting. Strelva cannot reliably check its busy times until it is connected again.`,
            "Your bookings remain in Strelva. Sign in to review the connection and reconnect your calendar. Opening this link does not change calendar access.",
          ], button: { label: "Open calendar connection", url: `${input.appOrigin.replace(/\/+$/, "")}/workspace/bookings?workspaceId=${encodeURIComponent(workspaceId)}` }, footerNote: `for ${snapshot.businessName}` },
        });
        status = result.status === "accepted" ? "sent" : "suppressed";
        provider = result.status === "accepted" ? result.providerMessageId : null;
        reason = result.status === "suppressed" ? result.reason : null;
      } catch { /* A provider failure is recorded without exposing its raw error. */ }
    }
    // If this write fails after acceptance, the claim stays claimed: never replay it.
    try { await ports.finish(workspaceId, action.id, status, provider, reason); }
    catch { summary.failed++; summary.complete = false; }
    if (status === "sent") summary.digests++;
    if (status === "suppressed") summary.ownerNotTold++;
    if (status === "failed") summary.failed++;
  }
  return summary;
}
