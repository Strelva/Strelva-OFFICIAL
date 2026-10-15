/**
 * Connected-site change persistence: service-role RPCs only
 * (supabase/migrations/20261027160100_keep_your_site_changes.sql). SQL decides
 * who may plan, say yes, mark done and check; nothing here grants authority.
 */
import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import {
  connectedSiteChangeReleaseRowSchema, connectedSiteChangeReviewSchema, connectedSiteChangeSchema, connectedSiteChangesViewSchema,
  type ConnectedSiteChange, type ConnectedSiteChangeReleaseRow, type ConnectedSiteChangeReview, type ConnectedSiteChangesView, type PlanInput,
} from "./change-model";
import { agencyClientSitesPageSchema, clientDetectionSchema, type AgencyClientSitesPage, type ClientDetection } from "./agency-sites-model";
import type { SitePlatform } from "./contracts";
import { ConnectedSiteInputError } from "./store";

export interface ConnectedSiteChangesRpc { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> }

/** "unchanged": the text was on the page before the edit, or there is no baseline to compare. A look, never a Release. */
export type ConnectedSiteCheckResult = "visible" | "not_visible" | "unreachable" | "unchanged";
export interface ConnectedSiteChangeOutcome { change: ConnectedSiteChange; release: { number: number } | null }

const uuid = z.string().uuid();
const identity = (actor: WorkspaceActor) => ({ p_user_id: uuid.parse(actor.userId), p_verified_email: z.string().email().parse(actor.verifiedEmail.trim().toLowerCase()) });
const outcomeSchema = z.object({ change: connectedSiteChangeSchema, release: z.object({ number: z.number().int().positive() }).nullable().optional().transform(value => value ?? null) });

export function connectedSiteChangeFailure(message: string): never {
  if (message.includes("workspace_access_denied")) throw new WorkspaceAccessError();
  if (message.includes("connected_site_not_found") || message.includes("connected_site_change_not_found")) throw new WorkspaceConflictError("This change is no longer here. Reload and try again.");
  if (message.includes("connected_site_not_verified")) throw new WorkspaceConflictError("Finish connecting the site before planning changes.");
  if (message.includes("connected_site_change_agency_required")) throw new WorkspaceAccessError("Only the agency serving this business plans and makes changes on its site.");
  if (message.includes("connected_site_change_not_accepted")) throw new WorkspaceConflictError("Accept this Request before planning it.");
  if (message.includes("connected_site_change_owner_required")) throw new WorkspaceAccessError("Only an owner of this business can say yes to a change.");
  if (message.includes("connected_site_change_out_of_order")) throw new WorkspaceConflictError("That step doesn't follow from where this change is. Reload it.");
  if (message.includes("connected_site_change_invalid") || message.includes("connected_site_invalid")) throw new ConnectedSiteInputError("Check the details. The page must be on this site.");
  if (message.includes("system_not_found")) throw new WorkspaceConflictError("The website System isn't ready yet. Open the site in Strelva, then try again.");
  if (message.includes("agency_client_pre_claim_prepare_only")) throw new WorkspaceConflictError("The owner hasn't claimed their workspace yet, so they can't say yes.");
  if (message.includes("workspace_exit_future_work_blocked")) throw new WorkspaceConflictError("Work in this business has stopped.");
  throw new WorkspaceStoreError("Site changes are unavailable.");
}

export interface ConnectedSiteChangesStore {
  list(actor: WorkspaceActor, workspaceId: string, systemId: string): Promise<ConnectedSiteChangesView>;
  plan(actor: WorkspaceActor, workspaceId: string, input: { siteId: string; changeId: string | null; requestId: string | null; title: string | null; plan: Record<string, unknown> }): Promise<ConnectedSiteChange>;
  decide(actor: WorkspaceActor, workspaceId: string, changeId: string, decision: "approved" | "declined"): Promise<ConnectedSiteChange>;
  markDone(actor: WorkspaceActor, workspaceId: string, changeId: string, note?: string): Promise<ConnectedSiteChange>;
  recordCheck(actor: WorkspaceActor, workspaceId: string, changeId: string, check: { result: ConnectedSiteCheckResult; pageHash: string | null; matched: string | null }): Promise<ConnectedSiteChangeOutcome>;
  releaseUnconfirmed(actor: WorkspaceActor, workspaceId: string, changeId: string, note?: string): Promise<ConnectedSiteChangeOutcome>;
  withdraw(actor: WorkspaceActor, workspaceId: string, changeId: string, note?: string): Promise<ConnectedSiteChange>;
  reviews(actor: WorkspaceActor, workspaceId: string): Promise<ConnectedSiteChangeReview[]>;
  forRequest(actor: WorkspaceActor, requestId: string): Promise<{ workspaceId: string; systemId: string } | null>;
  releases(actor: WorkspaceActor, workspaceId: string, sinceIso: string): Promise<ConnectedSiteChangeReleaseRow[]>;
  /** Keep your site, agency Client websites: what a client's live page says it is built with. */
  recordDetection(actor: WorkspaceActor, workspaceId: string, input: { siteUrl: string; siteHost: string; platform: SitePlatform; evidence: string[]; reachable: boolean }): Promise<ClientDetection>;
  agencyClientSites(actor: WorkspaceActor, agencyWorkspaceId: string, cursor?: { name: string; id: string } | null, limit?: number): Promise<AgencyClientSitesPage>;
}

/** The plan an agency saves, as SQL reads it (keys exactly as validated there). */
export type ConnectedSitePlanPayload = Pick<PlanInput, "pageUrl" | "expectText" | "removeText" | "ownerFacing" | "note"> & { editSteps: string[]; baseline?: "visible" | "not_visible" | "unreachable" };

export function createConnectedSiteChangesStore(db?: ConnectedSiteChangesRpc): ConnectedSiteChangesStore {
  async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const client = db ?? (getSupabase() as unknown as ConnectedSiteChangesRpc | null);
    if (!client) throw new WorkspaceStoreError("Site changes are unavailable.");
    const { data, error } = await client.rpc(name, args);
    if (error) connectedSiteChangeFailure(error.message);
    return data;
  }
  const change = (data: unknown) => connectedSiteChangeSchema.parse(data);
  const base = (actor: WorkspaceActor, workspaceId: string) => ({ p_workspace_id: uuid.parse(workspaceId), ...identity(actor) });
  return {
    async list(actor, workspaceId, systemId) {
      return connectedSiteChangesViewSchema.parse(await rpc("list_connected_site_changes", { ...base(actor, workspaceId), p_system_id: uuid.parse(systemId) }));
    },
    async plan(actor, workspaceId, input) {
      return change(await rpc("plan_connected_site_change", {
        ...base(actor, workspaceId), p_site_id: uuid.parse(input.siteId), p_change_id: input.changeId ? uuid.parse(input.changeId) : null,
        p_request_id: input.requestId ? uuid.parse(input.requestId) : null, p_title: input.title, p_plan: input.plan,
      }));
    },
    async decide(actor, workspaceId, changeId, decision) {
      return change(await rpc("decide_connected_site_change", { ...base(actor, workspaceId), p_change_id: uuid.parse(changeId), p_decision: decision }));
    },
    async markDone(actor, workspaceId, changeId, note) {
      return change(await rpc("mark_connected_site_change_done", { ...base(actor, workspaceId), p_change_id: uuid.parse(changeId), p_note: note ?? null }));
    },
    async recordCheck(actor, workspaceId, changeId, check) {
      return outcomeSchema.parse(await rpc("record_connected_site_change_check", {
        ...base(actor, workspaceId), p_change_id: uuid.parse(changeId), p_result: check.result, p_page_hash: check.pageHash, p_matched: check.matched,
      }));
    },
    async releaseUnconfirmed(actor, workspaceId, changeId, note) {
      return outcomeSchema.parse(await rpc("release_connected_site_change_unconfirmed", { ...base(actor, workspaceId), p_change_id: uuid.parse(changeId), p_note: note ?? null }));
    },
    async withdraw(actor, workspaceId, changeId, note) {
      return change(await rpc("withdraw_connected_site_change", { ...base(actor, workspaceId), p_change_id: uuid.parse(changeId), p_note: note ?? null }));
    },
    async reviews(actor, workspaceId) {
      return z.array(connectedSiteChangeReviewSchema).parse(await rpc("list_connected_site_change_reviews", base(actor, workspaceId)) ?? []);
    },
    async forRequest(actor, requestId) {
      const data = await rpc("read_connected_site_change_for_request", { ...identity(actor), p_request_id: uuid.parse(requestId) });
      return data ? z.object({ workspaceId: uuid, systemId: uuid }).parse(data) : null;
    },
    async releases(actor, workspaceId, sinceIso) {
      return z.array(connectedSiteChangeReleaseRowSchema).parse(await rpc("read_connected_site_change_releases", { ...base(actor, workspaceId), p_since: sinceIso }) ?? []);
    },
    async recordDetection(actor, workspaceId, input) {
      return clientDetectionSchema.parse(await rpc("record_connected_site_detection", {
        ...base(actor, workspaceId), p_site_url: input.siteUrl, p_site_host: input.siteHost, p_platform: input.platform,
        p_evidence: input.evidence.slice(0, 5).map(item => item.slice(0, 120)), p_reachable: input.reachable,
      }));
    },
    async agencyClientSites(actor, agencyWorkspaceId, cursor, limit = 100) {
      return agencyClientSitesPageSchema.parse(await rpc("read_agency_client_sites", {
        p_agency_workspace_id: uuid.parse(agencyWorkspaceId), ...identity(actor),
        p_after_name: cursor?.name ?? null, p_after_id: cursor ? uuid.parse(cursor.id) : null, p_limit: limit,
      }));
    },
  };
}

let override: ConnectedSiteChangesStore | null = null;
/** Tests replace the store; production reads Supabase. */
export function setConnectedSiteChangesStoreForTests(store: ConnectedSiteChangesStore | null): void { override = store; }
export function connectedSiteChangesStore(): ConnectedSiteChangesStore { return override ?? createConnectedSiteChangesStore(); }
