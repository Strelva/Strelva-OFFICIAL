import { getSupabase } from "@/platform/infra/db/client";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { ClientImportRow } from "../import-contract";
import { createGoHighLevelImportAdapter, listGhlSubAccounts } from "./adapter";
import { GHL_MESSAGES, GhlApiError, GhlClient, type GhlFetch, type GhlTokenSource } from "./client";
import { GhlConnectError, exchangeGhlCode, refreshGhlToken } from "./oauth";
import { GHL_ID, GhlStoreError, publicGhlConnection, supabaseGhlConnectionStore, type GhlConnection, type GhlConnectionStore, type GhlConnectionWithSecrets } from "./repository";
import { parseGhlWebhook, verifyGhlWebhookSignature, type GhlWebhookKeys } from "./webhook";

/**
 * The GoHighLevel source, end to end: connect an agency, read its sub-accounts
 * as Import clients rows, receive install deliveries, and say which
 * sub-accounts are new since the agency last imported. Nothing here adds a
 * client or writes to HighLevel.
 */

export class GhlImportError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = "GhlImportError";
  }
}

type AgencyRole = "owner" | "admin" | "member" | "viewer" | null;

export interface GhlServiceDeps {
  store: GhlConnectionStore;
  fetcher: GhlFetch;
  now(): number;
  /** The actor's role in this workspace, or null when it isn't an agency workspace they belong to. */
  agencyRole(actor: WorkspaceActor, workspaceId: string): Promise<AgencyRole>;
  clock?: { now(): number; sleep(ms: number): Promise<void> };
}

type Db = { from(table: string): { select(c: string): { eq(c: string, v: string): { eq(c: string, v: string): { maybeSingle(): PromiseLike<{ data: unknown; error: unknown }> }; maybeSingle(): PromiseLike<{ data: unknown; error: unknown }> } } } };

async function supabaseAgencyRole(actor: WorkspaceActor, workspaceId: string): Promise<AgencyRole> {
  const db = getSupabase() as unknown as Db | null;
  if (!db) throw new GhlImportError(GHL_MESSAGES.unavailable, 503, "unavailable");
  const workspace = await db.from("workspaces").select("kind").eq("id", workspaceId).maybeSingle();
  if (workspace.error) throw new GhlImportError("Your agency couldn't be checked. Try again.", 503, "unavailable");
  if ((workspace.data as { kind?: string } | null)?.kind !== "agency") return null;
  const membership = await db.from("workspace_memberships").select("role").eq("workspace_id", workspaceId).eq("user_id", actor.userId).maybeSingle();
  if (membership.error) throw new GhlImportError("Your agency couldn't be checked. Try again.", 503, "unavailable");
  return ((membership.data as { role?: string } | null)?.role as AgencyRole) ?? null;
}

export function defaultGhlServiceDeps(): GhlServiceDeps {
  return { store: supabaseGhlConnectionStore(), fetcher: (input, init) => fetch(input, init), now: () => Date.now(), agencyRole: supabaseAgencyRole };
}

/** Only an agency owner or admin connects HighLevel or imports from it, the same people who may add clients. */
export async function assertGhlAgencyManager(actor: WorkspaceActor, workspaceId: string, deps: GhlServiceDeps): Promise<void> {
  const role = await deps.agencyRole(actor, workspaceId);
  if (role !== "owner" && role !== "admin") {
    throw new GhlImportError("Only an owner or admin of this agency can import clients from HighLevel.", 403, "agency_client_access_denied");
  }
}

function toImportError(error: unknown): GhlImportError {
  if (error instanceof GhlImportError) return error;
  if (error instanceof GhlApiError) {
    const status = error.code === "revoked" ? 409 : error.code === "insufficient_access" ? 403 : error.code === "rate_limited" ? 429 : error.code === "not_configured" ? 503 : 502;
    return new GhlImportError(error.message, status, `ghl_${error.code}`);
  }
  if (error instanceof GhlConnectError) {
    const status = error.code === "not_company" ? 400 : error.code === "token_refused" ? 409 : 503;
    return new GhlImportError(error.message, status, `ghl_${error.code}`);
  }
  if (error instanceof GhlStoreError) return new GhlImportError(error.message, error.code === "company_taken" ? 409 : 503, `ghl_${error.code}`);
  return new GhlImportError(GHL_MESSAGES.unavailable, 503, "ghl_unavailable");
}

/** Exchange the consent code and store the agency's account connection. */
export async function connectGhlAgency(actor: WorkspaceActor, workspaceId: string, code: string, redirectUri: string, deps: GhlServiceDeps = defaultGhlServiceDeps()): Promise<GhlConnection> {
  await assertGhlAgencyManager(actor, workspaceId, deps);
  try {
    const tokens = await exchangeGhlCode(code, redirectUri, deps.fetcher, deps.now());
    if (!GHL_ID.test(tokens.companyId)) throw new GhlConnectError(GHL_MESSAGES.malformed, "unavailable");
    return await deps.store.save({ workspaceId, companyId: tokens.companyId, connectedBy: actor.userId, tokens });
  } catch (error) {
    throw toImportError(error);
  }
}

/** The connection's state for the agency's screen. Never includes a token. */
export async function readGhlConnection(actor: WorkspaceActor, workspaceId: string, deps: GhlServiceDeps = defaultGhlServiceDeps()): Promise<GhlConnection | null> {
  await assertGhlAgencyManager(actor, workspaceId, deps);
  const connection = await deps.store.read(workspaceId).catch((error) => { throw toImportError(error); });
  return connection ? publicGhlConnection(connection) : null;
}

/**
 * Forget the stored grant. HighLevel documents no token revocation endpoint
 * (UNVERIFIED; none found in apps/oauth.json), so the agency also removes the
 * app in HighLevel; the AppUninstall delivery then confirms it.
 */
export async function disconnectGhlAgency(actor: WorkspaceActor, workspaceId: string, deps: GhlServiceDeps = defaultGhlServiceDeps()): Promise<void> {
  await assertGhlAgencyManager(actor, workspaceId, deps);
  const connection = await deps.store.read(workspaceId).catch((error) => { throw toImportError(error); });
  if (connection && connection.status !== "revoked") await deps.store.markStatus(connection.id, "revoked", null);
}

const TOKEN_SKEW_MS = 60_000;

/** Stored agency token, refreshed when near expiry or after a 401. A refused refresh marks the connection for reconnect. */
export function ghlTokenSource(connection: GhlConnectionWithSecrets, deps: GhlServiceDeps): GhlTokenSource {
  let current = connection.accessToken;
  let refreshToken = connection.refreshToken;
  let expiresAt = connection.tokenExpiresAt ? Date.parse(connection.tokenExpiresAt) : null;
  const refresh = async (): Promise<string> => {
    try {
      const tokens = await refreshGhlToken(refreshToken ?? "", deps.fetcher, deps.now());
      if (tokens.companyId !== connection.companyId) throw new GhlConnectError(GHL_MESSAGES.revoked, "token_refused");
      await deps.store.updateTokens(connection.id, tokens);
      current = tokens.accessToken;
      refreshToken = tokens.refreshToken ?? refreshToken;
      expiresAt = tokens.expiresAt ? Date.parse(tokens.expiresAt) : null;
      return current;
    } catch (error) {
      if (error instanceof GhlConnectError && error.code === "token_refused") {
        await deps.store.markStatus(connection.id, "needs_reauth", "HighLevel refused the token refresh.").catch(() => undefined);
        throw new GhlApiError(GHL_MESSAGES.revoked, "revoked", 401);
      }
      throw error instanceof GhlConnectError ? new GhlApiError(error.message, error.code === "not_configured" ? "not_configured" : "unavailable") : error;
    }
  };
  return {
    async accessToken() {
      if (!current || (expiresAt !== null && expiresAt - TOKEN_SKEW_MS <= deps.now())) return refresh();
      return current;
    },
    refresh,
  };
}

async function connectedSource(workspaceId: string, deps: GhlServiceDeps) {
  const connection = await deps.store.read(workspaceId);
  if (!connection || connection.status === "revoked") throw new GhlImportError("Connect HighLevel first to import its sub-accounts.", 409, "ghl_not_connected");
  if (connection.status === "needs_reauth") throw new GhlImportError(GHL_MESSAGES.revoked, 409, "ghl_revoked");
  const client = new GhlClient({ tokens: ghlTokenSource(connection, deps), fetcher: deps.fetcher, ...(deps.clock ? { clock: deps.clock } : {}) });
  return { connection, client, companyId: connection.companyId };
}

async function noteFailure(connection: GhlConnectionWithSecrets | undefined, error: unknown, deps: GhlServiceDeps) {
  if (!connection || !(error instanceof GhlApiError)) return;
  if (error.code === "revoked") await deps.store.markStatus(connection.id, "needs_reauth", "HighLevel no longer accepts this connection.").catch(() => undefined);
}

/**
 * Every sub-account of the agency as an Import clients row, for L2's preview.
 * Reading adds nothing; each confirmed row goes through the ordinary add.
 */
export async function readGhlImportRows(actor: WorkspaceActor, agencyWorkspaceId: string, deps: GhlServiceDeps = defaultGhlServiceDeps()): Promise<ClientImportRow[]> {
  await assertGhlAgencyManager(actor, agencyWorkspaceId, deps);
  let connection: GhlConnectionWithSecrets | undefined;
  try {
    const adapter = createGoHighLevelImportAdapter(async (workspaceId) => {
      const source = await connectedSource(workspaceId, deps);
      connection = source.connection;
      return source;
    });
    return await adapter.readRows({ agencyWorkspaceId });
  } catch (error) {
    await noteFailure(connection, error, deps);
    throw toImportError(error);
  }
}

export interface GhlWaitingClients {
  /** Sub-accounts in HighLevel that aren't yet clients from this source, oldest delivery first then by name. */
  waiting: Array<{ sourceRef: string; name: string | null }>;
  /** Install or create deliveries received since `since` (a hint of why the list changed). */
  deliveriesSince: number;
  checkedAt: string;
}

/**
 * Sub-accounts new since the agency last imported, for a later "new clients
 * waiting to import" notice. HighLevel's listing is the truth; deliveries only
 * say when to look. `knownSourceRefs` are the location ids the agency already
 * imported (L2's store owns them). Never adds anything.
 */
export function newGhlSubAccounts(
  locations: Array<{ id: string; name?: string | null }>,
  knownSourceRefs: Iterable<string>,
): GhlWaitingClients["waiting"] {
  const known = new Set(knownSourceRefs);
  return locations
    .filter((location) => !known.has(location.id))
    .map((location) => ({ sourceRef: location.id, name: location.name?.trim() || null }))
    .sort((a, b) => (a.name ?? a.sourceRef).localeCompare(b.name ?? b.sourceRef));
}

export async function reconcileGhlSubAccounts(
  actor: WorkspaceActor,
  agencyWorkspaceId: string,
  input: { knownSourceRefs: Iterable<string>; since: string | null },
  deps: GhlServiceDeps = defaultGhlServiceDeps(),
): Promise<GhlWaitingClients> {
  await assertGhlAgencyManager(actor, agencyWorkspaceId, deps);
  let connection: GhlConnectionWithSecrets | undefined;
  try {
    const source = await connectedSource(agencyWorkspaceId, deps);
    connection = source.connection;
    const [locations, events] = await Promise.all([
      listGhlSubAccounts(source.client, source.companyId),
      deps.store.eventsSince(source.companyId, input.since),
    ]);
    return {
      waiting: newGhlSubAccounts(locations, input.knownSourceRefs),
      deliveriesSince: events.filter((event) => event.kind === "location_installed" || event.kind === "location_created").length,
      checkedAt: new Date(deps.now()).toISOString(),
    };
  } catch (error) {
    await noteFailure(connection, error, deps);
    throw toImportError(error);
  }
}

export type GhlWebhookOutcome =
  | { status: 401; result: "signature_invalid" }
  | { status: 400; result: "unreadable" }
  | { status: 200; result: "recorded" | "duplicate" | "ignored" };

/**
 * Receive one HighLevel delivery. Verifies the signature over the raw body,
 * records it once (HighLevel retries up to 12 times on any non-2xx), and marks
 * the agency's connection revoked when the app is uninstalled agency-wide.
 * Never adds a client.
 */
export async function receiveGhlWebhook(
  rawBody: string,
  headers: Headers,
  deps: Pick<GhlServiceDeps, "store"> & { keys?: GhlWebhookKeys; appId?: string | null } = { store: supabaseGhlConnectionStore() },
): Promise<GhlWebhookOutcome> {
  const signature = verifyGhlWebhookSignature(rawBody, headers, deps.keys);
  if (!signature.ok) return { status: 401, result: "signature_invalid" };
  const parsed = parseGhlWebhook(rawBody);
  if (!parsed) return { status: 400, result: "unreadable" };
  const expectedApp = deps.appId === undefined ? process.env.HIGHLEVEL_APP_ID?.trim() || null : deps.appId;
  if (expectedApp && parsed.appId && parsed.appId !== expectedApp) return { status: 200, result: "ignored" };
  const { event } = parsed;
  if (event.kind === "ignored") return { status: 200, result: "ignored" };
  const companyId = "companyId" in event && event.companyId && GHL_ID.test(event.companyId) ? event.companyId : null;
  const locationId = "locationId" in event && GHL_ID.test(event.locationId) ? event.locationId : null;
  const fresh = await deps.store.recordEvent({ deliveryId: parsed.deliveryId, kind: event.kind, companyId, locationId });
  if (!fresh) return { status: 200, result: "duplicate" };
  if (event.kind === "agency_uninstalled" && companyId) {
    const connection = await deps.store.readByCompany(companyId);
    if (connection && connection.status !== "revoked") await deps.store.markStatus(connection.id, "revoked", "The HighLevel app was removed from this agency.");
  }
  return { status: 200, result: "recorded" };
}
