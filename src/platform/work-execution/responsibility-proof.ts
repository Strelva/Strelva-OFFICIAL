import { z } from "zod";
import type { StandingRunsRecord } from "./standing-repository";

/** Read projection of the native Google receipt. The product remains its writer. */
export interface ResponsibilityGoogleReceipt {
  id: string; workspaceId: string; createdAt: string;
  status: "posting" | "posted" | "posted_unverified" | "held_by_google" | "failed" | "undone";
  readback: "matched" | "differs" | "failed" | "held_by_google" | null;
  undo: unknown | null;
}
export const KEEP_ME_FOUND_KEYS = ["gbp_replies", "hours_sync", "health", "inquiry_reply_time", "weekly_proof"] as const;
export const responsibilityLabels: Record<(typeof KEEP_ME_FOUND_KEYS)[number], string> = {
  gbp_replies: "Google review replies", hours_sync: "Business hours", health: "Website health",
  inquiry_reply_time: "Inquiry reply time", weekly_proof: "Weekly proof",
};
export const keepMeFoundInputSchema = z.object({
  businessId: z.string().uuid(), serviceRequestId: z.string().uuid(), providerWorkspaceId: z.string().uuid(),
  idempotencyKey: z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/),
  investigations: z.object(Object.fromEntries(KEEP_ME_FOUND_KEYS.map(key => [key, z.string().uuid()])) as Record<(typeof KEEP_ME_FOUND_KEYS)[number], z.ZodString>).strict(),
  everySeconds: z.number().int().min(60).max(31_536_000), nextAt: z.string().datetime(),
}).strict();
export interface ResponsibilityProofCard {
  responsibilityId: string; title: string; from: string; to: string;
  status: "verified" | "partial" | "failed" | "unverified";
  did: string; verified: string; receiptRefs: string[]; openHref: string; undoHref: string | null;
}

/** A completed runner is not evidence of a Google write. Investigation receipts
 * prove only the recorded check; an unavailable source cannot count as verified. */
export function responsibilityProofCard(record: StandingRunsRecord, from: string, to: string, domainReceipts: ResponsibilityGoogleReceipt[] = []): ResponsibilityProofCard {
  z.string().datetime().parse(from); z.string().datetime().parse(to);
  if (Date.parse(from) >= Date.parse(to) || Date.parse(to) - Date.parse(from) > 32 * 86_400_000) throw new Error("Invalid proof window.");
  const runs = record.runs.filter(run => Date.parse(run.createdAt) >= Date.parse(from) && Date.parse(run.createdAt) < Date.parse(to)
    || run.receipts.some(receipt => Date.parse(receipt.finishedAt ?? receipt.createdAt) >= Date.parse(from) && Date.parse(receipt.finishedAt ?? receipt.createdAt) < Date.parse(to)));
  const receipts = runs.flatMap(run => run.receipts.filter(receipt => Date.parse(receipt.finishedAt ?? receipt.createdAt) >= Date.parse(from) && Date.parse(receipt.finishedAt ?? receipt.createdAt) < Date.parse(to)).map(receipt => ({ receipt, run })));
  const verified = receipts.filter(({ receipt }) => {
    const parsed = z.object({ finding: z.object({ result: z.enum(["baseline", "agreement", "discrepancy", "changed", "no_change", "unavailable"]), sourceCount: z.number().int().positive(), differenceCount: z.literal(0), unavailableReason: z.string().optional() }) }).safeParse(receipt.result);
    return receipt.status === "completed" && receipt.effect !== "unknown" && parsed.success
      && parsed.data.finding.result !== "unavailable" && !parsed.data.finding.unavailableReason;
  });
  const failures = runs.some(run => ["failed", "needs_attention"].includes(run.status))
    || receipts.some(({ receipt }) => ["failed", "unknown", "accepted"].includes(receipt.status));
  const native = domainReceipts.filter(receipt => receipt.workspaceId === record.policy.workspaceId && Date.parse(receipt.createdAt) >= Date.parse(from) && Date.parse(receipt.createdAt) < Date.parse(to));
  const posted = native.filter(receipt => receipt.status === "posted" && receipt.readback === "matched");
  const pending = native.filter(receipt => ["posting", "posted_unverified", "held_by_google"].includes(receipt.status));
  const nativeFailed = native.some(receipt => receipt.status === "failed");
  const status = native.length ? posted.length === native.length ? "verified" : posted.length ? "partial" : nativeFailed ? "failed" : "unverified" : !runs.length || !receipts.length ? "unverified" : verified.length === receipts.length && runs.every(run => run.status === "completed")
    ? "unverified" : verified.length ? "partial" : failures ? "failed" : "unverified";
  return { responsibilityId: record.policy.id, title: record.policy.policy.title, from, to, status,
    did: native.length ? `${posted.length} Google changes read back; ${pending.length} awaiting verification. This proves these actions, not every expected outcome.` : !runs.length ? "No run recorded in this period." : `${runs.length} run${runs.length === 1 ? "" : "s"} recorded; ${receipts.length} action receipt${receipts.length === 1 ? "" : "s"}.`,
    verified: native.length ? `${posted.length} Google receipt${posted.length === 1 ? "" : "s"} matched on read-back. ${nativeFailed ? "A provider action failed." : pending.length ? "Accepted changes will not be retried." : ""}` : verified.length ? `${verified.length} saved-source check${verified.length === 1 ? "" : "s"} verified. Google replies and hours changes require their own provider receipts.` : "No verified outcome receipt in this period.",
    receiptRefs: [...native.map(receipt => `google_listing_receipt:${receipt.id}`), ...receipts.map(({ receipt, run }) => `standing:${record.policy.id}:run:${run.id}:receipt:${receipt.id}`)],
    openHref: native.length ? `/workspace/google?workspaceId=${record.policy.workspaceId}#google-receipt-${native[0]!.id}` : `/workspace?workspaceId=${record.policy.workspaceId}&standingId=${record.policy.id}&view=operations`,
    // Read-only investigation checks have nothing to undo. Do not invent an undo link.
    undoHref: posted.some(receipt => receipt.undo) ? `/workspace/google?workspaceId=${record.policy.workspaceId}#google-receipt-${posted.find(receipt => receipt.undo)!.id}` : null,
  };
}
export function addNativeResponsibilityEvidence(card: ResponsibilityProofCard, evidence: unknown): ResponsibilityProofCard {
  const row = z.object({ responsibilityId: z.string(), key: z.enum(KEEP_ME_FOUND_KEYS),
    health: z.array(z.object({ websiteWorkId: z.string().uuid(), checkedAt: z.string(), status: z.enum(["healthy", "unreachable", "hash_mismatch", "hash_missing"]), evidence: z.string() })).default([]),
    inquiries: z.object({ workspaceId: z.string().uuid(), inquiries: z.number().int().nonnegative(), answered: z.number().int().nonnegative(), withinDay: z.number().int().nonnegative(), averageReplySeconds: z.number().nonnegative().nullable(), medianReplySeconds: z.number().nonnegative().nullable() }).nullable().optional(),
    reports: z.array(z.object({ id: z.string().uuid(), status: z.enum(["accepted", "suppressed", "failed"]), at: z.string(), evidence: z.string() })).default([]),
  }).safeParse(evidence);
  if (!row.success || row.data.responsibilityId !== card.responsibilityId) return card;
  if (row.data.key === "health" && row.data.health.length) {
    const health = row.data.health.filter(item => Date.parse(item.checkedAt) >= Date.parse(card.from) && Date.parse(item.checkedAt) < Date.parse(card.to));
    if (!health.length) return card;
    const passed = health.filter(item => item.status === "healthy").length;
    return { ...card, status: passed === health.length ? "verified" : passed ? "partial" : "failed",
      did: `${health.length} website health observations recorded.`, verified: `${passed} observations verified the published content. This describes those observations, not continuous uptime.`, receiptRefs: [...card.receiptRefs, ...health.map(item => item.evidence)] };
  }
  if (row.data.key === "inquiry_reply_time" && row.data.inquiries) {
    const inquiry = row.data.inquiries;
    return { ...card, status: inquiry.inquiries ? "verified" : "unverified",
      did: `${inquiry.inquiries} inquiries; ${inquiry.answered} first replies accepted by the mail provider.`,
      verified: inquiry.averageReplySeconds === null ? "No reply duration measured; no accepted service target is inferred." : `${inquiry.averageReplySeconds} seconds average; ${inquiry.medianReplySeconds} seconds median. Provider acceptance is measured; customer delivery and an agreed service target are separate.`, receiptRefs: [...card.receiptRefs, `inquiry_outcome_cohort:${inquiry.workspaceId}:${card.from}:${card.to}`] };
  }
  if (row.data.key === "weekly_proof" && row.data.reports.length) {
    const reports = row.data.reports.filter(item => Date.parse(item.at) >= Date.parse(card.from) && Date.parse(item.at) < Date.parse(card.to));
    if (!reports.length) return card;
    const accepted = reports.filter(item => item.status === "accepted").length;
    return { ...card, status: accepted === reports.length ? "verified" : accepted ? "partial" : reports.some(item => item.status === "failed") ? "failed" : "unverified",
      did: `${reports.length} report send receipts recorded.`, verified: `${accepted} reports accepted by the mail provider. Inbox delivery and owner readership are not verified.`, receiptRefs: [...card.receiptRefs, ...reports.map(item => item.evidence)] };
  }
  return card;
}

export function responsibilityVerdict(cards: ResponsibilityProofCard[]): string {
  if (!cards.length) return "No accepted responsibilities recorded.";
  const verified = cards.filter(card => card.status === "verified").length;
  return `${verified} of ${cards.length} responsibility cards have verified action receipts; ${cards.length - verified} need evidence or attention. This does not certify a maintained service condition.`;
}
