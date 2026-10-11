import { createHash } from "node:crypto";
import type {
  OutsideWriteAcceptance, OutsideWriteKind, OutsideWriteProvider, OutsideWriteReadback, OutsideWriteReceipt,
} from "./contracts";
import { insertReceipt } from "./store";
import { undoRuleFor } from "./undo";

/**
 * One receipt for every outside write (spec §3.6). Called after the provider
 * has answered, alongside the existing write path; the write itself does not
 * change. Recording a receipt never re-sends the write, and a receipt that
 * can't be saved is reported, not retried as a write.
 */
export interface OutsideWrite {
  /** Idempotency: the same write recorded twice returns the first receipt. */
  commandKey: string;
  tenantId?: string | null;
  workspaceId?: string | null;
  systemId?: string | null;
  provider: OutsideWriteProvider;
  writeKind: OutsideWriteKind;
  subject: string;
  request: Record<string, unknown>;
  beforeState?: unknown;
  acceptance: OutsideWriteAcceptance;
  acceptanceDetail?: string | null;
  providerRef?: string | null;
  /** Read-back recorded with the write when it ran in the same call. */
  readback?: Exclude<OutsideWriteReadback, "not_possible"> | "not_possible";
  readbackDetail?: string | null;
  actor: string;
}

export type ReceiptResult = { recorded: true; receipt: OutsideWriteReceipt } | { recorded: false; reason: string };

export type ReceiptWriter = (receipt: Record<string, unknown>) => Promise<OutsideWriteReceipt>;

let writer: ReceiptWriter = insertReceipt;
/** Tests only. */
export function setReceiptWriter(next: ReceiptWriter | null): void { writer = next ?? insertReceipt; }

export function receiptCommandKey(parts: (string | number)[]): string {
  const digest = createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 32);
  return `${String(parts[0]).slice(0, 40)}:${digest}`;
}

function clip(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function outsideWritePayload(write: OutsideWrite): Record<string, unknown> {
  const rule = undoRuleFor(write.writeKind);
  return {
    commandKey: write.commandKey,
    tenantId: write.tenantId ?? null,
    workspaceId: write.workspaceId ?? null,
    systemId: write.systemId ?? null,
    provider: write.provider,
    writeKind: write.writeKind,
    subject: clip(write.subject, 300) ?? write.writeKind,
    request: write.request,
    beforeState: write.beforeState ?? null,
    acceptance: write.acceptance,
    acceptanceDetail: clip(write.acceptanceDetail, 1000),
    providerRef: clip(write.providerRef, 500),
    readback: write.acceptance === "accepted" ? (write.readback ?? "pending") : "not_possible",
    readbackDetail: clip(write.readbackDetail, 1000),
    undo: rule.undo,
    undoLabel: rule.label,
    actor: clip(write.actor, 200) ?? "strelva",
  };
}

export async function recordOutsideWrite(write: OutsideWrite): Promise<ReceiptResult> {
  const payload = outsideWritePayload(write);
  try {
    return { recorded: true, receipt: await writer(payload) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Receipt storage is unavailable.";
    console.error("[outside-write-receipt] not recorded", { commandKey: write.commandKey, writeKind: write.writeKind, reason });
    return { recorded: false, reason };
  }
}

/** Google review reply, after publish and its immediate read-back. */
export function reviewReplyWrite(input: {
  tenantId: string; reviewId: string; replyText: string; actor: string;
  outcome: { kind: "accepted"; verified: boolean; readbackError?: string } | { kind: "rejected"; detail: string } | { kind: "unknown"; detail: string };
}): OutsideWrite {
  const base = {
    commandKey: receiptCommandKey(["review-reply", input.tenantId, input.reviewId, input.replyText]),
    tenantId: input.tenantId,
    provider: "google_business" as const,
    writeKind: "review_reply" as const,
    subject: "Reply to a Google review",
    // The reply text is the business's public words; the review itself is not copied.
    request: { reviewId: input.reviewId, reply: input.replyText.slice(0, 4000) },
    actor: input.actor,
  };
  if (input.outcome.kind === "accepted") {
    return {
      ...base, acceptance: "accepted",
      readback: input.outcome.readbackError ? "failed" : input.outcome.verified ? "matched" : "differs",
      readbackDetail: input.outcome.readbackError ?? (input.outcome.verified ? "Reply read back from Google and matched." : "Reply read back from Google but did not match."),
    };
  }
  return { ...base, acceptance: input.outcome.kind, acceptanceDetail: input.outcome.detail };
}

/** Vercel domain add. Undo is Strelva's claim only. */
export function domainAddWrite(input: {
  tenantId: string; domain: string; actor: string; role: string; at: string;
  acceptance: OutsideWriteAcceptance; detail?: string | null; providerRef?: string | null;
  readback?: { result: "matched" | "differs" | "failed"; detail: string };
}): OutsideWrite {
  return {
    commandKey: receiptCommandKey(["domain-add", input.tenantId, input.domain, input.at]),
    tenantId: input.tenantId,
    provider: "vercel",
    writeKind: "domain_add",
    subject: input.domain,
    request: { domain: input.domain, role: input.role },
    acceptance: input.acceptance,
    acceptanceDetail: input.detail ?? null,
    providerRef: input.providerRef ?? null,
    readback: input.readback?.result,
    readbackDetail: input.readback?.detail ?? null,
    actor: input.actor,
  };
}

/** Removing Strelva's claim. No Vercel call is made; the Vercel domain stays. */
export function domainClaimRemovalWrite(input: {
  tenantId: string; domain: string; actor: string; at: string;
  before: { role: string; status: string } | null;
  readback: { result: "matched" | "differs" | "failed"; detail: string };
}): OutsideWrite {
  return {
    commandKey: receiptCommandKey(["domain-claim-removal", input.tenantId, input.domain, input.at]),
    tenantId: input.tenantId,
    provider: "strelva_routing",
    writeKind: "domain_claim_removal",
    subject: input.domain,
    request: { domain: input.domain },
    beforeState: input.before,
    acceptance: "accepted",
    readback: input.readback.result,
    readbackDetail: input.readback.detail,
    actor: input.actor,
  };
}
