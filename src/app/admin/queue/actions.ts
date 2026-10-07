"use server";

/**
 * Queue marks and the close-with-minutes step. Each action re-verifies super
 * admin itself (the /admin layout gate does not protect a server action's
 * POST) and passes the verified identity to the SQL boundary, which checks the
 * active super_admins row again.
 *
 * Draft decisions run the governed approve path as the operator, never as
 * the owner, and write audit_logs rows (../operator-audit.ts). Retries and
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
import { operatorQueueReleaseEnabled } from "@/platform/operator-queue/release";
import { getEventRaw } from "@/lib/events";
import { resolveEventAction, escalateEventToOwner } from "@/lib/event-actions";
import { isPortfolioApprovable } from "../actions/portfolio-actions";
import { auditOperatorDecision, operatorStillActive, verifiedOperator } from "../operator-audit";

export type QueueActionResult = { ok: boolean; message: string };

/** Derive all source identities server-side. Owner calls are never approved
 * by an operator, and every effect uses the existing governed dispatcher under
 * the operator's own actor id, with an audit row before and after it. */
export async function resolveQueueDraftsAction(input: { keys: string[]; action: "approve" | "skip" | "escalate" }): Promise<QueueActionResult & { results: { key: string; changed: boolean; reason?: string }[] }> {
  const results: { key: string; changed: boolean; reason?: string }[] = [];
  if (!operatorQueueReleaseEnabled()) return { ok: false, message: "Queue actions are not enabled.", results };
  try {
    const signedIn = await verifiedOperator();
    if (!signedIn) throw new OperatorQueueAccessError();
    const actor: QueueActor = { userId: signedIn.userId, verifiedEmail: signedIn.verifiedEmail };
    if (!["approve", "skip", "escalate"].includes(input.action) || !Array.isArray(input.keys) || input.keys.length > 100) throw new OperatorQueueValidationError();
    const find = await finder(actor);
    const auditAction = `queue.draft.${input.action}`;
    let revoked = false;
    for (const key of [...new Set(input.keys)]) {
      let attempt: { tenantId: string; eventId: string } | null = null;
      try {
        if (revoked || !(await operatorStillActive(signedIn))) {
          revoked = true;
          results.push({ key, changed: false, reason: "Your operator access changed. Nothing more was done." }); continue;
        }
        const item = await find(key);
        const tenantId = item?.business.kind === "workspace" || item?.business.kind === "tenant" ? item.business.tenantId : null;
        if (!item || item.kind !== "draft_review" || item.move !== "strelva" || !tenantId || !item.sourceRef.startsWith("event:")) {
          results.push({ key, changed: false, reason: "Only Strelva drafts can be decided here." }); continue;
        }
        const eventId = item.sourceRef.slice(6);
        const event = await getEventRaw(eventId);
        if (!event || event.tenantId !== tenantId || event.metadata?.reviewAudience === "owner" || !isPortfolioApprovable(event)) {
          results.push({ key, changed: false, reason: "The draft changed or needs the owner's decision." }); continue;
        }
        const detail = { queueKey: key, eventType: event.type, eventKind: typeof event.metadata?.kind === "string" ? event.metadata.kind : null };
        try {
          await auditOperatorDecision({ operator: signedIn, tenantId, eventId, action: auditAction, phase: "attempt", detail });
        } catch {
          results.push({ key, changed: false, reason: "The audit log is unavailable. Nothing was done." }); continue;
        }
        attempt = { tenantId, eventId };
        const result = input.action === "escalate"
          ? await escalateEventToOwner(tenantId, eventId)
          : await resolveEventAction(tenantId, eventId, input.action === "approve" ? "approved" : "dismissed", signedIn.actorId);
        results.push({ key, ...result });
        await auditOperatorDecision({ operator: signedIn, tenantId, eventId, action: auditAction, phase: "result", detail: { ...detail, changed: result.changed, reason: result.reason ?? null } })
          .catch(() => console.error(`[admin/queue] audit result row failed for ${eventId}; its attempt row stands.`));
      } catch {
        results.push({ key, changed: false, reason: "This draft could not be handled. Its current state must be checked." });
        if (attempt) {
          await auditOperatorDecision({ operator: signedIn, tenantId: attempt.tenantId, eventId: attempt.eventId, action: auditAction, phase: "result", detail: { queueKey: key, changed: false, reason: "error" } })
            .catch(() => console.error(`[admin/queue] audit result row failed for ${attempt?.eventId}; its attempt row stands.`));
        }
      }
    }
    revalidatePath("/admin/queue"); revalidatePath("/admin");
    const changed = results.filter((result) => result.changed).length;
    return { ok: results.length > 0 && changed === results.length, message: `${changed} of ${results.length} handled.${changed < results.length ? " Some drafts still need attention." : ""}`, results };
  } catch (error) { return { ...failure(error), results }; }
}

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
    revalidatePath("/admin");
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
    if (operatorQueueReleaseEnabled()) {
      if (input.minutes && (!Number.isInteger(input.minutes.minutes) || input.minutes.minutes < 1 || input.minutes.minutes > 1440 || !/^[0-9a-f-]{36}$/i.test(input.minutes.entryId))) throw new OperatorQueueValidationError("Check the minutes before closing this item.");
      if (!input.reason.trim()) throw new OperatorQueueValidationError("Say what happened before closing this item.");
      if (item?.move === "owner" && input.state === "done") throw new OperatorQueueValidationError("The owner must make this decision. You can record a note or stop chasing it.");
    }
    await markQueueItem(actor, { commandId: input.commandId, key: input.key, action: "close", payload: { state: input.state, reason: input.reason } }, async () => item);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/admin/queue");
  revalidatePath("/admin");
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
      ...(operatorQueueReleaseEnabled() ? { queue: { kind: item.kind, sourceRef: item.sourceRef, systemId: item.system?.id ?? null, systemLabel: item.system?.label ?? null } } : {}),
    });
    revalidatePath("/admin/work");
    return { ok: true, message: `Closed. Logged ${input.minutes.minutes} minute${input.minutes.minutes === 1 ? "" : "s"}.` };
  } catch (error) {
    return { ok: true, message: `Closed. Minutes were not logged: ${error instanceof Error ? error.message : "storage unavailable"}` };
  }
}
