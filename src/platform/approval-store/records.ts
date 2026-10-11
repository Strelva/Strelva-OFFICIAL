import type { OwnerDecision } from "@/platform/needs-you/contracts";

export interface ApprovalSubject {
  businessId: string;
  lifecycle: string;
  sourceId: string;
  revision: string;
}
export interface ApprovalRecord extends ApprovalSubject {
  id: string;
  status: "pending" | "approved" | "dismissed";
  decidedBy: string | null;
  decidedAt: string | null;
}
export interface ApprovalStore {
  read(businessId: string, id: string): Promise<OwnerDecision | null>;
}

/**
 * Approval evidence for a Needs you decision. Native resolvers retain their
 * own authorization and execution claims; event actions still gate on Redis.
 * A record here is neither an exclusive effect claim nor authority for direct
 * callers outside the Needs you service.
 */
export function approvalRecord(row: OwnerDecision | null, subject: ApprovalSubject): ApprovalRecord | null {
  if (!row || row.workspaceId !== subject.businessId || row.sourceLifecycle !== subject.lifecycle
    || row.sourceId !== subject.sourceId || row.revisionHash !== subject.revision) return null;
  const human = row.decidedByKind !== null && ["owner_link", "owner_session", "admin_session", "member_session", "operator"].includes(row.decidedByKind);
  const status = row.state === "approved" && row.outcome !== "failed" && human && row.decidedAt !== null
    ? "approved" : row.state === "open" || (row.state === "approved" && !human) ? "pending" : "dismissed";
  return { id: row.id, ...subject, status, decidedBy: row.decidedByKind, decidedAt: row.decidedAt };
}
