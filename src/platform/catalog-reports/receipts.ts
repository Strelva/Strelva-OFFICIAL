import { actorCopy } from "@/platform/presentation/actor";
import { z } from "zod";
import { callReleaseFlagsRpc, tenantReleaseFlagEnabled, workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";
import { releaseFlagMayBeOn } from "@/platform/release-flags/resolve";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { HandledReceipt } from "@/platform/needs-you/contracts";

export function catalogReportsMayBeOn(): boolean {
  return releaseFlagMayBeOn("catalog_reports");
}

export const reportOutcomeSchema = z.object({
  tenantId: z.string().min(1).max(120),
  kind: z.enum(["weekly", "monthly", "hosted_monthly"]),
  period: z.string().min(1).max(30),
  status: z.enum(["accepted", "suppressed", "failed"]),
  recipient: z.string().email().nullable().default(null),
  reason: z.string().max(500).nullable().default(null),
  providerMessageId: z.string().max(300).nullable().default(null),
});
export type ReportOutcome = z.input<typeof reportOutcomeSchema>;
const receiptSchema = reportOutcomeSchema.extend({ id: z.string().uuid(), workspaceId: z.string().uuid(), at: z.string().datetime({ offset: true }) });
export type CatalogReportReceipt = z.infer<typeof receiptSchema>;

/** Additive instrumentation only: off performs no reads or writes. A failed
 * receipt write never retries an already accepted provider send. */
export async function recordCatalogReport(raw: ReportOutcome): Promise<boolean> {
  if (!catalogReportsMayBeOn()) return false;
  try {
    const input = reportOutcomeSchema.parse(raw);
    if (!(await tenantReleaseFlagEnabled("catalog_reports", input.tenantId).catch(() => false))) return false;
    return await callReleaseFlagsRpc("record_catalog_report_receipt", {
      p_tenant_id: input.tenantId, p_kind: input.kind, p_period: input.period, p_status: input.status,
      p_recipient: input.recipient, p_reason: input.reason, p_provider_message_id: input.providerMessageId,
    }, z.boolean(), "The report receipt could not be recorded.");
  } catch (error) {
    console.error("[catalog-reports] receipt write failed", { tenantId: raw.tenantId, status: raw.status, error: error instanceof z.ZodError ? "invalid receipt" : "storage unavailable" });
    return false;
  }
}

export function handledReport(receipt: CatalogReportReceipt): HandledReceipt {
  const label = receipt.kind === "weekly" ? "weekly report" : `${receipt.period} recap`;
  const sentence = receipt.status === "accepted"
    ? `Strelva sent your ${label} to ${receipt.recipient}.`
    : receipt.status === "failed"
      ? `Strelva couldn't send your ${label}. We're on it.`
      : `Strelva held your ${label}: ${(receipt.reason ?? "sending is paused").replace(/_/g, " ")}.`;
  return {
    id: `catalog-report:${receipt.id}`, store: "catalog_report_receipts", systemId: null, sentence: actorCopy(sentence, null), at: receipt.at,
    changed: receipt.reason,
    evidence: receipt.status === "accepted" ? { providerAccepted: true, readBack: "not_checked" } : null,
    undo: { state: "not_undoable", reason: receipt.status === "accepted" ? "A sent report cannot be unsent." : "No report was sent, so there is nothing to undo." },
  };
}

export async function readCatalogReportHandled(actor: WorkspaceActor, workspaceId: string, since: string): Promise<HandledReceipt[]> {
  if (!catalogReportsMayBeOn() || !(await workspaceReleaseFlagEnabled("catalog_reports", workspaceId).catch(() => false))) return [];
  const receipts = await callReleaseFlagsRpc("read_catalog_report_receipts", {
    p_workspace_id: z.string().uuid().parse(workspaceId), p_user_id: z.string().uuid().parse(actor.userId),
    p_verified_email: z.string().email().parse(actor.verifiedEmail.trim().toLowerCase()), p_since: z.string().datetime({ offset: true }).parse(since),
  }, z.array(receiptSchema), "Report history could not be read.");
  return receipts.map(handledReport);
}
