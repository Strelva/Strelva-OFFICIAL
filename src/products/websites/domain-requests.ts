import { createHash } from "node:crypto";
import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { isValidDomain, normalizeCustomDomain } from "@/lib/domains";
import { sendEmailWithReceipt, type SendEmailResult } from "@/platform/infra/email/send";
import { customerEmailEnabled, emailSendingEnabled } from "@/platform/infra/email/enabled";
import { getClientEmailOverride } from "@/platform/infra/email/client-override";
import { changeHostedDomain, readHostedDomains, readHostedDomainRecords } from "./rebuild-domains";
import { checkWebsiteHealth } from "./site-health";
import { websiteDocumentStore } from "./document-store";
import { websiteRebuildReleasedFor, websiteRebuildReleaseEnabledForWorkspace } from "./rebuild-release";

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

export interface WebsiteDomainRequestPorts {
  store: ReturnType<typeof createWebsiteDomainRequestStore>;
  change: typeof changeHostedDomain;
  read: typeof readHostedDomains;
  enabled(workspaceId: string): Promise<boolean>;
  checkRouting?(request: WebsiteDomainRequest): Promise<boolean>;
}
export function createWebsiteDomainRequestService(ports: WebsiteDomainRequestPorts) {
  async function routing(request: WebsiteDomainRequest, result: NonNullable<WebsiteDomainRequest["result"]>) {
    return ports.checkRouting && result.status === "verified"
      ? { ...result, routing: await ports.checkRouting(request) ? "verified" as const : "unverified" as const }
      : result;
  }
  async function apply(request: WebsiteDomainRequest) {
    if (!(await ports.enabled(request.workspaceId))) throw new WorkspaceConflictError("Website domain proposals are not enabled.");
    const authorize = async () => { await ports.store.authorize(request); };
    const current = await ports.store.authorize(request);
    if (!current.tenantId) throw new WorkspaceAccessError();
    const changed = await ports.change(current.tenantId, { domain: current.hostname, action: "attach" }, { authorizeWrite: authorize });
    const result = changed.domains.find(domain => domain.hostname === current.hostname);
    if (!result) throw new WorkspaceStoreError("The domain was submitted, but its status could not be read. Reopen the saved proposal.");
    // Accepted provider effects remain recorded even if ownership changes afterward.
    return ports.store.record(current, await routing(current, result));
  }
  async function approve(request: WebsiteDomainRequest, decisionId: string) {
    if (!(await ports.enabled(request.workspaceId))) throw new WorkspaceConflictError("Website domain proposals are not enabled.");
    return apply(await ports.store.approve(request, decisionId));
  }
  async function reconcile(request: WebsiteDomainRequest) {
    if (!request.decisionId || !request.tenantId || !(await ports.enabled(request.workspaceId))) return request;
    // A check cannot perform another attachment or move.
    const domains = await ports.read(request.tenantId);
    const result = domains.domains.find(domain => domain.hostname === request.hostname);
    return result ? ports.store.record(request, await routing(request, result)) : request;
  }
  return { approve, apply, reconcile };
}
export const websiteDomainRequestService = createWebsiteDomainRequestService({ store: websiteDomainRequestStore, change: changeHostedDomain, read: readHostedDomains,
  enabled: workspaceId => websiteRebuildReleaseEnabledForWorkspace(workspaceId),
  checkRouting: async request => (await checkWebsiteHealth({ workspaceId: request.workspaceId, workId: request.workId, tenantId: request.tenantId!, revision: request.publishedRevision, contentHash: request.publishedHash, url: `https://${request.hostname}/` })).status === "healthy" });

export async function prepareWebsiteDomainRequest(actor: WorkspaceActor, workId: string, raw: unknown) {
  const input = z.object({ workspaceId: z.string().uuid(), requestId: z.string().uuid(), domain: z.string().trim().min(1).max(253) }).strict().parse(raw);
  if (!(await websiteRebuildReleasedFor(actor, input.workspaceId))) throw new WorkspaceConflictError("Website rebuilds are not enabled.");
  await websiteDocumentStore.manage(actor, { workspaceId: input.workspaceId, workId });
  const tenant = await websiteDocumentStore.currentTenant!(actor, { workspaceId: input.workspaceId, workId });
  if (!tenant || tenant.deliveryModel !== "platform_template") throw new WorkspaceConflictError("Client-repository domains need Jacob's approval in their own hosting project.");
  const published = await websiteDocumentStore.published(tenant.tenantId);
  if (!published || published.workspaceId !== input.workspaceId || published.workId !== workId) throw new WorkspaceAccessError();
  const hostname = normalizeCustomDomain(input.domain);
  if (!hostname || !isValidDomain(hostname)) throw new WorkspaceConflictError("Enter a valid domain you control.");
  const records = await readHostedDomainRecords(hostname, fetch, { allowUnattached: true });
  if (records.map(record => `${record.type} ${record.name} → ${record.value}`).join("\n").length > 1000) throw new WorkspaceStoreError("The DNS records exceed the owner decision limit. No truncated proposal was saved.");
  if (!records.length) throw new WorkspaceStoreError("The provider has not returned DNS records. No proposal was saved.");
  const revisionHash = createHash("sha256").update(JSON.stringify([input.workspaceId, workId, published.revision, published.contentHash, hostname, records])).digest("hex");
  return websiteDomainRequestStore.prepare(actor, { id: input.requestId, workspaceId: input.workspaceId, workId, tenantId: tenant.tenantId,
    publishedRevision: published.revision, publishedHash: published.contentHash, hostname, records, revisionHash });
}

/** Called after polling: the receipt uses the same shared email transport.
 * Suppression is persisted, never reported as delivery. Provider idempotency
 * and the durable accepted marker protect a repeated cron from duplicate mail. */
export async function sendWebsiteDomainReceipt(request: WebsiteDomainRequest, recipient: string) {
  if (request.result?.status !== "verified" || request.result.routing !== "verified" || request.receiptEmail?.status === "accepted") return request;
  const email: SendEmailResult = await websiteDomainEmailAllowed(request.tenantId)
    ? await sendEmailWithReceipt({ audience: "client", tenantId: request.tenantId!, to: recipient, fromAddress: "health@updates.strelva.com",
      subject: `${request.hostname} is connected`, idempotencyKey: `website-domain-receipt:${request.id}`,
      options: { heading: "Your website domain is connected", paragraphs: [`Strelva confirmed ${request.hostname} is verified and routes to your published website.`], rows: [{ label: "Last check", value: request.result.checkedAt }], button: { label: "Open your website", url: `https://${request.hostname}` } } })
    : { status: "suppressed", reason: "website_domain_email_disabled" };
  return websiteDomainRequestStore.record(request, undefined, email);
}

/** Reconcile the approved requests belonging to businesses already in the
 * website-domain cron. Reads only; an unknown provider write is never retried
 * by this checker. Sends stay behind the separate domain-email opt-in. */
export async function reconcileWebsiteDomainRequests(workspaceIds?: string[]) {
  const { resolveOwnerRecipient } = await import("@/platform/business-record");
  if (!workspaceIds) {
    const { PostgresNeedsYouStore } = await import("@/platform/needs-you/repository");
    const [linked, published] = await Promise.all([PostgresNeedsYouStore.linkedTenants(null), websiteDocumentStore.listPublished()]);
    workspaceIds = [...linked.map(link => link.workspaceId), ...published.map(site => site.workspaceId)];
  }
  let checked = 0; let failed = 0;
  for (const workspaceId of new Set(workspaceIds)) {
    if (!(await websiteRebuildReleaseEnabledForWorkspace(workspaceId).catch(() => false))) continue;
    let requests: WebsiteDomainRequest[];
    try { requests = await websiteDomainRequestStore.list(workspaceId); } catch { failed += 1; continue; }
    for (const request of requests.filter(row => row.decisionId && row.receiptEmail?.status !== "accepted").slice(0, 25)) {
      try {
        const saved = await websiteDomainRequestService.reconcile(request);
        checked += 1;
        if (saved.result?.status === "verified" && saved.result.routing === "verified") {
          const recipient = await resolveOwnerRecipient(workspaceId);
          if (recipient?.email) await sendWebsiteDomainReceipt(saved, recipient.email);
        }
      } catch { failed += 1; }
    }
  }
  return { checked, failed };
}
