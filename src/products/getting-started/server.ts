import { createHash } from "node:crypto";
import { patchBusinessRecord, readBusinessRecord } from "@/platform/business-record/service";
import type { BusinessRecord } from "@/platform/business-record/contracts";
import { BusinessRecordConflictError } from "@/platform/business-record/repository";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { enterCustomerBusiness } from "@/platform/workspaces/business-entry";
import { listWorkspaces } from "@/platform/workspaces/repository";
import { WorkspaceAccessError, WorkspaceConflictError, type Workspace, type WorkspaceActor } from "@/platform/workspaces/types";
import { getAiVisibilityResult } from "@/products/ai-visibility/results";
import { parseAiVisibilityAssessmentPayload } from "@/products/ai-visibility/work";
import { savePublicAiVisibilityResult } from "@/products/ai-visibility/usecase";
import { getPublicWebsiteAudit, savePublicWebsiteAudit } from "@/products/website-audit/server";
import { crawlWebsite, WebsiteCrawlError } from "@/products/websites/rebuild-crawl";
import { extractBusinessFacts } from "@/products/websites/rebuild-pipeline";
import { CHECK_RESULT_ID, type CheckForBusiness, type FoundFactKey, type GettingStartedBusiness, type WebsiteReading } from "./contracts";
import { confirmedPatch, foundFactsFromReading } from "./found-facts";
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
  readAudit: (resultId: string) => Promise<{ url: string } | null>;
  saveScan: (input: { actor: WorkspaceActor; workspaceId: string; resultId: string }) => Promise<{ work: { id: string } }>;
  saveAudit: (input: { actor: WorkspaceActor; workspaceId: string; resultId: string }) => Promise<{ id: string }>;
  crawl: typeof crawlWebsite;
  extract: typeof extractBusinessFacts;
  rateLimited: (key: string, max: number, windowMs: number) => Promise<boolean>;
}

const defaults: GettingStartedDeps = {
  listWorkspaces, readRecord: readBusinessRecord, patchRecord: patchBusinessRecord, enterBusiness: enterCustomerBusiness,
  readScan: getAiVisibilityResult, readAudit: getPublicWebsiteAudit,
  saveScan: savePublicAiVisibilityResult, saveAudit: savePublicWebsiteAudit,
  crawl: crawlWebsite, extract: extractBusinessFacts, rateLimited: isRateLimitedWindowedAsync,
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
      return audit ? { resultId: id, kind: "website_audit", name: null, website } : null;
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
        idempotencyKey: uuidFrom(["getting-started:check", actor.userId, check.resultId, name.toLowerCase()]),
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
    return { workspaceId, name: workspace.name, website: businessWebsite(record), canConfirm: record.access === "owner", revision: record.revision };
  }

  /** "Use my current website": read it and return Found facts. Writes nothing. */
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
    return { url, revision: record.revision, facts: foundFactsFromReading(found, record), pagesRead };
  }

  /** The owner's own write: only what they ticked, against the revision they saw. */
  async function confirm(actor: WorkspaceActor, input: { workspaceId: string; revision: number; website?: string; facts: Array<{ key: FoundFactKey; value: unknown }> }) {
    await directBusiness(actor, input.workspaceId);
    const record = await deps.readRecord(actor, input.workspaceId);
    if (record.access !== "owner") throw new WorkspaceAccessError();
    if (record.revision !== input.revision) throw new WorkspaceConflictError("Your business details changed since this reading. Read the website again.");
    if (input.website !== undefined && !normalizeBusinessWebsite(input.website)) throw new GettingStartedInputError("Enter your public website address, like yourbusiness.com.");
    const website = input.website && !(businessWebsite(record) && !sameWebsite(businessWebsite(record), input.website)) ? input.website : undefined;
    const planned = confirmedPatch(record, input.facts, website);
    if (planned.kind === "invalid") throw new GettingStartedInputError(planned.message);
    if (planned.kind === "unchanged") return { saved: [] as string[], revision: record.revision };
    const result = await deps.patchRecord(actor, input.workspaceId, record.revision, planned.patch, {
      source: "owner", commandId: uuidFrom(["getting-started:confirm", input.workspaceId, record.revision, planned.patch]),
    });
    return { saved: planned.keys, revision: result.revision };
  }

  return { readCheck, startFromCheck, read, readWebsite, confirm, websiteHost };
}

export const gettingStarted = createGettingStarted();
