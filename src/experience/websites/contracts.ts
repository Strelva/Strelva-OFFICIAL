import {
  type ApproveWebsiteInput,
  type CreateWebsiteInput,
  type PrepareWebsiteLaunchInput,
  type ReviseWebsiteInput,
  type Website,
  type WebsiteRecord,
  type WebsiteBrief,
} from "@/products/websites/contracts";
import { WEBSITE_API_PATH, createWebsiteRequestId, websiteWorkPath } from "@/products/websites/client";
import { websiteSchema } from "@/products/websites/contracts";

export type { Website, WebsiteBrief, WebsiteRecord } from "@/products/websites/contracts";

/** Saved work determines which website interface can read it, independently of new-work rollout. */
export function websiteDocumentVersion(value: unknown): 2 | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as { version?: unknown; rebuild?: { version?: unknown } };
  return item.version === 2 || item.rebuild?.version === 2 ? 2 : undefined;
}

/**
 * Browser transport for the website product. The product contract owns the
 * lifecycle and revisions; this interface only adds the workspace context the
 * customer shell needs when it calls the HTTP boundary.
 */
export interface WebsiteExperienceTransport {
  read(input: { workspaceId: string; workId: string }, signal: AbortSignal): Promise<WebsiteRecord>;
  create(input: CreateWebsiteInput & { workspaceId: string }): Promise<WebsiteRecord>;
  revise(input: ReviseWebsiteInput & { workspaceId: string; workId: string }): Promise<WebsiteRecord>;
  approve(input: ApproveWebsiteInput & { workspaceId: string; workId: string }): Promise<WebsiteRecord>;
  prepareLaunch(input: PrepareWebsiteLaunchInput & { workspaceId: string; workId: string }): Promise<WebsiteRecord>;
}

export class WebsiteExperienceError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "WebsiteExperienceError";
  }
}

/** A write may have committed before its acknowledgement reached the browser. */
export class WebsiteUnconfirmedError extends Error {
  constructor(reason?: string) { super(`${reason ? `${reason} ` : ""}The website change could not be confirmed. Check its current saved state before continuing.`); }
}

/** Cross-field lifecycle checks used for mutation acknowledgement and recovery reads. */
export function currentWebsiteRecord(next: WebsiteRecord, workspaceId: string, workId?: string): WebsiteRecord {
  const website = next.website, candidate = website.candidate;
  const launch = website.launch;
  const approved = Boolean(candidate && website.approvedCandidateRevision === candidate.revision);
  const emptyLaunch = launch.status === "not_requested" && launch.candidateRevision === null && launch.receipt === null && launch.failure === null;
  const selectedLaunch = Boolean(candidate && launch.candidateRevision === candidate.revision);
  const phase = website.status === "draft" ? candidate === null && website.approvedCandidateRevision === null && emptyLaunch && website.lastError === null
    : website.status === "preview_ready" ? Boolean(candidate) && website.approvedCandidateRevision === null && emptyLaunch && website.lastError === null
    : website.status === "approved" ? approved && emptyLaunch && website.lastError === null
    : website.status === "launch_pending" ? approved && selectedLaunch && launch.status === "pending" && (!launch.receipt || launch.receipt.status === "pending") && launch.failure === null && website.lastError === null
    : website.status === "published" ? approved && selectedLaunch && launch.status === "published" && launch.receipt?.status === "published" && launch.failure === null && website.lastError === null
    : website.lastError?.stage === "artifact" ? candidate === null && website.approvedCandidateRevision === null && emptyLaunch
    : website.lastError?.stage === "launch" && approved && selectedLaunch && launch.status === "failed" && launch.receipt === null && Boolean(launch.failure);
  const invalid = !phase || next.workspaceId !== workspaceId || Boolean(workId && next.workId !== workId)
    || Boolean(candidate && candidate.revision > website.revision)
    || Boolean(launch.receipt && (!candidate || launch.receipt.candidateRevision !== candidate.revision || launch.receipt.artifactHash !== candidate.contentHash));
  if (invalid) throw new WebsiteUnconfirmedError();
  return next;
}

type WebsiteMutation = "create" | "revise" | "approve" | "prepareLaunch";
type MutationIdentity = { workspaceId: string; workId?: string; expectedRevision?: number; brief?: WebsiteBrief; candidateRevision?: number; candidateContentHash?: string };
export function websiteMutationAcknowledgement(next: WebsiteRecord, action: WebsiteMutation, input: MutationIdentity): WebsiteRecord {
  currentWebsiteRecord(next, input.workspaceId, input.workId);
  const website = next.website, candidate = website.candidate;
  const expectedBrief = input.brief;
  const sameBrief = !expectedBrief || [...new Set([...Object.keys(expectedBrief), ...Object.keys(website.brief)])].every(key => expectedBrief[key as keyof WebsiteBrief] === website.brief[key as keyof WebsiteBrief]);
  let valid = sameBrief;
  if (action === "create") valid &&= website.revision >= 1 || website.status === "draft" && website.revision === 0;
  if (action === "revise") valid &&= website.revision === input.expectedRevision! + 1 && website.approvedCandidateRevision === null && website.launch.status === "not_requested" && (website.status === "preview_ready" && candidate?.revision === website.revision || website.status === "failed" && website.lastError?.stage === "artifact" && candidate === null);
  if (action === "approve") valid &&= website.revision === input.expectedRevision! + 1 && website.status === "approved" && candidate?.revision === input.candidateRevision && candidate.contentHash === input.candidateContentHash && website.approvedCandidateRevision === input.candidateRevision;
  if (action === "prepareLaunch") valid &&= website.revision >= input.expectedRevision! && website.revision <= input.expectedRevision! + 2 && candidate?.revision === input.candidateRevision && candidate.contentHash === input.candidateContentHash && website.approvedCandidateRevision === input.candidateRevision && website.launch.candidateRevision === input.candidateRevision && (["launch_pending", "published"].includes(website.status) || website.status === "failed" && website.lastError?.stage === "launch");
  if (!valid) throw new WebsiteUnconfirmedError();
  return next;
}

function errorMessage(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const error = (value as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && !Array.isArray(error)) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new WebsiteExperienceError(errorMessage(value, fallback), response.status);
  if (!value) throw new WebsiteExperienceError(fallback, response.status);
  return value as T;
}

function isRecord(value: unknown): value is WebsiteRecord {
  return Boolean(value && typeof value === "object" && "workId" in value && "website" in value);
}

/** Validate the response at the public boundary before putting it in React state. */
export function parseWebsiteRecord(value: unknown, workspaceId: string): WebsiteRecord {
  const raw = isRecord(value)
    ? value
    : value && typeof value === "object" && isRecord((value as { website?: unknown }).website)
      ? (value as { website: WebsiteRecord }).website
      : null;
  if (!raw || typeof raw.workId !== "string" || typeof raw.workspaceId !== "string" || typeof raw.createdAt !== "string" || typeof raw.updatedAt !== "string") {
    throw new WebsiteExperienceError("The website service returned an invalid record.");
  }
  let website: Website;
  try {
    website = websiteSchema.parse(raw.website);
  } catch {
    throw new WebsiteExperienceError("The website service returned an invalid record.");
  }
  return {
    workId: raw.workId,
    workspaceId: raw.workspaceId || workspaceId,
    website,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

async function record(response: Response, fallback: string, workspaceId: string): Promise<WebsiteRecord> {
  return parseWebsiteRecord(await readJson<unknown>(response, fallback), workspaceId);
}

const jsonHeaders = { "Content-Type": "application/json", Accept: "application/json" };

async function post(path: string, body: unknown, fallback: string, input: MutationIdentity, action: WebsiteMutation): Promise<WebsiteRecord> {
  try {
    const response = await fetch(path, { method: "POST", credentials: "same-origin", headers: jsonHeaders, body: JSON.stringify(body) });
    return websiteMutationAcknowledgement(await record(response, fallback, input.workspaceId), action, input);
  } catch (error) {
    // The route rejects an unauthenticated actor before calling any action.
    // Other status codes can arise after persistence or launch preparation.
    if (error instanceof WebsiteExperienceError && error.status === 401) throw error;
    throw error instanceof WebsiteUnconfirmedError ? error : new WebsiteUnconfirmedError(error instanceof Error ? error.message : undefined);
  }
}

/** The customer surface's sole HTTP transport for the website product. */
export const serverWebsiteTransport: WebsiteExperienceTransport = {
  async read({ workspaceId, workId }, signal) {
    const params = new URLSearchParams({ workspaceId });
    return record(await fetch(`${websiteWorkPath(workId)}?${params}`, { signal, cache: "no-store", credentials: "same-origin" }), "The saved website could not be loaded.", workspaceId);
  },
  create(input) {
    return post(WEBSITE_API_PATH, { action: "create", ...input }, "The website preview could not be created.", input, "create");
  },
  revise(input) {
    const { workspaceId, workId, ...body } = input;
    return post(websiteWorkPath(workId), { action: "revise", ...body }, "The website preview could not be generated.", input, "revise");
  },
  approve(input) {
    const { workspaceId, workId, ...body } = input;
    return post(websiteWorkPath(workId), { action: "approve", ...body }, "This website preview could not be approved.", input, "approve");
  },
  prepareLaunch(input) {
    const { workspaceId, workId, ...body } = input;
    return post(websiteWorkPath(workId), { action: "prepareLaunch", ...body }, "Launch could not be prepared.", input, "prepareLaunch");
  },
};

export { createWebsiteRequestId };
