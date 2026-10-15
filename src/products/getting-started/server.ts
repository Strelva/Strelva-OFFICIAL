import { createHash } from "node:crypto";
import { patchBusinessRecord, readBusinessRecord } from "@/platform/business-record/service";
import type { BusinessRecord } from "@/platform/business-record/contracts";
import { BusinessRecordConflictError } from "@/platform/business-record/repository";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { enterCustomerBusiness } from "@/platform/workspaces/business-entry";
import { listWorkspaces } from "@/platform/workspaces/repository";
import { WorkspaceAccessError, WorkspaceConflictError, type Workspace, type WorkspaceActor } from "@/platform/workspaces/types";
import { getAiVisibilityResult, parseAiVisibilityAssessmentPayload, savePublicAiVisibilityResult } from "@/products/ai-visibility/server";
import { getPublicWebsiteAudit, savePublicWebsiteAudit } from "@/products/website-audit/server";
import { crawlWebsite, extractBusinessFacts, WebsiteCrawlError } from "@/products/websites/server";
import { decideBusinessFoundFacts, readBusinessFoundFacts, stageOwnerWebsiteFoundFacts } from "@/products/found-facts/server";
import type { FoundFactDecision } from "@/products/found-facts/contracts";
import { CHECK_RESULT_ID, type CheckForBusiness, type GettingStartedBusiness, type WebsiteReading } from "./contracts";
import { confirmationValue, foundFactsFromReading, screenFoundFact } from "./found-facts";
import { businessWebsite, normalizeBusinessWebsite, sameWebsite, websiteHost, websiteLinks } from "./website";

/** The crawl is kept small: the owner is waiting on the page. */
const READ_LIMITS = { maxPages: 5, timeoutMs: 15_000, maxBytes: 2_000_000 } as const;
/** How many owned businesses are compared by website before creating another. */
const REUSE_SCAN_LIMIT = 10;

export class GettingStartedInputError extends Error {
  constructor(message: string) { super(message); this.name = "GettingStartedInputError"; }
}
export class GettingStartedUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = "GettingStartedUnavailableError"; }
}
export class GettingStartedRateLimitError extends Error {
  constructor() { super("You've read websites several times this hour. Try again later."); this.name = "GettingStartedRateLimitError"; }
}

export interface GettingStartedDeps {
  listWorkspaces: typeof listWorkspaces;
  readRecord: typeof readBusinessRecord;
  patchRecord: typeof patchBusinessRecord;
  enterBusiness: typeof enterCustomerBusiness;
  readScan: (resultId: string) => Promise<unknown>;
  readAudit: (resultId: string) => Promise<{ url: string; businessName?: string } | null>;
  saveScan: (input: { actor: WorkspaceActor; workspaceId: string; resultId: string }) => Promise<{ work: { id: string } }>;
  saveAudit: (input: { actor: WorkspaceActor; workspaceId: string; resultId: string }) => Promise<{ id: string }>;
  crawl: typeof crawlWebsite;
  extract: typeof extractBusinessFacts;
  rateLimited: (key: string, max: number, windowMs: number) => Promise<boolean>;
  readFound: typeof readBusinessFoundFacts;
  stageFound: typeof stageOwnerWebsiteFoundFacts;
  decideFound: typeof decideBusinessFoundFacts;
}

const defaults: GettingStartedDeps = {
  listWorkspaces, readRecord: readBusinessRecord, patchRecord: patchBusinessRecord, enterBusiness: enterCustomerBusiness,
  readScan: getAiVisibilityResult, readAudit: getPublicWebsiteAudit,
  saveScan: savePublicAiVisibilityResult, saveAudit: savePublicWebsiteAudit,
  crawl: crawlWebsite, extract: extractBusinessFacts, rateLimited: isRateLimitedWindowedAsync,
  readFound: readBusinessFoundFacts, stageFound: stageOwnerWebsiteFoundFacts, decideFound: decideBusinessFoundFacts,
};

function uuidFrom(parts: unknown[]): string {
  const hash = createHash("sha256").update(JSON.stringify(parts)).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function ownedBusinesses(workspaces: Workspace[]): Workspace[] {
  return workspaces.filter(item => item.kind === "customer" && item.access === "member" && item.role === "owner");
}

export function createGettingStarted(deps: GettingStartedDeps = defaults) {
  async function directBusiness(actor: WorkspaceActor, workspaceId: string): Promise<Workspace> {
    const workspace = (await deps.listWorkspaces(actor)).find(item => item.id === workspaceId && item.kind === "customer" && item.access === "member");
    if (!workspace) throw new WorkspaceAccessError();
    return workspace;
  }

  /** The check's own name and website. Read only; the result id is the capability. */
  async function readCheck(resultId: string): Promise<CheckForBusiness | null> {
    const id = resultId.trim();
    if (!CHECK_RESULT_ID.test(id)) return null;
    if (id.startsWith("audit_")) {
      const audit = await deps.readAudit(id).catch(() => null);
      const website = normalizeBusinessWebsite(audit?.url);
      return audit ? { resultId: id, kind: "website_audit", name: audit.businessName?.trim().slice(0, 120) || null, website } : null;
    }
    const stored = await deps.readScan(id).catch(() => null);
    const result = stored && typeof stored === "object" ? parseAiVisibilityAssessmentPayload((stored as { result?: unknown }).result) : null;
    if (!result || (stored as { id?: unknown }).id !== id) return null;
    return { resultId: id, kind: "ai_visibility", name: result.business.trim().slice(0, 120) || null, website: normalizeBusinessWebsite(result.url) };
  }

  /** Set the one website when the record has none (or the same one). Never replaces a different website. */
  async function recordWebsite(actor: WorkspaceActor, workspaceId: string, website: string, commandParts: unknown[]): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const record = await deps.readRecord(actor, workspaceId);
      if (record.access !== "owner") return;
      const current = businessWebsite(record);
      if (current && !sameWebsite(current, website)) return;
      const links = websiteLinks(record, website);
      if (!links) return;
      try {
        await deps.patchRecord(actor, workspaceId, record.revision, { facts: { links: { value: links } } }, { source: "owner", commandId: uuidFrom([...commandParts, record.revision]) });
        return;
      } catch (error) {
        if (!(error instanceof BusinessRecordConflictError) || attempt === 1) throw error;
      }
    }
  }

  /**
   * "Start with this fix": the check becomes the business. Reuses the owner's
   * business with the same website when there is one; otherwise creates it
   * from the check's name with a command id derived from the check, so a
   * retry or a double click returns the same business. The check result is
   * then saved into that business, and its website becomes the business's
   * one website. Nothing is sent and nothing is published.
   */
  async function startFromCheck(actor: WorkspaceActor, input: { resultId: string; name: string }) {
    const check = await readCheck(input.resultId);
    if (!check) throw new GettingStartedUnavailableError("This check has expired or is unavailable. Run another check.");
    const name = input.name.trim().slice(0, 120);
    if (!name) throw new GettingStartedInputError("Enter your business name.");
    let workspaceId: string | null = null;
    let reused = false;
    if (check.website) {
      for (const business of ownedBusinesses(await deps.listWorkspaces(actor)).slice(0, REUSE_SCAN_LIMIT)) {
        const record = await deps.readRecord(actor, business.id).catch(() => null);
        if (record && sameWebsite(businessWebsite(record), check.website)) { workspaceId = business.id; reused = true; break; }
      }
    }
    let alreadyCreated = reused;
    if (!workspaceId) {
      const entered = await deps.enterBusiness(actor, {
        destination: { kind: "new", name }, initialRequest: null,
        idempotencyKey: uuidFrom(["getting-started:check", actor.userId, check.resultId]),
      });
      workspaceId = entered.workspaceId;
      alreadyCreated = entered.alreadyCreated;
    }
    if (check.website) await recordWebsite(actor, workspaceId, check.website, ["getting-started:website", workspaceId, check.resultId]);
    const workId = check.kind === "website_audit"
      ? (await deps.saveAudit({ actor, workspaceId, resultId: check.resultId })).id
      : (await deps.saveScan({ actor, workspaceId, resultId: check.resultId })).work.id;
    return { workspaceId, workId, reused, alreadyCreated };
  }

  async function read(actor: WorkspaceActor, workspaceId: string): Promise<GettingStartedBusiness> {
    const workspace = await directBusiness(actor, workspaceId);
    const record: BusinessRecord = await deps.readRecord(actor, workspaceId);
    // A store that isn't there yet (migration unapplied) shows nothing waiting rather than failing the page.
    const found = await deps.readFound(actor, workspaceId).catch(() => []);
    return {
      workspaceId, name: workspace.name, website: businessWebsite(record), canConfirm: record.access === "owner", revision: record.revision,
      waiting: found.map(fact => screenFoundFact(fact, record)),
    };
  }

  /**
   * "Use my current website": read it and keep what it found beside the
   * record as Found facts (the one store), so anything the owner leaves for
   * later is still there next time. Never writes the record.
   */
  async function readWebsite(actor: WorkspaceActor, workspaceId: string, rawUrl: string): Promise<WebsiteReading> {
    const url = normalizeBusinessWebsite(rawUrl);
    if (!url) throw new GettingStartedInputError("Enter your public website address, like yourbusiness.com.");
    await directBusiness(actor, workspaceId);
    const record = await deps.readRecord(actor, workspaceId);
    if (record.access !== "owner") throw new WorkspaceAccessError();
    if (await deps.rateLimited(`getting-started:read-website:${actor.userId}`, 6, 3_600_000)) throw new GettingStartedRateLimitError();
    let found: ReturnType<typeof extractBusinessFacts>;
    let pagesRead = 0;
    try {
      const crawl = await deps.crawl(url, READ_LIMITS);
      pagesRead = crawl.pages.length;
      found = deps.extract({ url }, crawl);
    } catch (error) {
      throw new GettingStartedUnavailableError(error instanceof WebsiteCrawlError ? error.message : "We couldn't read this website. Check the address, or add your details yourself.");
    }
    const staged = await deps.stageFound(actor, workspaceId, foundFactsFromReading(found, record));
    return { url, revision: record.revision, facts: staged.found.map(fact => screenFoundFact(fact, record)), pagesRead };
  }

  /**
   * The owner decides Found facts, in one transaction against the revision
   * they saw: confirmed ones become the owner's own verified facts, later
   * ones keep waiting, removed ones stay out. The website, when given, then
   * becomes the business's one website (never replacing a different one).
   */
  async function decide(actor: WorkspaceActor, input: { workspaceId: string; revision: number; website?: string; decisions: FoundFactDecision[]; timeZone?: string }) {
    await directBusiness(actor, input.workspaceId);
    const record = await deps.readRecord(actor, input.workspaceId);
    if (record.access !== "owner") throw new WorkspaceAccessError();
    if (record.revision !== input.revision) throw new WorkspaceConflictError("Your business details changed since this reading. Read the website again.");
    if (input.website !== undefined && !normalizeBusinessWebsite(input.website)) throw new GettingStartedInputError("Enter your public website address, like yourbusiness.com.");
    const open = new Map((await deps.readFound(actor, input.workspaceId)).map(fact => [fact.id, fact]));
    const decisions: FoundFactDecision[] = [];
    for (const decision of input.decisions) {
      const fact = open.get(decision.id);
      if (!fact) throw new WorkspaceConflictError("That was already decided. Refresh to see what's still waiting.");
      if (decision.decision !== "confirm") { decisions.push(decision); continue; }
      if (fact.key === "categories") throw new GettingStartedInputError("Categories stay for reference. Your business details have no place for them yet.");
      const planned = confirmationValue(fact, record, input.timeZone);
      if (planned && "refused" in planned) throw new GettingStartedInputError(planned.refused);
      decisions.push(planned ? { id: decision.id, decision: "confirm", value: planned.value } : { id: decision.id, decision: "confirm" });
    }
    let revision = record.revision;
    let decided = { confirmed: 0, changed: 0, removed: 0, later: 0 };
    let waiting = [...open.values()];
    if (decisions.length) {
      const result = await deps.decideFound(actor, input.workspaceId, {
        decisions, expectedRevision: record.revision, commandId: uuidFrom(["getting-started:decide", input.workspaceId, record.revision, decisions]),
      });
      revision = result.revision;
      decided = { confirmed: result.confirmed, changed: result.changed, removed: result.removed, later: result.later };
      waiting = result.found;
    }
    let websiteSaved = false;
    if (input.website) {
      const current = businessWebsite(await deps.readRecord(actor, input.workspaceId));
      if (!current || !sameWebsite(current, input.website)) {
        await recordWebsite(actor, input.workspaceId, input.website, ["getting-started:website-reading", input.workspaceId, input.website]);
        const after = await deps.readRecord(actor, input.workspaceId);
        websiteSaved = sameWebsite(businessWebsite(after), input.website);
        revision = after.revision;
      }
    }
    const latest = await deps.readRecord(actor, input.workspaceId);
    return { ...decided, websiteSaved, revision, waiting: waiting.map(fact => screenFoundFact(fact, latest)) };
  }

  return { readCheck, startFromCheck, read, readWebsite, decide, websiteHost };
}

export const gettingStarted = createGettingStarted();

export { businessWebsite } from "./website";
