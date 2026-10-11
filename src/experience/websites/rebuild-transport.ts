import { z } from "zod";
import { websiteCapabilitySelectionSchema } from "@/products/websites/contracts";
import { legacyArchiveSummarySchema as legacyArchiveSummaryViewSchema, normalizeWebsiteRebuildUrl, rebuildSkippedPathSchema, websiteRebuildSchema } from "@/products/websites/client";

const factSchema = z.object({ text: z.string(), kind: z.string(), highRisk: z.boolean(), origin: z.string(), sources: z.array(z.object({ sourceId: z.string(), quote: z.string() })), verification: z.object({ supported: z.boolean(), confidence: z.number() }).optional() });
const auditCheckSchema = z.object({ name: z.string(), status: z.string(), score: z.number(), message: z.string() });
const auditSnapshotSchema = z.object({ categories: z.array(z.object({ name: z.string(), slug: z.string(), score: z.number(), checks: z.array(auditCheckSchema) })) });
export const rebuildAuditSchema = z.object({ scope: z.literal("html"), before: auditSnapshotSchema, after: auditSnapshotSchema, checkedAt: z.string(), unavailable: z.array(z.string()) });
export { legacyArchiveSummarySchema as legacyArchiveSummaryViewSchema } from "@/products/websites/client";
export const rebuildViewSchema = z.object({
  workId: z.string(), workspaceId: z.string(), tenantId: z.string().nullable().default(null), revision: z.number(), title: z.string(),
  status: z.enum(["building", "review", "approved", "published", "failed"]),
  stages: z.array(z.object({ stage: z.string(), status: z.enum(["pending", "running", "completed", "failed"]), message: z.string().optional() })),
  skippedPaths: z.array(rebuildSkippedPathSchema).max(200).default([]),
  candidate: z.object({ revision: z.number(), contentHash: z.string(), previewHref: z.string(), pageCount: z.number(), hasForms: z.boolean().default(false), facts: z.record(z.string(), factSchema), unmappedPages: z.array(z.string()).default([]) }).nullable(),
  capabilitySelection: websiteCapabilitySelectionSchema.nullable().default(null),
  approved: z.boolean(), publishedUrl: z.string().nullable(), readBack: z.enum(["verified", "failed", "pending"]).nullable(),
  agencyPublishPermission: z.object({ agencyWorkspaceId: z.string().uuid(), agencyName: z.string(), granted: z.boolean() }).nullable().optional(),
  domain: z.object({ hostname: z.string(), status: z.string(), checkedAt: z.string().nullable(), error: z.string().optional(), records: z.array(z.object({ type: z.string(), name: z.string(), value: z.string() })) }).nullable(),
  error: z.string().nullable(),
  audit: rebuildAuditSchema.nullable().default(null),
  legacyArchives: z.array(legacyArchiveSummaryViewSchema).max(50).default([]),
  legacyArchivesNextCursor: z.string().regex(/^[a-f0-9]{64}$/).nullable().default(null),
  legacyArchivesUnavailable: z.boolean().default(false),
  documentRevisions: z.array(z.object({ revision: z.number(), contentHash: z.string(), createdAt: z.string(), published: z.boolean() })).default([]),
  history: z.array(z.object({ revision: z.number(), kind: z.string(), at: z.string() })).default([]),
});
type CompleteRebuildView = z.infer<typeof rebuildViewSchema>;
type ArchiveViewFields = "legacyArchives" | "legacyArchivesNextCursor" | "legacyArchivesUnavailable";
export type RebuildView = Omit<CompleteRebuildView, ArchiveViewFields> & Partial<Pick<CompleteRebuildView, ArchiveViewFields>> & { historyUnavailable?: boolean; domainUnavailable?: boolean };
export interface RebuildTransport {
  read(workspaceId: string, workId: string, signal?: AbortSignal): Promise<RebuildView>;
  start(input: { workspaceId: string; requestId: string; url?: string; description?: string; businessName?: string }): Promise<RebuildView>;
  mutate(record: RebuildView, action: "confirm" | "edit" | "remove" | "approve" | "launch" | "retry" | "domain" | "undo", extra?: { factId?: string; text?: string; domain?: string; targetRevision?: number; allowAgencyPublish?: boolean; agencyWorkspaceId?: string }): Promise<RebuildView>;
}
export class RebuildTransportError extends Error { constructor(message: string, readonly status: number) { super(message); } }
export class RebuildUnconfirmedError extends Error {
  constructor(reason?: string) { super(`${reason ? `${reason} ` : ""}The change could not be confirmed. Reload its current saved state before continuing.`); }
}
const contactClaimRefusal = "Edit the separate email or phone fact first to change or remove this contact. Your current preview is unchanged.";
const contactEditRefusals = new Set([
  "Enter a valid email address or phone number for this contact. Your current preview is unchanged.",
  "Keep this contact as the same kind of email address or phone number. Your current preview is unchanged.",
  "This destination already belongs to another contact fact. Edit that existing email or phone instead. Your current preview is unchanged.",
  contactClaimRefusal,
]);
function refusedMutation(error: unknown, action: Parameters<RebuildTransport["mutate"]>[1]) {
  if (!(error instanceof RebuildTransportError)) return false;
  if (error.status === 401) return true;
  // These exact current-service contact refusals precede saveCandidate.
  if (error.status === 409 && (action === "edit" && contactEditRefusals.has(error.message) || action === "remove" && error.message === contactClaimRefusal)) return true;
  // RPC success can precede work acknowledgment parsing into a403/409.
  // Only input400 on these candidate commands is precommit; approval and
  // publication can also produce400 after their separate authority writes.
  return error.status === 400 && !["approve", "launch"].includes(action);
}
async function request(path: string, options?: RequestInit, submitted?: Parameters<RebuildTransport["start"]>[0]): Promise<RebuildView> {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...options });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new RebuildTransportError(typeof body?.error === "string" ? body.error : "This website could not be opened. Try again.", response.status);
  if (submitted) {
    const envelope = rebuildEnvelopeSchema.parse(body), saved = envelope.rebuild.input;
    const url = submitted.url ? normalizeWebsiteRebuildUrl(submitted.url) : null;
    if (envelope.workspaceId !== submitted.workspaceId || saved.requestId !== submitted.requestId || ("url" in saved ? saved.url !== url : saved.businessName !== submitted.businessName || saved.description !== submitted.description)) throw new RebuildUnconfirmedError();
  }
  return parseRebuildView(body);
}
const rebuildEnvelopeSchema = z.object({ workId: z.string(), workspaceId: z.string(), rebuild: websiteRebuildSchema, agencyPublishPermission: rebuildViewSchema.shape.agencyPublishPermission });
export function parseRebuildView(value: unknown): RebuildView {
  const record = rebuildEnvelopeSchema.parse(value);
  const item = record.rebuild;
  return rebuildViewSchema.parse({ workId: record.workId, workspaceId: record.workspaceId, agencyPublishPermission: record.agencyPublishPermission, tenantId: item.tenantId, revision: item.revision, title: item.title, status: item.status === "review_ready" ? "review" : item.status, stages: Array.from(new Map(item.stages.map(stage => [stage.stage, stage])).values()), skippedPaths: item.skippedPaths, candidate: item.candidate ? { revision: item.candidate.revision, contentHash: item.candidate.contentHash, previewHref: item.candidate.previewHref, pageCount: item.candidate.document.pages.length, hasForms: Boolean(item.candidate.document.capabilities?.inquiry || item.candidate.document.capabilities?.booking), facts: item.candidate.document.facts, unmappedPages: item.pageMapping.filter(page => !page.carriedOver).map(page => page.sourceUrl) } : null, capabilitySelection: "publishedCapabilitySelection" in item ? item.publishedCapabilitySelection : null, approved: Boolean(item.candidate && item.approvedCandidateRevision === item.candidate.revision), publishedUrl: item.launch.receipt?.status === "published" ? item.launch.receipt.providerUrl : null, readBack: item.launch.readBack?.status ?? null, domain: null, error: item.lastError, audit: "audit" in item ? item.audit : null, history: item.history });
}
export function archivedHistoryView(history: unknown, record: Pick<RebuildView,"workspaceId" | "workId">) {
  try {
    const envelope = z.object({ workspaceId: z.string().uuid(), workId: z.string().uuid(), legacyArchives: z.array(legacyArchiveSummaryViewSchema).max(50), legacyArchivesNextCursor: z.string().regex(/^[a-f0-9]{64}$/).nullable(), legacyArchivesUnavailable: z.boolean() }).parse(history);
    if (envelope.workspaceId !== record.workspaceId || envelope.workId !== record.workId || envelope.legacyArchives.some(archive => archive.workspaceId !== record.workspaceId)) throw new Error("Archive scope mismatch");
    return { legacyArchives: envelope.legacyArchives, legacyArchivesNextCursor: envelope.legacyArchivesNextCursor, legacyArchivesUnavailable: envelope.legacyArchivesUnavailable };
  } catch { return { legacyArchives: [], legacyArchivesNextCursor: null, legacyArchivesUnavailable: true }; }
}
async function withDomain(record: RebuildView, signal?: AbortSignal): Promise<RebuildView> {
  const read = async (route: string) => {
    const response = await fetch(`/api/websites/${encodeURIComponent(record.workId)}/${route}?${new URLSearchParams({ workspaceId: record.workspaceId })}`, { cache: "no-store", credentials: "same-origin", signal });
    if (!response.ok) return null;
    return response.json();
  };
  const [domain, history] = await Promise.all([record.candidate && record.publishedUrl ? read("domain").catch(() => null) : null, read("history").catch(() => null)]);
  const historyResult = z.object({ workspaceId: z.string().uuid(), workId: z.string().uuid(), revisions: rebuildViewSchema.shape.documentRevisions }).safeParse(history);
  const historyCurrent = historyResult.success && historyResult.data.workspaceId === record.workspaceId && historyResult.data.workId === record.workId;
  // The domain endpoint has no identity envelope; its exact work/workspace GET
  // owns scope. Require its domain field rather than interpreting malformed data
  // as a confirmed absence. Neither supplemental failure changes acceptance.
  const domainResult = z.object({ domain: rebuildViewSchema.shape.domain }).safeParse(domain);
  const needsDomain = Boolean(record.candidate && record.publishedUrl);
  return { ...record, ...archivedHistoryView(history,record),
    domain: domainResult.success ? domainResult.data.domain : null, domainUnavailable: needsDomain && !domainResult.success,
    documentRevisions: historyCurrent ? historyResult.data.revisions : [], historyUnavailable: !historyCurrent };
}
export const serverRebuildTransport: RebuildTransport = {
  async read(workspaceId, workId, signal) {
    const record = await request(`/api/websites/${encodeURIComponent(workId)}/rebuild?${new URLSearchParams({ workspaceId })}`, { signal });
    if (record.workspaceId !== workspaceId || record.workId !== workId) throw new Error("The current saved website could not be confirmed.");
    return withDomain(record, signal);
  },
  start(input) { return request("/api/websites/rebuild", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }, input); },
  async mutate(record, action, extra) {
    try {
      const facts = action === "confirm" || action === "edit" || action === "remove";
      const path = facts ? `facts/${encodeURIComponent(extra?.factId ?? "")}` : action === "retry" ? "rebuild" : action;
      const identity = { expectedRevision: record.revision, candidateRevision: record.candidate?.revision, candidateContentHash: record.candidate?.contentHash };
      const body = facts ? { ...identity, action, ...(action === "edit" ? { text: extra?.text } : {}) }
        : action === "domain" ? { expectedRevision: record.revision, domain: extra?.domain, action: record.domain ? "refresh" : "attach" }
        : action === "approve" && extra?.allowAgencyPublish ? { ...identity, allowAgencyPublish: true, agencyWorkspaceId: extra.agencyWorkspaceId }
        : action === "retry" ? { expectedRevision: record.revision } : action === "undo" ? { ...identity, targetRevision: extra?.targetRevision } : identity;
      if (action === "domain") {
        const response = await fetch(`/api/websites/${encodeURIComponent(record.workId)}/domain`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const value = await response.json().catch(() => null);
        if (!response.ok) throw new RebuildTransportError(value?.error ?? "The domain could not be checked.", response.status);
        return { ...record, domain: z.object({ domain: rebuildViewSchema.shape.domain }).parse(value).domain, domainUnavailable: false };
      }
      const next = await request(`/api/websites/${encodeURIComponent(record.workId)}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (next.workspaceId !== record.workspaceId || next.workId !== record.workId || next.revision < record.revision || (facts && (next.revision === record.revision || next.approved || !next.candidate || next.candidate.revision < (record.candidate?.revision ?? 0)))) throw new RebuildUnconfirmedError();
      return { ...next, historyUnavailable: true, domainUnavailable: Boolean(next.publishedUrl), agencyPublishPermission: next.agencyPublishPermission === undefined ? record.agencyPublishPermission : next.agencyPublishPermission };
    } catch (error) {
      if (refusedMutation(error, action)) throw error;
      throw new RebuildUnconfirmedError(error instanceof RebuildTransportError && [403,409].includes(error.status) ? error.message : undefined);
    }
  },
};
