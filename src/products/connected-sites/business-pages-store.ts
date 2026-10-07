/**
 * Business page persistence: service-role RPCs only
 * (supabase/migrations/20261012110000_business_pages.sql). SQL rechecks the
 * actor on every workspace call and serves only confirmed facts.
 */
import { z } from "zod";
import { businessRecordSchema, type BusinessRecord } from "@/platform/business-record/contracts";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { ConnectedSiteInputError, type ConnectedSitesRpc } from "./store";

export interface BusinessPageSettings { handle: string; published: boolean; publishedAt: string | null; updatedAt: string }
export interface ConfirmedFactsRow {
  revision: number;
  policyFacts?: BusinessRecord["facts"];
  facts: Record<string, unknown>;
  services: Array<{ name: string; description: string | null; priceText: string | null }>;
  confirmedAt: string | null;
}

export interface BusinessPagesStore {
  read(actor: WorkspaceActor, workspaceId: string): Promise<BusinessPageSettings | null>;
  set(actor: WorkspaceActor, workspaceId: string, input: { handle: string; published: boolean }): Promise<BusinessPageSettings>;
  confirmedFacts(actor: WorkspaceActor, workspaceId: string): Promise<ConfirmedFactsRow>;
  /** Public: a published page by handle, or null. */
  published(handle: string): Promise<(ConfirmedFactsRow & { workspaceId: string; handle: string }) | null>;
}

const uuid = z.string().uuid();
const identity = (actor: WorkspaceActor) => ({ p_user_id: uuid.parse(actor.userId), p_verified_email: z.string().email().parse(actor.verifiedEmail.trim().toLowerCase()) });
const settingsSchema = z.object({ handle: z.string(), published: z.boolean(), publishedAt: z.string().nullable(), updatedAt: z.string() });
const factsSchema = z.object({
  revision: z.number(),
  policyFacts: businessRecordSchema.shape.facts.optional(),
  facts: z.record(z.string(), z.unknown()),
  services: z.array(z.object({ name: z.string(), description: z.string().nullable(), priceText: z.string().nullable() })),
  confirmedAt: z.string().nullable(),
});
const publishedSchema = factsSchema.extend({ workspaceId: z.string().uuid(), handle: z.string() });

export function createBusinessPagesStore(db?: ConnectedSitesRpc): BusinessPagesStore {
  async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const client = db ?? (getSupabase() as unknown as ConnectedSitesRpc | null);
    if (!client) throw new WorkspaceStoreError("Business pages are unavailable.");
    const { data, error } = await client.rpc(name, args);
    if (error) {
      const message = error.message;
      if (message.includes("workspace_access_denied")) throw new WorkspaceAccessError();
      if (message.includes("business_page_handle_taken")) throw new WorkspaceConflictError("Another business already uses that address. Try a different one.");
      if (message.includes("business_page_invalid")) throw new ConnectedSiteInputError("Use 3 to 48 lowercase letters, numbers and single hyphens.");
      if (message.includes("workspace_exit_future_work_blocked")) throw new WorkspaceConflictError("Work in this business has stopped.");
      throw new WorkspaceStoreError("The business page could not be read.");
    }
    return data;
  }
  return {
    async read(actor, workspaceId) {
      const data = await rpc("read_business_page", { p_workspace_id: uuid.parse(workspaceId), ...identity(actor) });
      return data ? settingsSchema.parse(data) : null;
    },
    async set(actor, workspaceId, input) {
      return settingsSchema.parse(await rpc("set_business_page", { p_workspace_id: uuid.parse(workspaceId), ...identity(actor), p_handle: input.handle, p_published: input.published }));
    },
    async confirmedFacts(actor, workspaceId) {
      return factsSchema.parse(await rpc("read_business_public_facts", { p_workspace_id: uuid.parse(workspaceId), ...identity(actor) }));
    },
    async published(handle) {
      const data = await rpc("read_published_business_page", { p_handle: handle });
      return data ? publishedSchema.parse(data) : null;
    },
  };
}

let override: BusinessPagesStore | null = null;
/** Tests replace the store; production reads Supabase. */
export function setBusinessPagesStoreForTests(store: BusinessPagesStore | null): void { override = store; }
export function businessPagesStore(): BusinessPagesStore { return override ?? createBusinessPagesStore(); }
