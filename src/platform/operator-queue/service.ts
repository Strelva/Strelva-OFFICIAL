import { getActiveTenants } from "@/lib/tenants";
import { emailSendingPaused } from "@/lib/email-enabled";
import {
  OperatorQueueAccessError, OperatorQueueValidationError, MARK_ACTIONS,
  type MarkAction, type OperatorQueue, type QueueActor, type QueueContext, type QueueItem, type QueueMark,
} from "./contracts";
import { projectQueue } from "./project";
import { readAllSources } from "./sources";
import { readQueueContext, writeQueueMark } from "./store";

/**
 * Read the whole queue for a verified operator. The SQL boundary rechecks the
 * active super_admins row; every source read is named if it fails.
 */
export interface QueueDependencies {
  readContext: (actor: QueueActor) => Promise<QueueContext>;
  readTenants: () => Promise<{ id: string; siteName?: string; stableId?: string }[]>;
  readSources: typeof readAllSources;
  emailPaused: () => boolean;
}

export const defaultQueueDependencies: QueueDependencies = {
  readContext: readQueueContext,
  readTenants: async () => (await getActiveTenants()).map((tenant) => ({ id: tenant.id, siteName: tenant.siteName, stableId: tenant.stableId })),
  readSources: readAllSources,
  emailPaused: emailSendingPaused,
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
  let context: QueueContext | null = null;
  let contextFailure: string | undefined;
  try {
    context = await deps.readContext(actor);
  } catch (error) {
    // Access failures are not a gap: a non-operator gets nothing.
    if (error instanceof OperatorQueueAccessError) throw error;
    contextFailure = error instanceof Error ? error.message : "Postgres unavailable";
  }
  let tenants: Awaited<ReturnType<QueueDependencies["readTenants"]>> = [];
  let tenantFailure: string | null = null;
  try {
    tenants = await deps.readTenants();
  } catch {
    tenantFailure = "Tenants could not be read";
  }
  const reads = await deps.readSources({ tenants, context, actor, now });
  const queue = projectQueue({ reads, context, contextFailure, tenants, emailPaused: deps.emailPaused(), now });
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
