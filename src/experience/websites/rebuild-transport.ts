import { z } from "zod";
import { websiteCapabilitySelectionSchema } from "@/products/websites/contracts";
import { websiteRebuildSchema } from "@/products/websites/client";

const factSchema = z.object({ text: z.string(), kind: z.string(), highRisk: z.boolean(), origin: z.string(), sources: z.array(z.object({ sourceId: z.string(), quote: z.string() })), verification: z.object({ supported: z.boolean(), confidence: z.number() }).optional() });
const auditCheckSchema = z.object({ name: z.string(), status: z.string(), score: z.number(), message: z.string() });
const auditSnapshotSchema = z.object({ categories: z.array(z.object({ name: z.string(), slug: z.string(), score: z.number(), checks: z.array(auditCheckSchema) })) });
export const rebuildAuditSchema = z.object({ scope: z.literal("html"), before: auditSnapshotSchema, after: auditSnapshotSchema, checkedAt: z.string(), unavailable: z.array(z.string()) });
export const rebuildViewSchema = z.object({
  workId: z.string(), workspaceId: z.string(), tenantId: z.string().nullable().default(null), revision: z.number(), title: z.string(),
  status: z.enum(["building", "review", "approved", "published", "failed"]),
  stages: z.array(z.object({ stage: z.string(), status: z.enum(["pending", "running", "completed", "failed"]), message: z.string().optional() })),
  candidate: z.object({ revision: z.number(), contentHash: z.string(), previewHref: z.string(), pageCount: z.number(), hasForms: z.boolean().default(false), facts: z.record(z.string(), factSchema), unmappedPages: z.array(z.string()).default([]) }).nullable(),
  capabilitySelection: websiteCapabilitySelectionSchema.nullable().default(null),
  approved: z.boolean(), publishedUrl: z.string().nullable(), readBack: z.enum(["verified", "failed", "pending"]).nullable(),
  domain: z.object({ hostname: z.string(), status: z.string(), checkedAt: z.string().nullable(), error: z.string().optional(), records: z.array(z.object({ type: z.string(), name: z.string(), value: z.string() })) }).nullable(),
  error: z.string().nullable(),
  audit: rebuildAuditSchema.nullable().default(null),
  documentRevisions: z.array(z.object({ revision: z.number(), contentHash: z.string(), createdAt: z.string(), published: z.boolean() })).default([]),
  history: z.array(z.object({ revision: z.number(), kind: z.string(), at: z.string() })).default([]),
});
export type RebuildView = z.infer<typeof rebuildViewSchema>;
export interface RebuildTransport {
  read(workspaceId: string, workId: string, signal?: AbortSignal): Promise<RebuildView>;
  start(input: { workspaceId: string; requestId: string; url?: string; description?: string; businessName?: string }): Promise<RebuildView>;
  mutate(record: RebuildView, action: "confirm" | "edit" | "remove" | "approve" | "launch" | "retry" | "domain" | "undo", extra?: { factId?: string; text?: string; domain?: string; targetRevision?: number }): Promise<RebuildView>;
}
export class RebuildTransportError extends Error { constructor(message: string, readonly status: number) { super(message); } }
async function request(path: string, options?: RequestInit): Promise<RebuildView> {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...options });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new RebuildTransportError(typeof body?.error === "string" ? body.error : "This website could not be opened. Try again.", response.status);
  return parseRebuildView(body);
}
const rebuildEnvelopeSchema = z.object({ workId: z.string(), workspaceId: z.string(), rebuild: websiteRebuildSchema });
export function parseRebuildView(value: unknown): RebuildView {
  const record = rebuildEnvelopeSchema.parse(value);
  const item = record.rebuild;
  return rebuildViewSchema.parse({ workId: record.workId, workspaceId: record.workspaceId, tenantId: item.tenantId, revision: item.revision, title: item.title, status: item.status === "review_ready" ? "review" : item.status, stages: Array.from(new Map(item.stages.map(stage => [stage.stage, stage])).values()), candidate: item.candidate ? { revision: item.candidate.revision, contentHash: item.candidate.contentHash, previewHref: item.candidate.previewHref, pageCount: item.candidate.document.pages.length, hasForms: Boolean(item.candidate.document.capabilities?.inquiry || item.candidate.document.capabilities?.booking), facts: item.candidate.document.facts, unmappedPages: item.pageMapping.filter(page => !page.carriedOver).map(page => page.sourceUrl) } : null, capabilitySelection: "publishedCapabilitySelection" in item ? item.publishedCapabilitySelection : null, approved: Boolean(item.candidate && item.approvedCandidateRevision === item.candidate.revision), publishedUrl: item.launch.receipt?.status === "published" ? item.launch.receipt.providerUrl : null, readBack: item.launch.readBack?.status ?? null, domain: null, error: item.lastError, audit: "audit" in item ? item.audit : null, history: item.history });
}
async function withDomain(record: RebuildView): Promise<RebuildView> {
  if (!record.candidate) return record;
  const read = async (route: string) => {
    const response = await fetch(`/api/websites/${encodeURIComponent(record.workId)}/${route}?${new URLSearchParams({ workspaceId: record.workspaceId })}`, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return null;
    return response.json();
  };
  const [domain, history] = await Promise.all([record.publishedUrl ? read("domain").catch(() => null) : null, read("history").catch(() => null)]);
  return { ...record, domain: domain ? rebuildViewSchema.shape.domain.parse(domain.domain ?? null) : record.domain, documentRevisions: history ? rebuildViewSchema.shape.documentRevisions.parse(history.revisions) : record.documentRevisions };
}
export const serverRebuildTransport: RebuildTransport = {
  async read(workspaceId, workId, signal) { return withDomain(await request(`/api/websites/${encodeURIComponent(workId)}/rebuild?${new URLSearchParams({ workspaceId })}`, { signal })); },
  start(input) { return request("/api/websites/rebuild", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }); },
  async mutate(record, action, extra) {
    const facts = action === "confirm" || action === "edit" || action === "remove";
    const path = facts ? `facts/${encodeURIComponent(extra?.factId ?? "")}` : action === "retry" ? "rebuild" : action;
    const identity = { expectedRevision: record.revision, candidateRevision: record.candidate?.revision, candidateContentHash: record.candidate?.contentHash };
    const body = facts ? { ...identity, action, ...(action === "edit" ? { text: extra?.text } : {}) }
      : action === "domain" ? { expectedRevision: record.revision, domain: extra?.domain, action: record.domain ? "refresh" : "attach" }
      : action === "retry" ? { expectedRevision: record.revision } : action === "undo" ? { ...identity, targetRevision: extra?.targetRevision } : identity;
    if (action === "domain") {
      const response = await fetch(`/api/websites/${encodeURIComponent(record.workId)}/domain`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const value = await response.json().catch(() => null);
      if (!response.ok) throw new RebuildTransportError(value?.error ?? "The domain could not be checked.", response.status);
      return { ...record, domain: rebuildViewSchema.shape.domain.parse(value.domain ?? null) };
    }
    return withDomain(await request(`/api/websites/${encodeURIComponent(record.workId)}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  },
};
