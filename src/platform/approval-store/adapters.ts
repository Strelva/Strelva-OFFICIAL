import type { SourceAdapter } from "@/platform/needs-you/adapters";
import type { ApprovalStore } from "./records";
import { approvalRecord } from "./records";

/**
 * One approval store over every native resolver. Off calls the exact old
 * adapter. On rereads the claimed decision and source revision before any
 * native effect; read failure, withdrawal, changed content or system-only
 * approval runs nothing. No second sender or resolver is introduced.
 */
export function withCanonicalApprovalStore(adapter: SourceAdapter, deps: {
  store: ApprovalStore;
  enabled(businessId: string): Promise<boolean>;
}): SourceAdapter {
  return {
    ...adapter,
    async resolve(ctx, item, decision, by) {
      if (!(await deps.enabled(ctx.workspaceId))) return adapter.resolve(ctx, item, decision, by);
      try {
        const row = await deps.store.read(ctx.workspaceId, item.id);
        if (!row || row.id !== item.id) return { outcome: "failed", reason: "approval_record_missing: nothing ran" };
        const subject = { businessId: ctx.workspaceId, lifecycle: adapter.lifecycle, sourceId: item.sourceId, revision: item.revisionHash };
        const approval = approvalRecord(row, subject);
        if (!approval) return { outcome: "failed", reason: "approval_subject_changed: nothing ran" };
        if (by.kind === "expiry") {
          if (row.state !== "expired") return { outcome: "failed", reason: "approval_not_expired: nothing ran" };
        } else {
          const expected = decision === "approve" ? "approved" : "declined";
          if (row.state !== expected || (decision === "approve" && approval.status !== "approved")) {
            return { outcome: "failed", reason: "approval_not_claimed: nothing ran" };
          }
          const revision = await adapter.currentRevision(ctx, item.sourceId);
          if (revision !== item.revisionHash) return { outcome: "failed", reason: "approval_source_changed: nothing ran" };
        }
        return adapter.resolve(ctx, row, decision, by);
      } catch {
        return { outcome: "failed", reason: "approval_store_unavailable: nothing ran" };
      }
    },
  };
}
