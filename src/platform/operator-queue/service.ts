import { getActiveTenants } from "@/lib/tenants";
import { emailSendingPaused } from "@/platform/infra/email/enabled";
import {
  OperatorQueueAccessError, OperatorQueueValidationError, MARK_ACTIONS,
  type MarkAction, type OperatorQueue, type QueueActor, type QueueContext, type QueueItem, type QueueMark,
} from "./contracts";
import { projectQueue } from "./project";
import { readAllSources } from "./sources";
import { readQueueContext, writeQueueMark } from "./store";
import { operatorQueueReleaseEnabled } from "./release";
import { readQueueLeadCounts } from "./lead-counts";

/**
 * Read the whole queue for a verified operator. The SQL boundary rechecks the
 * active super_admins row; every source read is named if it fails.
 */
export interface QueueDependencies {
  readContext: (actor: QueueActor) => Promise<QueueContext>;
  readTenants: () => Promise<{ id: string; siteName?: string; stableId?: string }[]>;
  readSources: typeof readAllSources;
  emailPaused: () => boolean;
  readLeadCounts?: typeof readQueueLeadCounts;
}

export const defaultQueueDependencies: QueueDependencies = {
  readContext: readQueueContext,
  readTenants: async () => (await getActiveTenants()).map((tenant) => ({ id: tenant.id, siteName: tenant.siteName, stableId: tenant.stableId })),
  readSources: readAllSources,
  emailPaused: emailSendingPaused,
  readLeadCounts: readQueueLeadCounts,
};

function requireActor(actor: QueueActor | null): QueueActor {
  if (!actor?.userId || !actor.verifiedEmail) throw new OperatorQueueAccessError();
  return actor;
}

export async function readOperatorQueue(
  inputActor: QueueActor | null,
  deps: QueueDependencies = defaultQueueDependencies,
  now: number = Date.now(),
): Promise<OperatorQueue & { context: QueueContext | null }> {
  const actor = requireActor(inputActor);
  // Both flag states stop before other service-role sources if admission fails.
  const context = await deps.readContext(actor);
  let tenants: Awaited<ReturnType<QueueDependencies["readTenants"]>> = [];
  let tenantFailure: string | null = null;
  try {
    tenants = await deps.readTenants();
  } catch {
    tenantFailure = "Tenants could not be read";
  }
  const reads = await deps.readSources({ tenants, context, actor, now });
  const queue = projectQueue({ reads, context, tenants, emailPaused: deps.emailPaused(), now });
  if (operatorQueueReleaseEnabled() && deps.readLeadCounts) {
    queue.businessLeads = await deps.readLeadCounts(tenants, context?.links ?? [], now);
    if (queue.businessLeads.some(row => row.failure)) {
      queue.gaps.push({ kind: "lead_unkept", source: "Client lead counts", reason: "One or more business lead counts could not be read" });
      queue.complete = false;
    }
  }
  if (tenantFailure) {
    queue.gaps.unshift({ kind: "draft_review", source: "Client sites", reason: tenantFailure });
    queue.complete = false;
  }
  return { ...queue, context };
}

export interface QueueMarkInput {
  commandId: string;
  key: string;
  action: MarkAction;
  payload?: Record<string, unknown>;
}

/**
 * One mark on one item. The item is re-read and its priority recomputed on
 * the server, so a stale client can't snooze a P1. A mark never writes to the
 * source or outside Strelva.
 */
export async function markQueueItem(
  inputActor: QueueActor | null,
  input: QueueMarkInput,
  findItem: (key: string) => Promise<QueueItem | null>,
  write: typeof writeQueueMark = writeQueueMark,
): Promise<QueueMark> {
  const actor = requireActor(inputActor);
  if (!MARK_ACTIONS.includes(input.action) || !/^[0-9a-f-]{36}$/i.test(input.commandId)) throw new OperatorQueueValidationError();
  const item = await findItem(input.key);
  if (!item) throw new OperatorQueueValidationError("That item is no longer in the queue.");
  return write(actor, {
    commandId: input.commandId, kind: item.kind, sourceRef: item.sourceRef, action: input.action,
    payload: input.payload, priority: item.priority,
  });
}
