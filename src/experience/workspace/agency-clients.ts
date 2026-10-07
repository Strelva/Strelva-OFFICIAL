/**
 * The agency surface reads every client in one server call.
 *
 * `GET /api/workspace/agency-clients?workspaceId=<agency>&cursor=` returns one
 * page of client rows, the agency Queue and the agency Team, built by the
 * `agency_client_overview` RPC (20261007150100_agency_client_overview.sql).
 * Each row is scoped exactly as opening that client would be: the RPC runs
 * `system_actor_scope` per client and never widens it. A client the actor can
 * no longer reach is left out; a client that failed to load is named with
 * `status: "unavailable"` and the other rows still render.
 *
 * `GET /api/workspace/agency-library?workspaceId=<agency>` lists the agency's
 * source Systems and each client Version's improvement status, read through
 * the Versions service under the same actor.
 *
 * This file owns the response shapes, the parsers (a malformed response is
 * refused, never half-rendered) and the browser loaders. It holds no data.
 */
import { z } from "zod";

export const AGENCY_CLIENT_PAGE_SIZE = 100;

const iso = z.string().min(1).max(64);
const uuid = z.string().uuid();

export const agencyClientSystemSchema = z.object({
  id: uuid,
  name: z.string().min(1).max(160),
  kind: z.string().min(1).max(40),
  lifecycle: z.enum(["draft", "live", "paused"]),
  /** Set when this System is a Version of a source: its context label. */
  versionContext: z.string().max(200).nullable(),
}).strict();

export const agencyClientRowSchema = z.object({
  workspaceId: uuid,
  name: z.string().min(1).max(120),
  /**
   * How the actor reaches this client. `member`: a direct membership (Strelva's
   * admin membership from conversion). `agency`: only delegated or assigned
   * work, so only those Systems are listed.
   */
  reach: z.enum(["member", "agency"]),
  role: z.enum(["owner", "admin", "member", "agency"]).nullable(),
  /** A `workspace_providers` mark names this agency. It grants nothing. */
  provider: z.boolean(),
  status: z.enum(["ready", "unavailable"]),
  systems: z.array(agencyClientSystemSchema).max(500),
  needsYou: z.object({ count: z.number().int().min(0), oldestAt: iso.nullable() }).strict(),
  openRequests: z.number().int().min(0),
  improvementsWaiting: z.number().int().min(0),
  lastReceiptAt: iso.nullable(),
  agentBookings: z.boolean().optional(),
}).strict();

export const agencyQueueItemSchema = z.object({
  id: z.string().min(1).max(200),
  kind: z.enum(["request", "needs_you", "improvement"]),
  workspaceId: uuid,
  clientName: z.string().min(1).max(120),
  title: z.string().min(1).max(300),
  /** Opens the client's own System or work, never a copy. */
  systemId: uuid.nullable(),
  workId: uuid.nullable(),
  since: iso,
}).strict();

export const agencyTeamMemberSchema = z.object({
  userId: uuid,
  email: z.string().max(320),
  role: z.enum(["owner", "admin", "member"]),
  /** Clients in this page this person reaches, by name. */
  clients: z.array(z.object({ workspaceId: uuid, name: z.string().min(1).max(120) }).strict()).max(500),
}).strict();

export const agencyClientsPageSchema = z.object({
  agencyWorkspaceId: uuid,
  clients: z.array(agencyClientRowSchema).max(AGENCY_CLIENT_PAGE_SIZE),
  queue: z.array(agencyQueueItemSchema).max(1000),
  team: z.array(agencyTeamMemberSchema).max(500),
  total: z.number().int().min(0),
  nextCursor: z.string().max(200).nullable(),
  /** Whether the provider relationship table was read. False until it is migrated. */
  providersRead: z.boolean(),
}).strict();

export type AgencyClientSystem = z.infer<typeof agencyClientSystemSchema>;
export type AgencyClientRow = z.infer<typeof agencyClientRowSchema>;
export type AgencyQueueItem = z.infer<typeof agencyQueueItemSchema>;
export type AgencyTeamMember = z.infer<typeof agencyTeamMemberSchema>;
export type AgencyClientsPage = z.infer<typeof agencyClientsPageSchema>;

export const VERSION_IMPROVEMENT_STATES = ["up_to_date", "ready", "conflicts", "missing_accounts", "declined", "unavailable"] as const;
export type VersionImprovementState = (typeof VERSION_IMPROVEMENT_STATES)[number];

export const agencyLibraryVersionSchema = z.object({
  versionId: z.string().min(1).max(120),
  workspaceId: uuid,
  clientName: z.string().min(1).max(120),
  systemId: uuid,
  systemName: z.string().min(1).max(160),
  context: z.object({ kind: z.enum(["location", "customer_segment", "agency_client", "franchise"]), label: z.string().min(1).max(200) }).strict(),
  baselineRevision: z.number().int().min(1),
  currentRelease: z.number().int().min(1).nullable(),
  /** Against the source's latest revision. `unavailable`: the Version could not be read. */
  state: z.enum(VERSION_IMPROVEMENT_STATES),
  conflicts: z.array(z.object({ path: z.string().max(300), local: z.unknown(), upstream: z.unknown() }).strict()).max(200),
  missingBindings: z.array(z.string().max(80)).max(50),
  declinedReason: z.string().max(500).nullable(),
}).strict();

export const agencyLibrarySourceSchema = z.object({
  systemId: uuid,
  workspaceId: uuid,
  name: z.string().min(1).max(160),
  /** A same-business source both locations descend from; never listed as a System. */
  hidden: z.boolean(),
  revisions: z.array(z.object({
    number: z.number().int().min(1),
    label: z.string().max(40).nullable(),
    summary: z.string().max(500),
    publishedAt: iso,
  }).strict()).max(500),
  versions: z.array(agencyLibraryVersionSchema).max(1000),
}).strict();

export const agencyLibrarySchema = z.object({
  agencyWorkspaceId: uuid,
  sources: z.array(agencyLibrarySourceSchema).max(500),
}).strict();

export type AgencyLibraryVersion = z.infer<typeof agencyLibraryVersionSchema>;
export type AgencyLibrarySource = z.infer<typeof agencyLibrarySourceSchema>;
export type AgencyLibrary = z.infer<typeof agencyLibrarySchema>;

/** Result of "Review all": one entry per selected Version. Nothing is forced. */
export const agencyBulkReviewResultSchema = z.object({
  sourceSystemId: uuid,
  revision: z.number().int().min(1),
  results: z.array(z.object({
    versionId: z.string().min(1).max(120),
    workspaceId: uuid,
    clientName: z.string().min(1).max(120),
    outcome: z.enum(["prepared", "skipped_conflicts", "skipped_missing_accounts", "skipped_up_to_date", "failed"]),
    detail: z.string().max(500),
  }).strict()).max(1000),
}).strict();
export type AgencyBulkReviewResult = z.infer<typeof agencyBulkReviewResultSchema>;

function failure(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error : fallback;
}

async function getJson(request: typeof fetch, url: string, signal: AbortSignal | undefined, fallback: string): Promise<unknown> {
  const response = await request(url, { credentials: "same-origin", headers: { Accept: "application/json" }, signal });
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(failure(value, fallback));
  return value;
}

/** One request for one page of every client. Refuses rows outside the asked agency. */
export async function loadAgencyClients(
  request: typeof fetch,
  agencyWorkspaceId: string,
  options: { cursor?: string | null; signal?: AbortSignal } = {},
): Promise<AgencyClientsPage> {
  const query = new URLSearchParams({ workspaceId: agencyWorkspaceId });
  if (options.cursor) query.set("cursor", options.cursor);
  const value = await getJson(request, `/api/workspace/agency-clients?${query}`, options.signal, "Clients could not be loaded.");
  const parsed = agencyClientsPageSchema.safeParse(value);
  if (!parsed.success || parsed.data.agencyWorkspaceId !== agencyWorkspaceId) throw new Error("Clients came back in an unexpected shape. Nothing was changed.");
  return parsed.data;
}

export async function loadAgencyLibrary(request: typeof fetch, agencyWorkspaceId: string, signal?: AbortSignal): Promise<AgencyLibrary> {
  const value = await getJson(request, `/api/workspace/agency-library?workspaceId=${encodeURIComponent(agencyWorkspaceId)}`, signal, "The library could not be loaded.");
  const parsed = agencyLibrarySchema.safeParse(value);
  if (!parsed.success || parsed.data.agencyWorkspaceId !== agencyWorkspaceId) throw new Error("The library came back in an unexpected shape. Nothing was changed.");
  return parsed.data;
}

/** "Review all": prepares an improvement on every selected ready Version. */
export async function reviewAllImprovements(
  request: typeof fetch,
  input: { agencyWorkspaceId: string; sourceSystemId: string; revision: number; versionIds: string[] },
): Promise<AgencyBulkReviewResult> {
  const response = await request("/api/workspace/agency-library", {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "review_all", workspaceId: input.agencyWorkspaceId, sourceSystemId: input.sourceSystemId, revision: input.revision, versionIds: input.versionIds }),
  });
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(failure(value, "The improvements could not be prepared. Nothing was changed."));
  const parsed = agencyBulkReviewResultSchema.safeParse(value);
  if (!parsed.success) throw new Error("The review came back in an unexpected shape.");
  return parsed.data;
}

/** Queue order: oldest first, so the longest wait is on top. */
export function agencyQueueOrder(items: readonly AgencyQueueItem[]): AgencyQueueItem[] {
  return [...items].sort((left, right) => Date.parse(left.since) - Date.parse(right.since) || left.id.localeCompare(right.id));
}

/** Days since `at`, floored, never negative. For "waiting 6 days". */
export function daysWaiting(at: string | null, now = Date.now()): number | null {
  if (!at) return null;
  const then = Date.parse(at);
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((now - then) / 86_400_000));
}

/** Library counts per source, for "5 ready, 1 has conflicts, 1 missing accounts". */
export function libraryCounts(source: AgencyLibrarySource): Record<VersionImprovementState, number> {
  const counts = Object.fromEntries(VERSION_IMPROVEMENT_STATES.map((state) => [state, 0])) as Record<VersionImprovementState, number>;
  for (const version of source.versions) counts[version.state] += 1;
  return counts;
}
