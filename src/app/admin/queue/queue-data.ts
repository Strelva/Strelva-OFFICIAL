import { isSuperAdmin } from "@/lib/auth";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { OperatorQueueAccessError, type OperatorQueue } from "@/platform/operator-queue/contracts";
import { readOperatorQueue } from "@/platform/operator-queue/service";

export type QueueLoad =
  | { state: "denied" }
  | { state: "unavailable"; message: string }
  | { state: "ready"; queue: OperatorQueue; me: string };

/** Read the queue for the signed-in operator. Super admin is re-checked here
 *  and again by the SQL boundary; the /admin layout gate is not relied on. */
export async function loadOperatorQueue(): Promise<QueueLoad> {
  if (!(await isSuperAdmin())) return { state: "denied" };
  const actor = await workspaceHttpActor();
  if (!actor) return { state: "denied" };
  try {
    const { context: _context, ...queue } = await readOperatorQueue(actor);
    void _context;
    return { state: "ready", queue, me: actor.userId };
  } catch (error) {
    if (error instanceof OperatorQueueAccessError) return { state: "denied" };
    return { state: "unavailable", message: "The queue could not be read. Nothing is hidden: try again." };
  }
}
