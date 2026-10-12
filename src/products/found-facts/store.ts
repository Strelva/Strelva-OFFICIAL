import { createHash } from "node:crypto";
import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { BusinessRecordConflictError } from "@/platform/business-record/repository";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import {
  foundFactDecisionsSchema, foundFactListSchema, foundFactsDecidedSchema,
  type FoundFact, type FoundFactDecision, type FoundFactInput, type FoundFactsDecided,
} from "./contracts";

/**
 * The owner's paths over the one Found-fact store (20261024300000). SQL owns
 * every authority check: members read, only the business owner stages their
 * own reads and decides. The agency's add stages through agency-clients.
 */
export type FoundFactDb = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };
let override: FoundFactDb | null | undefined;
export function setFoundFactDb(db: FoundFactDb | null | undefined) { override = db; }
function db(): FoundFactDb {
  const client = override !== undefined ? override : getSupabase() as unknown as FoundFactDb | null;
  if (!client) throw new WorkspaceStoreError("Found details are unavailable right now. Nothing changed.");
  return client;
}
const who = (actor: WorkspaceActor) => ({ p_user_id: actor.userId, p_verified_email: actor.verifiedEmail.trim().toLowerCase() });

export class FoundFactInputError extends Error {
  constructor(message: string) { super(message); this.name = "FoundFactInputError"; }
}

async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await db().rpc(name, args);
  if (error) {
    const message = error.message ?? "";
    if (/found_fact_denied/.test(message)) throw new WorkspaceAccessError("Only the business owner decides what was found.");
    if (/found_fact_listing_not_connected/.test(message)) throw new WorkspaceConflictError("That Google listing isn't connected to this business.");
    if (/found_fact_not_open/.test(message)) throw new WorkspaceConflictError("That was already decided. Refresh to see what's still waiting.");
    if (/found_fact_no_record_fact/.test(message)) throw new FoundFactInputError("Categories stay for reference. Your business details have no place for them yet.");
    if (/found_fact_invalid/.test(message)) throw new FoundFactInputError("That detail isn't in a form your business record accepts.");
    if (/business_record_revision_conflict/.test(message)) throw new BusinessRecordConflictError("business_record_revision_conflict", "Your business details changed since this was shown. Refresh and try again.");
    if (/workspace_exit_future_work_blocked/.test(message)) throw new WorkspaceConflictError("This business has left Strelva.");
    throw new WorkspaceStoreError("Found details couldn't be saved. Nothing changed.");
  }
  return data;
}

export async function readBusinessFoundFacts(actor: WorkspaceActor, workspaceId: string): Promise<FoundFact[]> {
  return foundFactListSchema.parse(await call("read_business_found_facts", { ...who(actor), p_workspace_id: workspaceId }));
}

/** The owner's own website read, kept beside the record until they decide. */
export async function stageOwnerWebsiteFoundFacts(actor: WorkspaceActor, workspaceId: string, facts: FoundFactInput[]): Promise<{ staged: number; found: FoundFact[] }> {
  return z.object({ staged: z.number().int().min(0), found: foundFactListSchema }).strict().parse(await call("stage_owner_found_facts", {
    ...who(actor), p_workspace_id: workspaceId, p_source_kind: "website_crawl", p_source_ref: null, p_found: facts,
  }));
}

/** The owner's connected Google listing, read once. `sourceRef` is `accounts/X/locations/Y`. */
export async function stageOwnerGoogleFoundFacts(actor: WorkspaceActor, workspaceId: string, sourceRef: string, facts: Array<{ key: string; value: unknown }>): Promise<{ staged: number; found: FoundFact[] }> {
  return z.object({ staged: z.number().int().min(0), found: foundFactListSchema }).strict().parse(await call("stage_owner_found_facts", {
    ...who(actor), p_workspace_id: workspaceId, p_source_kind: "google_listing", p_source_ref: sourceRef,
    p_found: facts.map(fact => ({ entity: "fact", key: fact.key, value: fact.value })),
  }));
}

/**
 * The owner decides, in one transaction: confirmed and changed facts are
 * written to the record as the owner's own verified facts, against the
 * revision the owner saw when `expectedRevision` is given.
 */
export async function decideBusinessFoundFacts(actor: WorkspaceActor, workspaceId: string, input: { decisions: FoundFactDecision[]; expectedRevision: number | null; commandId: string }): Promise<FoundFactsDecided> {
  const decisions = foundFactDecisionsSchema.parse(input.decisions);
  const commandId = z.string().uuid().parse(input.commandId);
  const digest = createHash("sha256").update(JSON.stringify({ workspaceId, decisions, expectedRevision: input.expectedRevision })).digest("hex");
  return foundFactsDecidedSchema.parse(await call("decide_business_found_facts", {
    ...who(actor), p_workspace_id: workspaceId, p_expected_revision: input.expectedRevision, p_decisions: decisions,
    p_command_id: commandId, p_command_digest: digest,
  }));
}
