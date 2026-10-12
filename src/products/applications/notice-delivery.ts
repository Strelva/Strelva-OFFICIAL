import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { sendEmailWithReceipt, type SendEmailInput, type SendEmailResult } from "@/platform/infra/email/send";
import { customerEmailEnabled, emailSendingEnabled } from "@/platform/infra/email/enabled";
import { getClientEmailOverride } from "@/platform/infra/email/client-override";
import { releaseFlagMayBeOn } from "@/platform/release-flags/resolve";
import { workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";

export type NoticeDb = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };
const deliverySchema = z.object({
  audience: z.literal("client"), tenantId: z.string().optional(),
  to: z.union([z.string().email(), z.array(z.string().email()).min(1).max(2)]), subject: z.string().max(150),
  idempotencyKey: z.string(), tags: z.record(z.string(), z.string()),
  options: z.object({ heading: z.string(), paragraphs: z.array(z.string()), button: z.object({ label: z.string(), url: z.string().url() }) }),
});
const leaseSchema = z.object({ noticeId: z.string().uuid(), workspaceId: z.string().uuid(), lease: z.string().uuid(), delivery: deliverySchema });

export function toolNoticesMayBeOn(): boolean {
  return releaseFlagMayBeOn("systems") && releaseFlagMayBeOn("internal_tool_notices");
}

/** Both global gates always apply to this new sender, even with tenant on. */
async function gates(input: SendEmailInput): Promise<boolean> {
  return emailSendingEnabled() && customerEmailEnabled()
    && (!input.tenantId || await getClientEmailOverride(input.tenantId) !== "off");
}

/** SQL leases known failures only and freezes the complete first transport.
 * An accepted send whose finish write fails stays pending for operator review.
 * It is never automatically resent, including beyond provider dedup retention. */
export async function deliverToolNotice(db: NoticeDb, noticeId: string, workspaceId: string, input?: SendEmailInput,
  send: (input: SendEmailInput) => Promise<SendEmailResult> = sendEmailWithReceipt): Promise<"duplicate" | "sent" | "suppressed" | "failed"> {
  const claimed = await db.rpc("lease_internal_tool_notice", {
    p_notice_id: noticeId, p_workspace_id: workspaceId, p_delivery: input ?? null,
  });
  if (claimed.error) throw new Error("The notice delivery could not be claimed.");
  if (!claimed.data) return "duplicate";
  const leased = leaseSchema.parse(claimed.data);
  if (leased.noticeId !== noticeId || leased.workspaceId !== workspaceId) throw new Error("Notice identity changed.");
  let status: "sent" | "suppressed" | "failed";
  let providerMessageId: string | null = null;
  try {
    const result = await gates(leased.delivery) ? await send(leased.delivery) : { status: "suppressed" as const };
    status = result.status === "accepted" ? "sent" : "suppressed";
    if (result.status === "accepted") providerMessageId = result.providerMessageId;
  } catch { status = "failed"; }
  const finished = await db.rpc("finish_internal_tool_notice_delivery", {
    p_notice_id: noticeId, p_workspace_id: workspaceId, p_lease: leased.lease, p_status: status, p_provider_message_id: providerMessageId,
  }).then(value => value, () => ({ data: false, error: { message: "unavailable" } }));
  if (finished.error || finished.data !== true) console.error("[internal-tool-notice] delivery outcome unconfirmed", { noticeId, status });
  return status;
}

/** Called by the existing workspace-work cron. Flags off: no database read,
 * sender call or change to the cron's response. Suppressed sends stay held. */
export async function retryToolNotices(): Promise<{ processed: number; failed: number }> {
  const result = { processed: 0, failed: 0 };
  if (!toolNoticesMayBeOn()) return result;
  const db = getSupabase() as unknown as NoticeDb | null;
  if (!db) throw new Error("Notice storage is unavailable.");
  const due = await db.rpc("list_internal_tool_notice_retries", {});
  if (due.error) throw new Error("Notice retries could not be read.");
  const rows = z.array(z.object({ noticeId: z.string().uuid(), workspaceId: z.string().uuid() })).max(20).parse(due.data);
  for (const row of rows) {
    if (!await workspaceReleaseFlagEnabled("systems", row.workspaceId)
      || !await workspaceReleaseFlagEnabled("internal_tool_notices", row.workspaceId)) continue;
    try {
      const status = await deliverToolNotice(db, row.noticeId, row.workspaceId);
      if (status !== "duplicate") result.processed++;
      if (status === "failed") result.failed++;
    } catch { result.failed++; }
  }
  return result;
}
