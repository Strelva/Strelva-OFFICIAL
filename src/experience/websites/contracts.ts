import {
  type ApproveWebsiteInput,
  type CreateWebsiteInput,
  type PublishWebsiteInput,
  type ReviseWebsiteInput,
  type TakeWebsiteOfflineInput,
  type Website,
  type WebsiteRecord,
} from "@/products/websites/contracts";
import { WEBSITE_API_PATH, createWebsiteRequestId, websiteWorkPath } from "@/products/websites/client";
import { websiteSchema } from "@/products/websites/contracts";

export type { Website, WebsiteBrief, WebsiteRecord } from "@/products/websites/contracts";

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
  publish(input: PublishWebsiteInput & { workspaceId: string; workId: string }): Promise<WebsiteRecord>;
  takeOffline(input: TakeWebsiteOfflineInput & { workspaceId: string; workId: string }): Promise<WebsiteRecord>;
}

export class WebsiteExperienceError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "WebsiteExperienceError";
  }
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

/** The website product's HTTP transport over the workspace request function. */
export function createWebsiteTransport(request: typeof fetch = fetch): WebsiteExperienceTransport {
  const post = (path: string, body: unknown, fallback: string, workspaceId: string): Promise<WebsiteRecord> => request(path, {
    method: "POST",
    credentials: "same-origin",
    headers: jsonHeaders,
    body: JSON.stringify(body),
  }).then(response => record(response, fallback, workspaceId));
  return {
    async read({ workspaceId, workId }, signal) {
      const params = new URLSearchParams({ workspaceId });
      return record(await request(`${websiteWorkPath(workId)}?${params}`, { signal, cache: "no-store", credentials: "same-origin" }), "The saved website could not be loaded.", workspaceId);
    },
    create(input) {
      return post(WEBSITE_API_PATH, { action: "create", ...input }, "The website preview could not be created.", input.workspaceId);
    },
    revise(input) {
      const { workspaceId, workId, ...body } = input;
      return post(websiteWorkPath(workId), { action: "revise", ...body }, "The website preview could not be generated.", workspaceId);
    },
    approve(input) {
      const { workspaceId, workId, ...body } = input;
      return post(websiteWorkPath(workId), { action: "approve", ...body }, "This website preview could not be approved.", workspaceId);
    },
    publish(input) {
      const { workspaceId, workId, ...body } = input;
      return post(websiteWorkPath(workId), { action: "publish", ...body }, "The website could not be published.", workspaceId);
    },
    takeOffline(input) {
      const { workspaceId, workId, ...body } = input;
      return post(websiteWorkPath(workId), { action: "takeOffline", ...body }, "The website could not be taken offline.", workspaceId);
    },
  };
}

/** The customer surface's default HTTP transport for the website product. */
export const serverWebsiteTransport: WebsiteExperienceTransport = createWebsiteTransport((input, init) => fetch(input, init));

export { createWebsiteRequestId };
