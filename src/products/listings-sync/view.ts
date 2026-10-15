import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { readBusinessRecord } from "@/platform/business-record/service";
import { createBusinessFactReviewStore } from "@/platform/needs-you/sources/business-facts";
import { WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";
import { queueListingsCheck, runQueuedListingsChecks } from "./check";
import { listingsSyncViewSchema, type ListingsSyncView } from "./contracts";
import { LISTINGS_FACT_KEYS } from "./events";
import { listingsSyncStore } from "./store";

/** What the business details panel and the agency client row read. Access is checked in SQL: members and agencies read. */
export async function readListingsSyncView(
  actor: WorkspaceActor,
  workspaceId: string,
  deps: { store: Pick<typeof listingsSyncStore, "read">; reviews: () => { read(workspaceId: string): Promise<{ changes: Array<{ entity: string; id: string }> } | null> } } = { store: listingsSyncStore, reviews: () => createBusinessFactReviewStore() },
): Promise<ListingsSyncView> {
  const read = await deps.store.read(actor, workspaceId);
  const review = await deps.reviews().read(workspaceId).catch(() => null);
  const pendingConfirmation = (review?.changes ?? []).filter(change => change.entity === "fact" && LISTINGS_FACT_KEYS.has(change.id)).length;
  const fixes = read.fixes;
  return listingsSyncViewSchema.parse({
    workspaceId,
    access: read.access,
    checkedAt: read.lastDone?.finishedAt ?? null,
    checking: read.latest?.status === "queued" || read.latest?.status === "running",
    recordRevision: read.lastDone?.recordRevision ?? null,
    surfaces: read.lastDone?.readings ?? [],
    fixes,
    release: read.release ? { number: read.release.number, recordedAt: read.release.recordedAt } : null,
    pendingConfirmation,
    waitingOnOwner: fixes.some(fix => fix.status === "proposed" && fix.kind !== "owner_todo"),
    lastError: read.latest?.status === "failed" ? "The last check didn't finish. Check again." : null,
  });
}

/** "Check now": at most 6 an hour per business. Reads only; nothing changes until the owner approves. */
export async function checkListingsNow(
  actor: WorkspaceActor,
  workspaceId: string,
  deps: {
    limited: typeof isRateLimitedWindowedAsync;
    queue: typeof queueListingsCheck;
    run: typeof runQueuedListingsChecks;
    view: typeof readListingsSyncView;
    record: typeof readBusinessRecord;
  } = { limited: isRateLimitedWindowedAsync, queue: queueListingsCheck, run: runQueuedListingsChecks, view: readListingsSyncView, record: readBusinessRecord },
): Promise<ListingsSyncView> {
  await deps.record(actor, workspaceId);
  if (await deps.limited(`listings-sync:check:${workspaceId}`, 6, 3_600_000)) throw new WorkspaceConflictError("Checked several times this hour. Try again later.");
  const id = await deps.queue(workspaceId, "check_now", actor.userId);
  if (id) await deps.run({ checkId: id, limit: 1, budgetMs: 50_000 });
  return deps.view(actor, workspaceId);
}
