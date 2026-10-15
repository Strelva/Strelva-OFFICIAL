import { settingsOrDefault } from "@/platform/bookings/availability";
import { factValueSchemas } from "@/platform/business-record/contracts";
import { comparePlatformSchema, publicFactsFromRecord } from "@/products/connected-sites/server";
import { compareBooking, compareGoogle, compareWebsite, compareYelp, expectedFacts, type Expected, type GoogleLocationLike, type YelpBusinessLike } from "./compare";
import { LISTING_FACTS, type FactComparison, type SurfaceReading } from "./contracts";
import { planFixes, type PlanContext } from "./plan";
import { readBookingSurface, readGoogleLocation, readWebsitePage, readYelpBusiness } from "./readers";
import { releaseFlagEnvMode } from "@/platform/release-flags/resolve";
import { LISTINGS_APP, listingsGoogleFixReached, listingsSyncAvailable, listingsSyncMayBeOn } from "./release";
import { listingsSyncStore, type CheckTrigger } from "./store";
import { readListingTargets, type ListingTargets } from "./targets";

/**
 * One check reads every place a business appears, compares it with the
 * owner-confirmed facts and proposes fixes. At most about 14 reads, each
 * bounded in time, no model calls. It never changes a place: changes happen
 * only when the owner approves through Needs you (apply.ts).
 */

export interface CheckDeps {
  store: Pick<typeof listingsSyncStore, "confirmedFacts" | "saveFixes" | "finish" | "claim" | "queue" | "due">;
  targets: (workspaceId: string) => Promise<ListingTargets>;
  readers: {
    website: typeof readWebsitePage;
    google: typeof readGoogleLocation;
    booking: typeof readBookingSurface;
    yelp: typeof readYelpBusiness;
  };
  googleFix: (workspaceId: string) => Promise<boolean>;
  available: (workspaceId: string) => Promise<boolean>;
  now: () => Date;
  surfaceTimeoutMs: number;
}

export const liveCheckDeps: CheckDeps = {
  store: listingsSyncStore,
  targets: id => readListingTargets(id),
  readers: { website: readWebsitePage, google: readGoogleLocation, booking: readBookingSurface, yelp: readYelpBusiness },
  googleFix: id => listingsGoogleFixReached(id),
  available: id => listingsSyncAvailable(id),
  now: () => new Date(),
  surfaceTimeoutMs: 10_000,
};

export interface ClaimedListingsCheck { id: string; workspaceId: string; claimToken: string; recordRevision: number }

const FACT_ORDER = new Map<string, number>(LISTING_FACTS.map((fact, index) => [fact, index]));
const UNREADABLE_PAGE = "Couldn't read this page. Strelva will check again.";

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("timeout")), ms); });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

function todayIn(timeZone: string | undefined, now: Date): string {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone ?? "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
  catch { return now.toISOString().slice(0, 10); }
}

/** What Google would say while Strelva waits on its approval: nothing can differ. */
function waitingFacts(expected: Expected): FactComparison[] {
  const out: FactComparison[] = [];
  if (expected.phone) out.push({ fact: "phone", state: "waiting_on_google", shown: null, expected: expected.phone });
  if (expected.address) out.push({ fact: "address", state: "waiting_on_google", shown: null, expected: null });
  if (expected.hours) out.push({ fact: "hours", state: "waiting_on_google", shown: null, expected: null });
  return out;
}

const sortFacts = (facts: FactComparison[]) => [...facts].sort((a, b) => (FACT_ORDER.get(a.fact) ?? 0) - (FACT_ORDER.get(b.fact) ?? 0));

export async function runListingsCheck(check: ClaimedListingsCheck, deps: CheckDeps = liveCheckDeps): Promise<{ status: "done" | "failed"; differs: number; release: { number: number } | null }> {
  const { workspaceId } = check;
  try {
    const confirmed = await deps.store.confirmedFacts(workspaceId);
    const hours = factValueSchemas.hours.safeParse(confirmed.facts.hours);
    const expected = expectedFacts(confirmed, todayIn(hours.success ? hours.data.timezone : undefined, deps.now()));
    const publicFacts = publicFactsFromRecord(confirmed);
    const targets = await deps.targets(workspaceId);
    const googleFix = await deps.googleFix(workspaceId);
    const ms = deps.surfaceTimeoutMs;

    const planCtx: PlanContext = { googleFix, hasAgency: targets.hasAgency, recordHours: expected.hours?.weekly, booking: {}, google: {}, websites: {} };
    const base = { facts: [] as FactComparison[] };

    const tasks: Array<Promise<SurfaceReading>> = [];
    for (const site of targets.websites) {
      planCtx.websites[site.surfaceKey] = { kind: site.kind, tenantId: site.tenantId, tenantStableId: site.tenantStableId, siteId: site.siteId, siteUrl: site.url, platform: site.platform };
      const frame = { surfaceKey: site.surfaceKey, kind: "website" as const, label: site.label, url: site.url, changeBy: targets.hasAgency ? "request" as const : "owner" as const };
      tasks.push(withTimeout((async (): Promise<SurfaceReading> => {
        const page = await deps.readers.website(site.url);
        if (!page) return { ...frame, state: "unreadable", reason: UNREADABLE_PAGE, ...base };
        const conflicts = comparePlatformSchema(page.report, publicFacts, site.url);
        return { ...frame, state: "read", facts: sortFacts(compareWebsite(expected, page, conflicts)) };
      })(), ms).catch((): SurfaceReading => ({ ...frame, state: "unreadable", reason: UNREADABLE_PAGE, ...base })));
    }
    for (const place of targets.google) {
      planCtx.google[place.surfaceKey] = { tenantId: place.tenantId, locationId: place.locationId };
      const frame = { surfaceKey: place.surfaceKey, kind: "google" as const, label: place.label, url: null, changeBy: googleFix ? "strelva" as const : "owner" as const };
      tasks.push(withTimeout((async (): Promise<SurfaceReading> => {
        const read = await deps.readers.google({ tenantId: place.tenantId, locationId: place.locationId }, workspaceId);
        if (read.status === "waiting_on_google") return { ...frame, state: "waiting_on_google", facts: sortFacts(waitingFacts(expected)) };
        if (read.status === "reconnect") return { ...frame, state: "reconnect", reason: read.reason.slice(0, 300), ...base };
        if (read.status === "unreadable") return { ...frame, state: "unreadable", reason: read.reason.slice(0, 300), ...base };
        return { ...frame, state: "read", facts: sortFacts(compareGoogle(expected, read.data as GoogleLocationLike, todayIn(hours.success ? hours.data.timezone : undefined, deps.now()))) };
      })(), ms).catch((): SurfaceReading => ({ ...frame, state: "unreadable", reason: "Google didn't answer. Strelva will check again.", ...base })));
    }
    for (const place of targets.booking) {
      const frame = { surfaceKey: place.surfaceKey, kind: "booking" as const, label: place.label, url: null, changeBy: "strelva" as const };
      tasks.push(withTimeout((async (): Promise<SurfaceReading> => {
        const read = await deps.readers.booking(place.scope);
        if (!read) return { ...frame, state: "unreadable", reason: "Couldn't read the booking page. Strelva will check again.", ...base };
        planCtx.booking[place.surfaceKey] = { scope: place.scope, weekly: settingsOrDefault(read.context).bookableHours ?? [] };
        return { ...frame, state: "read", facts: sortFacts(compareBooking(expected, read.context, read.outside)) };
      })(), ms).catch((): SurfaceReading => ({ ...frame, state: "unreadable", reason: "Couldn't read the booking page. Strelva will check again.", ...base })));
    }
    for (const place of targets.yelp) {
      const frame = { surfaceKey: place.surfaceKey, kind: "yelp" as const, label: "Yelp", url: null, changeBy: "read_only" as const };
      tasks.push(withTimeout((async (): Promise<SurfaceReading> => {
        const biz = await deps.readers.yelp(place.tenantId);
        if (!biz) return { ...frame, state: "unreadable", reason: "Couldn't read Yelp. Strelva will check again.", ...base };
        return { ...frame, state: "read", facts: sortFacts(compareYelp(expected, biz as YelpBusinessLike)) };
      })(), ms).catch((): SurfaceReading => ({ ...frame, state: "unreadable", reason: "Couldn't read Yelp. Strelva will check again.", ...base })));
    }

    // Sorted and timestamp-free, so the same inputs always give the same readings (and the same Release hash).
    const readings = (await Promise.all(tasks)).sort((a, b) => a.surfaceKey.localeCompare(b.surfaceKey));
    const differs = readings.filter(reading => reading.facts.some(fact => fact.state === "differs")).length;
    const compared = readings.reduce((sum, reading) => sum + reading.facts.filter(fact => fact.state === "matches" || fact.state === "differs").length, 0);

    const planned = planFixes(readings, planCtx);
    await deps.store.saveFixes(check.id, check.claimToken, planned);
    const result = await deps.store.finish(check.id, check.claimToken, "done", readings, differs, compared, null);
    return { status: "done", differs, release: result.release ? { number: result.release.number } : null };
  } catch (error) {
    const message = (error instanceof Error ? error.message : "The check failed.").replace(/\s+/g, " ").slice(0, 300);
    console.error("[listings-sync] check failed", { workspaceId, checkId: check.id, error: message });
    try { await deps.store.finish(check.id, check.claimToken, "failed", [], 0, 0, message); } catch { /* a lost claim is reclaimed as stale */ }
    return { status: "failed", differs: 0, release: null };
  }
}

/** Null when the App is not available for this business: nothing is queued. */
export async function queueListingsCheck(workspaceId: string, trigger: CheckTrigger, requestedBy?: string, deps: Pick<CheckDeps, "store" | "available"> = liveCheckDeps): Promise<string | null> {
  if (!(await deps.available(workspaceId))) return null;
  return deps.store.queue(workspaceId, trigger, requestedBy ?? null);
}

/**
 * Claims queued checks and runs them one after another until the time budget is
 * spent. A claimed check that is not reached stays running and is reclaimed as
 * stale after 10 minutes.
 */
export async function runQueuedListingsChecks(options: { limit?: number; budgetMs?: number; checkId?: string } = {}, deps: CheckDeps = liveCheckDeps): Promise<{ ran: number; failed: number }> {
  const claimed = await deps.store.claim(options.checkId ? 1 : options.limit ?? 5, options.checkId);
  const deadline = deps.now().getTime() + (options.budgetMs ?? 45_000);
  let ran = 0;
  let failed = 0;
  for (const check of claimed) {
    if (ran > 0 && deps.now().getTime() >= deadline) break;
    const outcome = await runListingsCheck({ id: check.id, workspaceId: check.workspaceId, claimToken: check.claimToken, recordRevision: check.recordRevision }, deps);
    ran += 1;
    if (outcome.status === "failed") failed += 1;
  }
  return { ran, failed };
}

export async function sweepListingsSync(options: { limit?: number } = {}, deps: CheckDeps = liveCheckDeps): Promise<{ queued: number; ran: number; failed: number }> {
  if (!listingsSyncMayBeOn()) return { queued: 0, ran: 0, failed: 0 };
  const mode = releaseFlagEnvMode(LISTINGS_APP);
  if (mode === "off") return { queued: 0, ran: 0, failed: 0 };
  const due = await deps.store.due(options.limit ?? 50, mode);
  let queued = 0;
  for (const workspaceId of due) {
    if (await queueListingsCheck(workspaceId, "sweep", undefined, deps)) queued += 1;
  }
  const result = await runQueuedListingsChecks({ limit: 5 }, deps);
  return { queued, ...result };
}
