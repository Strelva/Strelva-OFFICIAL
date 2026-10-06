"use server";

/**
 * Queue marks and the close-with-minutes step. Each action re-verifies super
 * admin itself (the /admin layout gate does not protect a server action's
 * POST) and passes the verified identity to the SQL boundary, which checks the
 * active super_admins row again.
 *
 * Nothing here writes outside Strelva or to a source: approvals, retries and
 * quotes stay on the screens each row links to, through their governed paths.
 */
import { revalidatePath } from "next/cache";
import { isSuperAdmin } from "@/platform/infra/auth";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import {
  OperatorQueueAccessError, OperatorQueueConflictError, OperatorQueueValidationError,
  type MarkAction, type QueueActor, type QueueItem,
} from "@/platform/operator-queue/contracts";
import { markQueueItem, readOperatorQueue } from "@/platform/operator-queue/service";
import { EFFORT_CATEGORY_BY_KIND } from "@/platform/operator-queue/rules";
import { PostgresBusinessEffortStore, recordBusinessEffort } from "@/platform/business-effort";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";

export type QueueActionResult = { ok: boolean; message: string };

async function operator(): Promise<QueueActor | null> {
  if (!(await isSuperAdmin())) return null;
  return workspaceHttpActor();
}

/** Re-read the item so its priority is computed here, never trusted from the client. */
async function finder(actor: QueueActor) {
  let cache: Map<string, QueueItem> | null = null;
  return async (key: string) => {
    if (!cache) {
      const queue = await readOperatorQueue(actor);
      cache = new Map([...queue.items, ...queue.parked].map((item) => [item.key, item]));
    }
    return cache.get(key) ?? null;
  };
}

function failure(error: unknown): QueueActionResult {
  if (error instanceof OperatorQueueValidationError || error instanceof OperatorQueueAccessError || error instanceof OperatorQueueConflictError) {
    return { ok: false, message: error.message };
  }
  return { ok: false, message: "Queue storage is unavailable. Nothing was saved; try again." };
}

const DONE_MESSAGES: Partial<Record<MarkAction, string>> = {
  take: "Taken.", hand_off: "Handed off.", release: "Released.", pin: "Pinned to the top for a day.", unpin: "Unpinned.",
  snooze: "Snoozed.", unsnooze: "Back in the list.", note: "Note added.", owner_told: "Recorded that the owner was told.", reopen: "Reopened.",
};

export async function markQueueItemAction(input: { commandId: string; key: string; action: Exclude<MarkAction, "close">; payload?: Record<string, unknown> }): Promise<QueueActionResult> {
  try {
    const actor = await operator();
    if (!actor) throw new OperatorQueueAccessError();
    await markQueueItem(actor, input, await finder(actor));
    revalidatePath("/admin/queue");
    return { ok: true, message: DONE_MESSAGES[input.action] ?? "Saved." };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Close an item, then log the minutes against its business. The two are
 * separate records: a close that lands with minutes that don't is reported
 * as exactly that, never as all-or-nothing.
 */
export async function closeQueueItemAction(input: {
  commandId: string; key: string; state: "done" | "dismissed"; reason: string;
  minutes: { entryId: string; minutes: number } | null;
}): Promise<QueueActionResult> {
  let actor: QueueActor | null;
  let item: QueueItem | null;
  try {
    actor = await operator();
    if (!actor) throw new OperatorQueueAccessError();
    const find = await finder(actor);
    item = await find(input.key);
    await markQueueItem(actor, { commandId: input.commandId, key: input.key, action: "close", payload: { state: input.state, reason: input.reason } }, async () => item);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/admin/queue");
  if (!input.minutes || !item) return { ok: true, message: "Closed." };
  if (item.business.kind !== "workspace") {
    return { ok: true, message: "Closed. Minutes were not logged: this business is not yet a workspace." };
  }
  if (!workspaceReleaseEnabled()) return { ok: true, message: "Closed. Minutes were not logged: human minutes are off while the workspace release is off." };
  try {
    await recordBusinessEffort(PostgresBusinessEffortStore, actor, {
      entryId: input.minutes.entryId, businessId: item.business.workspaceId, minutes: input.minutes.minutes,
      category: EFFORT_CATEGORY_BY_KIND[item.kind], occurredOn: new Date().toISOString().slice(0, 10),
      note: `Queue: ${item.title}`.slice(0, 280),
    });
    revalidatePath("/admin/work");
    return { ok: true, message: `Closed. Logged ${input.minutes.minutes} minute${input.minutes.minutes === 1 ? "" : "s"}.` };
  } catch (error) {
    return { ok: true, message: `Closed. Minutes were not logged: ${error instanceof Error ? error.message : "storage unavailable"}` };
  }
}
