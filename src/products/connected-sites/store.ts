/**
 * Connected-site persistence: service-role RPCs only
 * (supabase/migrations/20261008151000_connected_sites.sql). Every table is
 * revoked; SQL rechecks the actor on each workspace call, and the public
 * calls recheck the key, the proven host and the Origin.
 */
import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { connectedSiteSchema, resolvedConnectedSiteSchema, type ConnectedInquiry, type ConnectedSite, type ResolvedConnectedSite } from "./contracts";

export interface ConnectedSitesRpc { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> }

/** A public write the site may not make (unknown key, unproven host, wrong Origin). */
export class ConnectedSiteRefusedError extends Error {
  constructor(readonly reason: "unknown" | "not_verified" | "origin_denied") { super(`connected_site_${reason}`); this.name = "ConnectedSiteRefusedError"; }
}
export class ConnectedSiteInputError extends Error {
  constructor(message = "The request is invalid.") { super(message); this.name = "ConnectedSiteInputError"; }
}

export interface NewConnectedSite { publicKey: string; verificationToken: string; label: string; siteUrl: string; siteHost: string; allowedOrigins: string[]; platform: string }
export interface StoredEvent { kind: string; occurredAt: string; sessionId: string | null; pagePath: string | null; referrerHost: string | null; target: string | null; dedupeKey: string }
export interface StoredLead { leadId: string; submissionHash: string; name: string; email?: string; message?: string; source: string; fields: Record<string, string>; capturedAt: string }

export interface ConnectedSitesStore {
  create(actor: WorkspaceActor, workspaceId: string, input: NewConnectedSite): Promise<ConnectedSite>;
  list(actor: WorkspaceActor, workspaceId: string): Promise<ConnectedSite[]>;
  update(actor: WorkspaceActor, workspaceId: string, siteId: string, patch: { label?: string; platform?: string; captureForms?: boolean; injectSchema?: boolean }): Promise<ConnectedSite>;
  revoke(actor: WorkspaceActor, workspaceId: string, siteId: string): Promise<ConnectedSite>;
  confirmVerification(actor: WorkspaceActor, workspaceId: string, siteId: string, observed: string[]): Promise<ConnectedSite>;
  inquiries(actor: WorkspaceActor, workspaceId: string, limit: number): Promise<ConnectedInquiry[]>;
  activity(actor: WorkspaceActor, workspaceId: string, days: number): Promise<Record<string, Record<string, number>>>;
  resolve(publicKey: string): Promise<ResolvedConnectedSite | null>;
  context(publicKey: string): Promise<{ revision: number; facts: Record<string, unknown>; services: Array<{ name: string; description: string | null; priceText: string | null }>; site: { captureForms: boolean; injectSchema: boolean } } | null>;
  recordEvents(publicKey: string, origin: string | null, events: StoredEvent[]): Promise<number>;
  recordInquiry(publicKey: string, origin: string | null, lead: StoredLead): Promise<{ status: "recorded" | "exists" | "duplicate"; id: string; workspaceId: string }>;
  recordSpam(publicKey: string, origin: string | null, input: { recordId: string; payload: Record<string, unknown>; payloadHash: string; capturedAt: string }): Promise<{ status: "recorded" | "exists" }>;
  purge(limit: number): Promise<{ events: number; spam: number }>;
}

const uuid = z.string().uuid();
const identity = (actor: WorkspaceActor) => ({ p_user_id: uuid.parse(actor.userId), p_verified_email: z.string().email().parse(actor.verifiedEmail.trim().toLowerCase()) });
const inquirySchema = z.object({ id: z.string(), siteId: z.string(), siteHost: z.string(), leadId: z.string(), name: z.string(), email: z.string().nullable(), message: z.string().nullable(), source: z.string().nullable(), capturedAt: z.string() });

export function createConnectedSitesStore(db?: ConnectedSitesRpc): ConnectedSitesStore {
  async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const client = db ?? (getSupabase() as unknown as ConnectedSitesRpc | null);
    if (!client) throw new WorkspaceStoreError("Connected sites are unavailable.");
    const { data, error } = await client.rpc(name, args);
    if (error) {
      const message = error.message;
      if (message.includes("workspace_access_denied")) throw new WorkspaceAccessError();
      if (message.includes("connected_site_unknown")) throw new ConnectedSiteRefusedError("unknown");
      if (message.includes("connected_site_not_verified")) throw new ConnectedSiteRefusedError("not_verified");
      if (message.includes("connected_site_origin_denied")) throw new ConnectedSiteRefusedError("origin_denied");
      if (message.includes("connected_site_invalid")) throw new ConnectedSiteInputError();
      if (message.includes("connected_site_not_found")) throw new WorkspaceConflictError("This connected site is no longer active here. Reload and try again.");
      if (message.includes("connected_site_proof_missing")) throw new WorkspaceConflictError("We couldn't find your verification tag or Strelva script on the live page yet. Add it, publish the site, then check again.");
      if (message.includes("connected_site_host_claimed")) throw new WorkspaceConflictError("Another business has already proven control of this address. Contact Strelva if this is your site.");
      if (message.includes("workspace_exit_future_work_blocked")) throw new WorkspaceConflictError("Work in this business has stopped.");
      if (message.includes("duplicate key")) throw new WorkspaceConflictError("That site is already connected.");
      throw new WorkspaceStoreError("The connected site could not be confirmed.");
    }
    return data;
  }
  const site = (data: unknown) => connectedSiteSchema.parse(data) as ConnectedSite;
  return {
    async create(actor, workspaceId, input) { return site(await rpc("create_connected_site", { p_workspace_id: uuid.parse(workspaceId), ...identity(actor), p_input: input })); },
    async list(actor, workspaceId) { return z.array(z.unknown()).parse(await rpc("list_connected_sites", { p_workspace_id: uuid.parse(workspaceId), ...identity(actor) })).map(site); },
    async update(actor, workspaceId, siteId, patch) { return site(await rpc("update_connected_site", { p_workspace_id: uuid.parse(workspaceId), ...identity(actor), p_site_id: uuid.parse(siteId), p_patch: patch })); },
    async revoke(actor, workspaceId, siteId) { return site(await rpc("revoke_connected_site", { p_workspace_id: uuid.parse(workspaceId), ...identity(actor), p_site_id: uuid.parse(siteId) })); },
    async confirmVerification(actor, workspaceId, siteId, observed) { return site(await rpc("confirm_connected_site_verification", { p_workspace_id: uuid.parse(workspaceId), ...identity(actor), p_site_id: uuid.parse(siteId), p_observed: observed.slice(0, 20) })); },
    async inquiries(actor, workspaceId, limit) { return z.array(inquirySchema).parse(await rpc("read_connected_site_inquiries", { p_workspace_id: uuid.parse(workspaceId), ...identity(actor), p_limit: limit })); },
    async activity(actor, workspaceId, days) { return z.record(z.string(), z.record(z.string(), z.number())).parse(await rpc("read_connected_site_activity", { p_workspace_id: uuid.parse(workspaceId), ...identity(actor), p_days: days }) ?? {}); },
    async resolve(publicKey) { const data = await rpc("resolve_connected_site", { p_public_key: publicKey }); return data ? resolvedConnectedSiteSchema.parse(data) : null; },
    async context(publicKey) {
      const data = await rpc("read_connected_site_context", { p_public_key: publicKey });
      if (!data) return null;
      return z.object({
        revision: z.number(), facts: z.record(z.string(), z.unknown()),
        services: z.array(z.object({ name: z.string(), description: z.string().nullable(), priceText: z.string().nullable() })),
        site: z.object({ captureForms: z.boolean(), injectSchema: z.boolean() }),
      }).parse(data);
    },
    async recordEvents(publicKey, origin, events) { return z.number().int().parse(await rpc("record_connected_site_events", { p_public_key: publicKey, p_origin: origin, p_events: events })); },
    async recordInquiry(publicKey, origin, lead) {
      return z.object({ status: z.enum(["recorded", "exists", "duplicate"]), id: z.string(), workspaceId: z.string() })
        .parse(await rpc("record_connected_site_inquiry", { p_public_key: publicKey, p_origin: origin, p_lead: lead }));
    },
    async recordSpam(publicKey, origin, input) {
      return z.object({ status: z.enum(["recorded", "exists"]) }).parse(await rpc("record_connected_site_spam", { p_public_key: publicKey, p_origin: origin, p_record_id: input.recordId, p_payload: input.payload, p_payload_hash: input.payloadHash, p_captured_at: input.capturedAt }));
    },
    async purge(limit) { return z.object({ events: z.number(), spam: z.number() }).parse(await rpc("purge_connected_site_records", { p_limit: limit })); },
  };
}

let override: ConnectedSitesStore | null = null;
/** Tests replace the store; production reads Supabase. */
export function setConnectedSitesStoreForTests(store: ConnectedSitesStore | null): void { override = store; }
export function connectedSitesStore(): ConnectedSitesStore { return override ?? createConnectedSitesStore(); }
