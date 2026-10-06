import { activationSchema } from "@/platform/make-real/contracts";
import type { OperationalExceptionProjection } from "./inbox";

/**
 * Partly live Make real activations go to the operator queue at once
 * (systems-experience spec section 4, partial-failure contract, rule 3). One
 * exception per step that needs a person: a Waiting or refused step to fix
 * and resume, an unknown outcome to reconcile with evidence, an accepted
 * write whose read-back failed (verify.failed). Nothing here acts.
 */
export function activationExceptions(
  rows: ReadonlyArray<Record<string, unknown>>,
  workspaces: ReadonlyMap<string, string>,
  users: ReadonlyMap<string, string>,
): OperationalExceptionProjection[] {
  const out: OperationalExceptionProjection[] = [];
  for (const row of rows) {
    const parsed = activationSchema.safeParse(row.payload);
    if (!parsed.success) continue;
    const a = parsed.data;
    const rollbackWaiting = Boolean(a.rollbackStartedAt) && a.status !== "rolled_back";
    if (a.status !== "needs_attention" && !rollbackWaiting) continue;
    const workspaceId = typeof row.workspace_id === "string" ? row.workspace_id : a.businessId;
    const workId = typeof row.id === "string" ? row.id : a.id;
    const owner = { userId: a.actorId, ...(users.get(a.actorId) ? { email: users.get(a.actorId) } : {}) };
    for (const step of a.steps) {
      const readBackFailed = step.status === "completed" && step.effect === "accepted" && step.readBack?.status === "failed";
      if (!(["blocked", "failed", "unknown"].includes(step.status) || readBackFailed)) continue;
      out.push({
        id: `activation:${a.id}:${step.id}:${step.attempts}`,
        source: "activation",
        workspaceId,
        workspaceName: workspaces.get(workspaceId) || "Unnamed workspace",
        workId,
        title: `Make real: ${step.label}`,
        status: rollbackWaiting ? "rollback_waiting" : a.status,
        stepId: step.id,
        stepStatus: readBackFailed ? "read_back_failed" : step.status,
        effect: step.effect,
        ...(step.reason || readBackFailed ? { reason: (readBackFailed ? step.readBack!.detail : step.reason!).slice(0, 2_000) } : {}),
        ageAt: step.finishedAt || step.startedAt || a.updatedAt,
        owner,
        safeAction: step.status === "unknown" || readBackFailed ? "reconcile" : step.effect === "none" ? "retry" : "inspect",
        deepLink: `/api/admin/make-real?workspaceId=${encodeURIComponent(workspaceId)}&activationId=${encodeURIComponent(a.id)}`,
      });
    }
  }
  return out;
}
