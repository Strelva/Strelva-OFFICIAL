import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import type { SendEmailResult } from "@/platform/infra/email/send";
import { customerEmailEnabled, emailSendingEnabled } from "@/platform/infra/email/enabled";
import { getClientEmailOverride } from "@/platform/infra/email/client-override";

const recordSchema = z.object({ type: z.string().min(1).max(40), name: z.string().min(1).max(253), value: z.string().min(1).max(1000) }).strict();
const domainResultSchema = z.object({ hostname: z.string(), status: z.string(), checkedAt: z.string(), records: z.array(recordSchema), error: z.string().optional(), routing: z.enum(["verified", "unverified"]).optional() });
export const websiteDomainRequestSchema = z.object({
  id: z.string().uuid(), workspaceId: z.string().uuid(), workId: z.string().uuid(), tenantId: z.string().nullable(),
  publishedRevision: z.number().int().positive(), publishedHash: z.string().regex(/^[0-9a-f]{64}$/),
  hostname: z.string(), records: z.array(recordSchema).min(1).max(20), revisionHash: z.string().regex(/^[0-9a-f]{64}$/),
  createdAt: z.string(), expiresAt: z.string(), current: z.boolean(), decisionId: z.string().uuid().nullable(), result: domainResultSchema.nullable(),
  receiptEmail: z.object({ status: z.enum(["accepted", "suppressed"]), reason: z.string().optional(), providerMessageId: z.string().optional(), acceptedAt: z.string().optional() }).nullable(),
});
export type WebsiteDomainRequest = z.infer<typeof websiteDomainRequestSchema>;
type Rpc = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> };
export function createWebsiteDomainRequestStore(client?: Rpc) {
  async function rpc(name: string, args: Record<string, unknown>) {
    const db = client ?? getSupabase() as unknown as Rpc | null;
    if (!db) throw new WorkspaceStoreError("Domain proposals are unavailable.");
    const result = await db.rpc(name, args);
    if (result.error) {
      if (result.error.message.includes("workspace_access_denied")) throw new WorkspaceAccessError();
      if (/website_domain_(request_conflict|owner_approval_required)/.test(result.error.message)) throw new WorkspaceConflictError("This domain proposal changed or its owner approval no longer holds. Prepare it again.");
      throw new WorkspaceStoreError("The domain proposal could not be confirmed.");
    }
    return result.data;
  }
  const key = (workspaceId: string, id: string) => ({ p_workspace_id: z.string().uuid().parse(workspaceId), p_id: z.string().uuid().parse(id) });
  return {
    async list(workspaceId: string) { return z.array(websiteDomainRequestSchema).parse(await rpc("list_website_domain_requests", { p_workspace_id: z.string().uuid().parse(workspaceId) })); },
    async prepare(actor: WorkspaceActor, input: Omit<WebsiteDomainRequest, "createdAt" | "expiresAt" | "current" | "decisionId" | "result" | "receiptEmail">) {
      return websiteDomainRequestSchema.parse(await rpc("prepare_website_domain_request", { ...key(input.workspaceId, input.id), p_work_id: input.workId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
        p_tenant_id: input.tenantId, p_published_revision: input.publishedRevision, p_published_hash: input.publishedHash, p_hostname: input.hostname, p_records: input.records, p_revision_hash: input.revisionHash }));
    },
    async approve(request: WebsiteDomainRequest, decisionId: string) { return websiteDomainRequestSchema.parse(await rpc("approve_website_domain_request", { ...key(request.workspaceId, request.id), p_decision_id: z.string().uuid().parse(decisionId), p_revision_hash: request.revisionHash })); },
    async authorize(request: WebsiteDomainRequest) { return websiteDomainRequestSchema.parse(await rpc("authorize_website_domain_request", key(request.workspaceId, request.id))); },
    async record(request: WebsiteDomainRequest, result?: WebsiteDomainRequest["result"], email?: SendEmailResult) {
      return websiteDomainRequestSchema.parse(await rpc("record_website_domain_request", { ...key(request.workspaceId, request.id), p_result: result ?? null, p_receipt_email: email ?? null }));
    },
  };
}
export const websiteDomainRequestStore = createWebsiteDomainRequestStore();

/** New domain mail has its own opt-in and all three existing email gates.
 * A tenant override never bypasses the global switches for this new stream. */
export async function websiteDomainEmailAllowed(tenantId?: string | null): Promise<boolean> {
  return process.env.STRELVA_WEBSITE_DOMAIN_EMAIL_ENABLED === "1" && emailSendingEnabled() && customerEmailEnabled()
    && Boolean(tenantId) && await getClientEmailOverride(tenantId!) !== "off";
}

