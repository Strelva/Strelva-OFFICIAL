import { parseAppEventData, type AppEvent } from "@/platform/app-events";
import { PermanentAppEventError } from "@/platform/app-events/handlers";
import { queueListingsCheck } from "./check";

/** The business details a check compares. A confirmed service always matters. */
export const LISTINGS_FACT_KEYS = new Set(["phone", "address", "hours", "links", "display_name"]);

/**
 * `fact.confirmed` queues a check. `fact.changed` is not subscribed: checks read
 * only confirmed facts, and what still waits for the owner's confirmation is
 * computed when the view is read, so it would only queue no-op checks.
 *
 * Idempotent on event.id because the SQL keeps one queued check per business.
 * No IO beyond that one insert. A queue error propagates so the dispatcher retries.
 */
export async function handleFactEvent(event: AppEvent, deps: { queue: typeof queueListingsCheck } = { queue: queueListingsCheck }): Promise<{ queued: boolean; checkId: string | null }> {
  if (event.type !== "fact.confirmed") return { queued: false, checkId: null };
  let data: ReturnType<typeof parseAppEventData<"fact.confirmed">>;
  try { data = parseAppEventData(event as AppEvent & { type: "fact.confirmed" }); }
  catch { throw new PermanentAppEventError("The fact.confirmed event data is malformed."); }
  const relevant = data.entity === "service" || LISTINGS_FACT_KEYS.has(data.entityId);
  if (!relevant) return { queued: false, checkId: null };
  const checkId = await deps.queue(event.workspaceId, "fact.confirmed");
  return { queued: Boolean(checkId), checkId };
}
