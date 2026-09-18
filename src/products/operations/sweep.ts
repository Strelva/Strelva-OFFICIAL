import { getSupabase } from "@/lib/db/client";
import { WorkspaceStoreError } from "@/platform/workspaces/types";
import { admitAndRunDueStandingResponsibility, workspaceResponsibilityCommands } from "./server";
import { readWorkspaceInvestigation, runWorkspaceInvestigation } from "@/products/investigations/server";
import { readWorkspaceLearning, collectWorkspaceLearning } from "@/products/product-learning/server";
import { readResponsibility } from "@/platform/work-execution/repository";
export interface DueWork { id: string; productId: "operations" | "operations-standing" | "investigations" | "product-learning"; actor: { userId: string; verifiedEmail: string } }
export interface SweepFailure {
  id: string;
  productId: DueWork["productId"];
  actor: DueWork["actor"];
  error: string;
  /** Current durable execution evidence, when the native row can still be read. */
  recorded?: {
    status: string;
    steps: Array<{ id: string; status: string; effect?: string; reason?: string; attempt: number }>;
  };
}

function failureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "The due work could not be completed.";
  return message.slice(0, 2_000);
}

async function recordedFailure(item: DueWork): Promise<SweepFailure["recorded"]> {
  if (item.productId !== "operations") return undefined;
  try {
    const saved = await readResponsibility(item.actor, item.id);
    return {
      status: saved.payload.status,
      steps: saved.payload.steps.map((step) => ({
        id: step.id,
        status: step.status,
        ...(step.effect ? { effect: step.effect } : {}),
        ...(step.reason ? { reason: step.reason.slice(0, 2_000) } : {}),
        attempt: step.attempt,
      })),
    };
  } catch {
    // The failure remains visible in the returned item even if membership or
    // storage changed before the recovery read. Do not invent a second record.
    return undefined;
  }
}

export async function sweepDueWork(due: DueWork[], deadlineMs = 20000) {
  const started = Date.now(); let processed = 0, failed = 0;
  const failures: SweepFailure[] = [];
  for (const item of due.slice(0, 30)) {
    if (Date.now() - started >= deadlineMs) break;
    try {
      if (item.productId === "operations") await workspaceResponsibilityCommands.run(item.actor, item.id);
      else if (item.productId === "operations-standing") await admitAndRunDueStandingResponsibility(item.actor, item.id);
      else if (item.productId === "investigations") {
        const target = await readWorkspaceInvestigation(item.actor, item.id);
        await runWorkspaceInvestigation(item.actor, item.id, { expectedRevision: target.payload.revision, requestId: `due:${item.id}:${target.payload.revision}` });
      } else {
        const target = await readWorkspaceLearning(item.actor, item.id);
        await collectWorkspaceLearning(item.actor, item.id, target.learning.revision);
      }
      processed++;
    } catch (error) {
      failed++;
      const recorded = await recordedFailure(item);
      failures.push({
        id: item.id,
        productId: item.productId,
        actor: item.actor,
        error: failureMessage(error),
        ...(recorded ? { recorded } : {}),
      });
    }
  }
  return { processed, failed, remaining: Math.max(0, due.length - processed - failed), failures };
}
export async function listDueWork(): Promise<DueWork[]> {
  const db = getSupabase(); if (!db) throw new WorkspaceStoreError("Work storage is unavailable.");
  const rpc = db as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: Array<{ id: string; product_id: DueWork["productId"]; user_id: string; email: string }> | null; error: unknown }> };
  const { data, error } = await rpc.rpc("due_workspace_work", { p_limit: 30 });
  if (error) throw new WorkspaceStoreError("Due work could not be read.");
  return (data ?? []).map(row => ({ id: row.id, productId: row.product_id, actor: { userId: row.user_id, verifiedEmail: row.email } }));
}
