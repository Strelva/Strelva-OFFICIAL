import type { ListingFix, SurfaceReading } from "./contracts";
import { planHash, planLines } from "./plan";
import { listingsSyncStore } from "./store";

/** What the owner is asked to make live, one decision per business. */
export interface ListingsPlan { workspaceId: string; recordRevision: number; hash: string; lines: string[]; requests: number; strelvaChanges: number }
export type OpenListingsPlanWithFixes = ListingsPlan & { fixes: ListingFix[]; readings: SurfaceReading[] };

/** Service-side read (no member identity): the fixes the last finished check left open. Null when there is nothing to decide. */
export async function readListingsPlanForService(workspaceId: string, deps: { store: Pick<typeof listingsSyncStore, "openPlan"> } = { store: listingsSyncStore }): Promise<OpenListingsPlanWithFixes | null> {
  const open = await deps.store.openPlan(workspaceId);
  if (!open || !open.fixes.length) return null;
  const fixes = open.fixes.filter(fix => fix.kind !== "owner_todo");
  if (!fixes.length) return null;
  const requests = fixes.filter(fix => fix.kind === "site_request").length;
  return {
    workspaceId,
    recordRevision: open.recordRevision,
    hash: planHash(open.recordRevision, fixes),
    lines: planLines(fixes, open.readings),
    requests,
    strelvaChanges: fixes.length - requests,
    fixes,
    readings: open.readings,
  };
}
