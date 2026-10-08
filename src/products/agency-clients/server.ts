/**
 * An agency adds a client business (agency 1.0 #259: AG-09, MK-1, SY-T7).
 *
 * One add creates the customer business with the agency as provider of
 * record and provider seat (never admin membership), staffs the acting
 * member, and seeds the business record from the agency's input and a small
 * scan of the client's site. Every seeded fact is the agency's and
 * unconfirmed; only the owner confirms. The agency is then offered the two
 * website entries (connect the existing site, or rebuild) and, when it names
 * the owner's address, an owner claim link.
 *
 * Nothing here sends anything. Client notifications are off during the silent
 * rollout, and whether an agency may email a client's owner is the open
 * decision R08 (#235): the claim is recorded `not_sent` / `gated` and its
 * link is returned once for the agency to deliver itself. The send seam is
 * `deliverOwnerClaim` below; the database already records
 * agency_effect_allowed(agency, 'email') on each claim for it.
 *
 * Operators keep /admin/onboard and tenant conversion. This is the agency
 * path. Off unless STRELVA_AGENCY_ADD_CLIENT_RELEASE=1 (on top of the
 * workspace release).
 */
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { normalizeRebuildUrl, WebsiteCrawlError } from "@/products/websites/server";
import {
  agencyClientAdditionSchema,
  agencyClientListItemSchema,
  clientWebsiteEntries,
  OWNER_CLAIM_LIFETIME_DAYS,
  OWNER_CLAIM_PATH,
  ownerClaimAcceptedSchema,
  ownerClaimPreviewSchema,
  ownerClaimSchema,
  type AddAgencyClientInput,
  type AddAgencyClientResult,
  type AgencyClientAddition,
  type AgencyClientListItem,
  type ClientSiteScan,
  type IssueOwnerClaimInput,
  type OwnerClaim,
  type OwnerClaimAccepted,
  type OwnerClaimPreview,
} from "./contracts";
import { seedFromSite, type SiteSeed } from "./seed";

export * from "./index";

export class AgencyClientError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = "AgencyClientError";
  }
}

type DbError = { message?: string; code?: string } | null;
export interface AgencyClientDeps {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError }>;
  seed(url: string): Promise<SiteSeed>;
  token(): string;
  now(): Date;
}

function defaultDeps(): AgencyClientDeps {
  const db = getSupabase();
  if (!db) throw new AgencyClientError("Adding clients is temporarily unavailable.", 503, "unavailable");
  const client = db as unknown as Pick<AgencyClientDeps, "rpc">;
  return {
    rpc: (name, args) => client.rpc(name, args),
    seed: (url) => seedFromSite(url),
    token: () => randomBytes(32).toString("base64url"),
    now: () => new Date(),
  };
}

/** Each database refusal, as the agency should read it. */
const FAILURES: Array<[string, number, string]> = [
  ["agency_client_access_denied", 403, "Only an owner or admin of this agency can add clients."],
  ["agency_client_daily_limit", 429, "Your agency has added the most clients allowed today. Try again tomorrow."],
  ["agency_client_waiting_limit", 429, "Your agency has many clients still waiting for their owner. Get some of them claimed before adding more."],
  ["agency_client_prospect_added", 409, "This prospect is already a client."],
  ["agency_client_prospect_not_found", 404, "That prospect isn't in your agency's list."],
  ["agency_client_idempotency_conflict", 409, "This request conflicts with one already saved. Reload and try again."],
  ["agency_client_owner_exists", 409, "This business already has an owner."],
  ["agency_client_claim_sponsor_invalid", 410, "The agency that sent this link no longer looks after this business. Ask them for a new one."],
  ["agency_client_claim_recipient_mismatch", 403, "This link was made for a different email address. Sign in with the address it was sent to."],
  ["agency_client_claim_identity_required", 401, "Sign in with a confirmed email to continue."],
  ["agency_client_claim_not_found", 404, "This link is missing or no longer works."],
  ["agency_client_claim_invalid", 400, "Check the owner's email address."],
  ["agency_client_invalid", 400, "Check the business name and website."],
  ["workspace_exit_future_work_blocked", 409, "This business has left Strelva."],
];

function refusal(code: string, status: number): AgencyClientError {
  return new AgencyClientError(FAILURES.find(([known]) => known === code)?.[2] ?? "This request couldn't be completed.", status, code);
}

function fail(error: DbError, fallback: string): never {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`;
  const match = FAILURES.find(([code]) => detail.includes(code));
  if (match) throw new AgencyClientError(match[2], match[1], match[0]);
  throw new AgencyClientError(fallback, 503, "unavailable");
}

async function call<T>(deps: AgencyClientDeps, name: string, args: Record<string, unknown>, schema: z.ZodType<T>, fallback: string): Promise<T> {
  const { data, error } = await deps.rpc(name, args);
  if (error) fail(error, fallback);
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new AgencyClientError(fallback, 503, "malformed");
  return parsed.data;
}

const actorArgs = (actor: WorkspaceActor) => ({ p_user_id: actor.userId, p_verified_email: actor.verifiedEmail.trim().toLowerCase() });
const prospectSchema = z.object({ id: z.string().uuid(), business: z.string(), url: z.string().nullable(), email: z.string() }).passthrough();

async function readProspect(deps: AgencyClientDeps, actor: WorkspaceActor, agencyWorkspaceId: string, prospectId: string) {
  // The prospects reader rechecks verified agency membership itself.
  const { data, error } = await deps.rpc("agency_prospect_list", { p_workspace_id: agencyWorkspaceId, p_user_id: actor.userId, p_email: actor.verifiedEmail });
  if (error) {
    if (`${error.message}`.includes("agency_prospect_access")) throw refusal("agency_client_access_denied", 403);
    throw new AgencyClientError("Your prospects couldn't be read. Try again.", 503, "unavailable");
  }
  const rows = z.array(prospectSchema).safeParse(data ?? []);
  const prospect = rows.success ? rows.data.find((row) => row.id === prospectId) : undefined;
  if (!prospect) throw refusal("agency_client_prospect_not_found", 404);
  return prospect;
}

function publicUrl(raw: string): string {
  try {
    return normalizeRebuildUrl(raw);
  } catch (error) {
    throw new AgencyClientError(error instanceof WebsiteCrawlError ? error.message : "Enter a public website address.", 400, "agency_client_invalid");
  }
}

const NOT_SCANNED: ClientSiteScan = { status: "not_requested", seeded: [], name: null, message: null };

/** Create the client business from a URL or a prospect, then (optionally) its owner claim link. */
export async function addAgencyClient(actor: WorkspaceActor, input: AddAgencyClientInput, deps: AgencyClientDeps = defaultDeps()): Promise<AddAgencyClientResult> {
  const prospect = input.prospectId ? await readProspect(deps, actor, input.agencyWorkspaceId, input.prospectId) : null;
  const rawUrl = input.url ?? prospect?.url ?? null;
  const url = rawUrl ? publicUrl(rawUrl) : null;
  const seed = url ? await deps.seed(url) : { scan: NOT_SCANNED, facts: {} };
  const name = (input.name ?? prospect?.business ?? seed.scan.name ?? "").trim().slice(0, 120);
  if (!name) throw new AgencyClientError("We couldn't find the business's name on its site. Enter it.", 400, "agency_client_name_required");
  // The digest covers what the agency asked for, not what the scan found, so
  // a retry with the same key replays even if the site changed meanwhile.
  const digest = createHash("sha256").update(JSON.stringify([input.agencyWorkspaceId, name, url, input.prospectId ?? null])).digest("hex");
  const client = await call(deps, "agency_add_client", {
    ...actorArgs(actor),
    p_agency_workspace_id: input.agencyWorkspaceId,
    p_input: { name, sourceUrl: url, prospectId: input.prospectId ?? null, facts: seed.facts },
    p_command_id: input.idempotencyKey,
    p_command_digest: digest,
  }, agencyClientAdditionSchema, "The client couldn't be added. Retry the same request before trying again.");
  const scan = client.replayed ? { ...seed.scan, seeded: [] } : seed.scan;
  let ownerClaim: OwnerClaim | null = null;
  let ownerClaimError: string | null = null;
  if (input.ownerEmail && !client.replayed) {
    // The client exists either way; a failed link is offered again on the result.
    try {
      ownerClaim = await issueAgencyClientOwnerClaim(actor, {
        action: "owner_link", agencyWorkspaceId: input.agencyWorkspaceId, customerWorkspaceId: client.customerWorkspaceId, ownerEmail: input.ownerEmail,
      }, deps);
    } catch (error) {
      ownerClaimError = error instanceof AgencyClientError ? error.message : "The owner link couldn't be created. Try again.";
    }
  }
  return { client, scan, ownerClaim, ownerClaimError, website: clientWebsiteEntries(client.customerWorkspaceId) };
}

/**
 * The send seam. Client notifications stay off during the silent rollout and
 * agency-to-owner email is decision R08 (#235), so this never sends: the
 * claim is already recorded not_sent / gated. When R08 is decided, send here
 * through src/platform/infra/email/send.ts (audience `client`), only when
 * `claim.delivery.agencyEmailVerified` (agency_effect_allowed) holds and the
 * client-email switch is on, and record the result on the claim.
 */
export function deliverOwnerClaim(claim: OwnerClaim): OwnerClaim["delivery"] {
  return claim.delivery;
}

/** Issue (or replace) the owner's claim link for a client this agency added. */
export async function issueAgencyClientOwnerClaim(actor: WorkspaceActor, input: IssueOwnerClaimInput, deps: AgencyClientDeps = defaultDeps()): Promise<OwnerClaim> {
  const token = deps.token();
  const expiresAt = new Date(deps.now().getTime() + OWNER_CLAIM_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
  const claim = await call(deps, "issue_agency_client_owner_claim", {
    ...actorArgs(actor),
    p_agency_workspace_id: input.agencyWorkspaceId,
    p_customer_workspace_id: input.customerWorkspaceId,
    p_recipient_email: input.ownerEmail,
    p_token_hash: createHash("sha256").update(token, "utf8").digest("hex"),
    p_expires_at: expiresAt.toISOString(),
  }, ownerClaimSchema, "The owner link couldn't be created. Try again.");
  const issued = { ...claim, claimPath: `${OWNER_CLAIM_PATH}${token}` };
  return { ...issued, delivery: deliverOwnerClaim(issued) };
}

export async function listAgencyClientAdditions(actor: WorkspaceActor, agencyWorkspaceId: string, deps: AgencyClientDeps = defaultDeps()): Promise<AgencyClientListItem[]> {
  return call(deps, "list_agency_client_additions", { ...actorArgs(actor), p_agency_workspace_id: agencyWorkspaceId },
    z.array(agencyClientListItemSchema), "Your agency's clients couldn't be loaded.");
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
function tokenHash(token: string): string {
  if (!TOKEN.test(token)) throw refusal("agency_client_claim_not_found", 404);
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** What the claim page shows before sign-in. The token is the only key. */
export async function readOwnerClaim(token: string, deps: AgencyClientDeps = defaultDeps()): Promise<OwnerClaimPreview> {
  return call(deps, "read_agency_client_owner_claim", { p_token_hash: tokenHash(token) }, ownerClaimPreviewSchema, "This link couldn't be checked. Try again.");
}

/** The signed-in owner takes the business. */
export async function acceptOwnerClaim(actor: WorkspaceActor, token: string, deps: AgencyClientDeps = defaultDeps()): Promise<OwnerClaimAccepted> {
  return call(deps, "accept_agency_client_owner_claim", {
    p_token_hash: tokenHash(token), p_actor_id: actor.userId, p_verified_email: actor.verifiedEmail.trim().toLowerCase(),
  }, ownerClaimAcceptedSchema, "The business couldn't be claimed. Try again.");
}

export type { AgencyClientAddition };

export interface SeatBusiness { id: string; name: string; role: "owner" | "admin" | "member" }

/**
 * A customer business the actor reaches through its agency's provider seat
 * and its own staff row, with no direct membership (20261009151000). The
 * workspace shell lists direct memberships only; pages an agency is sent to
 * from here (the website entries) use this to admit the seat holder. Null
 * when the actor has no such access.
 */
export async function providerSeatBusiness(actor: WorkspaceActor, workspaceId: string, deps: Pick<AgencyClientDeps, "rpc"> = defaultDeps()): Promise<SeatBusiness | null> {
  const { data, error } = await deps.rpc("read_version_actor", { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail.trim().toLowerCase() });
  if (error) return null;
  const parsed = z.object({ memberships: z.array(z.object({ businessId: z.string(), role: z.enum(["owner", "admin", "member"]), via: z.string().optional() }).passthrough()) }).safeParse(data);
  const seat = parsed.success ? parsed.data.memberships.find((membership) => membership.businessId === workspaceId && membership.via === "provider_seat") : undefined;
  if (!seat) return null;
  const client = getSupabase();
  const row = client ? await client.from("workspaces").select("name").eq("id", workspaceId).eq("kind", "customer").maybeSingle() : null;
  const name = row && !row.error && row.data ? row.data.name : null;
  return name ? { id: workspaceId, name, role: seat.role } : null;
}
