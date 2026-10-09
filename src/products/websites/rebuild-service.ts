import { createHash } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { type BoundedStore } from "@/platform/bounded-work/repository";
import { websiteWorkspaceStore as boundedStore } from "./workspace-store";
import { listWork } from "@/platform/workspaces/repository";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type SavedWork, type WorkspaceActor, type AcceptedHandoff } from "@/platform/workspaces/types";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { websiteDocumentStore, createWebsiteDocumentStore, invalidatePublishedSiteDocument, type OwnerLinkWebsiteSession, type WebsiteDocumentStore, type WebsiteDocumentRevision, type WebsiteAgencyPublishPermission } from "./document-store";
import { siteDocumentHash, siteDocumentSchema, siteIdSchema, catalogNodeSchema, unresolvedSiteFacts, type SiteDocument } from "./site-document";
import { extractBusinessFacts, runWebsiteRebuild, isHighRiskWebsiteClaim, type RebuildCheckpoint, type RebuildOptions, type WebsiteRebuildInput } from "./rebuild-pipeline";
import { normalizeRebuildUrl } from "./rebuild-crawl";
import { prepareSitePatch, prepareSiteUndo } from "./site-operations";
import { checkWebsiteHealth } from "./site-health";
import { rebuildFactInputSchema, rebuildInputSchema, rebuildSelectionSchema, websiteRebuildSchema, type WebsiteRebuild, type WebsiteRebuildRecord } from "./rebuild-contracts";
import { websiteLaunchReceiptSchema, type WebsiteLaunchReceipt } from "./contracts";
import { changeHostedDomain, readHostedDomains } from "./rebuild-domains";
import { rehostWebsiteAssets } from "./site-media";
import { registrableRebuildDomain } from "./rebuild-domain-key";
import { connectWebsiteCapabilitiesInputSchema } from "./contracts";
import { listPublishedWebsiteCapabilityOptions, resolvePublishedWebsiteCapabilities } from "./published-capabilities";
import { auditRebuildHtml } from "./rebuild-audit";
import { renderSiteDocumentHtml } from "./site-export";
import { tenantHostedBaseUrl } from "@/platform/infra/brand";
import { normalizeCustomDomain } from "@/lib/domains";
import { bindWebsiteBusinessRecord, projectWebsiteBusinessFacts } from "./business-facts";
import { readCandidateBusinessFacts } from "./business-facts-server";
import { askExistingPagesSchema, existingWebsitePageOperations } from "./ask-existing-pages";
import { descriptionContactBindings, rebuildContactLink } from "./rebuild-contact";

interface Loaded { work: SavedWork; rebuild: WebsiteRebuild }
type WebsiteOwnerReviewRecord = WebsiteRebuildRecord & { agencyPublishPermission?: WebsiteAgencyPublishPermission | null };
/** One part of a cutover onto an existing site, reported on its own. */
export interface WebsiteCutoverItem { id: "document_published" | "read_back" | "domain_moved" | "old_project_kept" | "redirects_live"; status: "done" | "waiting" | "failed" | "not_needed"; label: string }
interface ServiceDependencies {
  documents?: WebsiteDocumentStore;
  pipeline?: typeof runWebsiteRebuild;
  pipelineOptions?: RebuildOptions | ((actor: WorkspaceActor, workspaceId: string) => Promise<RebuildOptions>);
  list?: typeof listWork;
  rateLimited?: (workspaceId: string) => Promise<boolean>;
  createHostedTenant?: (actor: WorkspaceActor, record: WebsiteRebuildRecord) => Promise<string>;
  checkLive?: (row: WebsiteDocumentRevision, url: string) => Promise<WebsiteRebuild["launch"]["readBack"]>;
  revalidate?: () => Promise<void>;
  domainRead?: typeof readHostedDomains;
  domainChange?: typeof changeHostedDomain;
  now?: () => string;
  resolveCapabilities?: typeof resolvePublishedWebsiteCapabilities;
}

function loadWork(work: SavedWork | null): Loaded {
  if (!work || work.productId !== "websites" || work.resourceKind !== "website") throw new WorkspaceAccessError();
  const result = websiteRebuildSchema.safeParse(work.payload);
  if (!result.success) throw new WorkspaceConflictError("This is not a URL rebuild. Open its original website view.");
  return { work, rebuild: result.data };
}
function present(loaded: Loaded): WebsiteRebuildRecord { return { workId: loaded.work.id, workspaceId: loaded.work.workspaceId, rebuild: loaded.rebuild }; }
function exact(loaded: Loaded, raw: unknown) {
  const input = rebuildSelectionSchema.parse(raw); const candidate = loaded.rebuild.candidate;
  if (loaded.rebuild.revision !== input.expectedRevision || !candidate || candidate.revision !== input.candidateRevision || candidate.contentHash !== input.candidateContentHash || siteDocumentHash(candidate.document) !== candidate.contentHash) throw new WorkspaceConflictError("This website changed. Reload its current preview before continuing.");
  return { input, candidate };
}
function publicFailure(error: unknown): string {
  if (error instanceof WorkspaceAccessError) return "Access changed while rebuilding. Reopen the workspace with an authorized account.";
  if (error instanceof WorkspaceConflictError) return error.message;
  if (error instanceof Error && /public website|business name|couldn't|could not|robots|browser to read|unreachable|description|website address/i.test(error.message)) return error.message.slice(0,1000);
  return "The rebuild could not finish. Earlier stages are saved; retry to continue.";
}
function previewHref(workId: string, row: WebsiteDocumentRevision): string { return `/api/websites/${workId}/preview?revision=${row.revision}&contentHash=${row.contentHash}`; }
function clearReviewedNodeFlags(document: SiteDocument): SiteDocument {
  const unresolved = new Set(unresolvedSiteFacts(document));
  for (const node of Object.values(document.nodes)) {
    if (node.factIds.length && node.factIds.every(id => document.facts[id] && !unresolved.has(id))) node.verification = { supported: true, confidence: 1, needsReview: false, highRisk: node.factIds.some(id => document.facts[id]?.highRisk) };
  }
  return document;
}

function hostedTenantSlug(record: WebsiteRebuildRecord): string {
  const document = record.rebuild.candidate!.document;
  const stem = document.siteName.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40) || "business";
  // The work suffix fixes the identity across retries and prevents a name collision
  // from ever assigning a caller to an unrelated existing customer's tenant.
  const slug = record.rebuild.tenantId ?? `${stem}-${record.workId.replace(/-/g,"").slice(0,12)}`;
  return slug;
}

export function createWebsiteRebuildService(store: BoundedStore = boundedStore, dependencies: ServiceDependencies = {}) {
  const documents = dependencies.documents ?? websiteDocumentStore;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const pipeline = dependencies.pipeline ?? runWebsiteRebuild;
  /** The tenant this work routes to now (P2 #8): the publication or
   * reservation row, which follows a slug rename. The payload's tenantId is
   * the slug at launch and stays as written. */
  async function routeTenant(actor: WorkspaceActor, loaded: Loaded): Promise<string | null> {
    if (!loaded.rebuild.tenantId || !documents.currentTenant) return loaded.rebuild.tenantId;
    try { return (await documents.currentTenant(actor,{ workspaceId: loaded.work.workspaceId, workId: loaded.work.id }))?.tenantId ?? loaded.rebuild.tenantId; }
    catch (error) { if (error instanceof WorkspaceAccessError) throw error; return loaded.rebuild.tenantId; }
  }
  async function load(actor: WorkspaceActor, workId: string): Promise<Loaded> { return loadWork(await store.read(actor, z.string().uuid().parse(workId))); }
  async function update(actor: WorkspaceActor, loaded: Loaded, kind: string, changes: Partial<WebsiteRebuild>): Promise<Loaded> {
    const revision = loaded.rebuild.revision + 1;
    const payload = websiteRebuildSchema.parse({ ...loaded.rebuild, ...changes, revision, history: [...loaded.rebuild.history, { revision, kind, actorId: actor.userId, at: now() }] });
    if (Buffer.byteLength(JSON.stringify(payload),"utf8") > 1_950_000) throw new WorkspaceStoreError("This rebuild exceeds its saved-work size limit. Use a smaller site or business description.");
    return loadWork(await store.update(actor, loaded.work, loaded.rebuild.revision, payload));
  }
  async function saveCandidate(actor: WorkspaceActor, loaded: Loaded, document: SiteDocument, kind: string, forceNewRevision = false) {
    const businessFacts = await readCandidateBusinessFacts(actor,loaded.work.workspaceId);
    document = projectWebsiteBusinessFacts(bindWebsiteBusinessRecord(document,businessFacts),businessFacts);
    await store.member(actor,loaded.work.workspaceId);
    const latest = await documents.read(actor,{ workspaceId: loaded.work.workspaceId, workId: loaded.work.id });
    const contentHash = siteDocumentHash(document);
    const row = { revision: !forceNewRevision && latest?.contentHash === contentHash ? latest.revision : (latest?.revision ?? 0)+1, contentHash, document } as WebsiteDocumentRevision;
    const revision = loaded.rebuild.revision+1;
    const temporary = present({ ...loaded,rebuild:{ ...loaded.rebuild,candidate:{ revision:row.revision,contentHash,document,previewHref:previewHref(loaded.work.id,row) } } });
    const slug = hostedTenantSlug(temporary);
    const audit = loaded.rebuild.sourceAudit ? { scope: "html" as const, before: loaded.rebuild.sourceAudit, after: auditRebuildHtml(renderSiteDocumentHtml(document,"/",{ canonicalUrl:tenantHostedBaseUrl(slug),tenant:slug }),tenantHostedBaseUrl(slug)), checkedAt: now(), unavailable: ["PageSpeed and Lighthouse performance", "Response security headers", "AI assistant visibility", "Well-known robots, sitemap and llms files on the original site", "Live hosted response"] } : null;
    const payload = websiteRebuildSchema.parse({ ...loaded.rebuild, title: document.siteName, status: "review_ready", candidate: { revision: row.revision, contentHash, document, previewHref: previewHref(loaded.work.id,row) }, approvedCandidateRevision: null, lastError: null, revision, audit, history: [...loaded.rebuild.history,{ revision,kind,actorId:actor.userId,at:now() }] });
    if (Buffer.byteLength(JSON.stringify(payload))>1_950_000) throw new WorkspaceStoreError("This rebuild exceeds its saved-work size limit.");
    return loadWork(await documents.commitCandidate(actor,{ workspaceId: loaded.work.workspaceId, workId: loaded.work.id, expectedRevision: latest?.revision ?? 0, expectedWorkRevision: loaded.rebuild.revision, document, payload }));
  }
  async function build(actor: WorkspaceActor, loaded: Loaded) {
    let current = await update(actor,loaded,"rebuild_started",{ status: "building", lastError: null, approvedCandidateRevision: null });
    const { requestId: _requestId, ...input } = current.rebuild.input;
    try {
      const pipelineOptions = typeof dependencies.pipelineOptions === "function"
        ? await dependencies.pipelineOptions(actor, current.work.workspaceId)
        : dependencies.pipelineOptions ?? await (await import("./rebuild-runtime")).configuredWebsiteRebuildOptions({
          actor, workspaceId: current.work.workspaceId, workId: current.work.id, recheck: () => store.member(actor, current.work.workspaceId).then(() => undefined),
        });
      const checkpoint = current.rebuild.checkpoint as RebuildCheckpoint | null;
      const result = await pipeline(input as WebsiteRebuildInput, {
        ...pipelineOptions,
        ...(checkpoint ? { checkpoint } : {}),
        onSourcePage: async page => {
          await documents.retainCrawlPage(actor,{ workspaceId: current.work.workspaceId, workId: current.work.id, page });
          if (!current.rebuild.sourceAudit) current = await update(actor,current,"source_audit_saved",{ sourceAudit: auditRebuildHtml(page.html,page.url) });
          await pipelineOptions.onSourcePage?.(page);
        },
        rehostAssets: pipelineOptions.rehostAssets ?? (process.env.BLOB_READ_WRITE_TOKEN ? async assets => {
          const facts = (current.rebuild.checkpoint as RebuildCheckpoint | null)?.facts;
          const stem = (facts?.name ?? current.rebuild.title).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40) || "business";
          return rehostWebsiteAssets(`${stem}-${current.work.id.replace(/-/g,"").slice(0,12)}`,assets);
        } : undefined),
        onEvent: async event => {
          const events = [...current.rebuild.stages,{ stage: event.stage, status: event.status, message: event.message.slice(0,1000), at: event.at }].slice(-100);
          current = await update(actor,current,"rebuild_progress",{ stages: events });
        },
        onCheckpoint: async next => {
          // The pipeline compacts crawl HTML for extraction. Once extracted,
          // only the source quotes need to survive in the saved work record.
          const checkpoint = structuredClone(next);
          if (checkpoint.facts && checkpoint.crawl) checkpoint.crawl.pages = checkpoint.crawl.pages.map(page => ({ ...page, html: "", visibleText: "" }));
          current = await update(actor,current,"rebuild_checkpoint",{ checkpoint });
        },
      });
      current = await saveCandidate(actor,current,result.document,"rebuild_ready");
      // Documents own durable facts. Drop large model/crawl duplicates after
      // success while retaining the stage log and source provenance.
      current = await update(actor,current,"rebuild_finished",{ checkpoint: null, pageMapping: result.pageMapping, skippedPaths: result.crawl?.skipped.slice(0, 200) ?? [] });
      return present(current);
    } catch (error) {
      // A lost CAS or revoked access must never overwrite a newer actor's work.
      if (error instanceof WorkspaceAccessError || error instanceof WorkspaceConflictError) throw error;
      current = await update(actor,current,"rebuild_failed",{ status: "failed", lastError: publicFailure(error) });
      return present(current);
    }
  }
  async function create(actor: WorkspaceActor, workspaceId: string, raw: unknown, deferBuild = false) {
    const input = rebuildInputSchema.parse(raw);
    await store.member(actor,z.string().uuid().parse(workspaceId));
    const normalized = "url" in input ? { ...input, url: normalizeRebuildUrl(input.url) } : input;
    const domainKey = "url" in normalized ? registrableRebuildDomain(new URL(normalized.url).hostname) : `description:${createHash("sha256").update(normalized.businessName.toLowerCase()).digest("hex")}`;
    // Reopens an existing id before rate admission, including completed work.
    const list = dependencies.list ?? (store === boundedStore ? listWork : undefined);
    if (list) {
      const duplicate = (await list(actor,workspaceId)).find(work => work.productId === "websites" && (work.input as { requestId?: string } | undefined)?.requestId === input.requestId);
      if (duplicate) {
        const loaded = loadWork(duplicate);
        if (JSON.stringify(loaded.rebuild.input) !== JSON.stringify(normalized)) throw new WorkspaceConflictError("This request id already belongs to another rebuild.");
        return present(loaded);
      }
    }
    if (await (dependencies.rateLimited ?? (id => isRateLimitedWindowedAsync(`website-rebuild:${id}`,10,24*60*60*1000)))(workspaceId)) throw new WorkspaceConflictError("This workspace has reached today's rebuild limit. Reopen an existing rebuild or try tomorrow.");
    const payload = websiteRebuildSchema.parse({ version: 2, revision: 0, title: "url" in normalized ? new URL(normalized.url).hostname : normalized.businessName, input: normalized, status: "building", stages: [], checkpoint: null, candidate: null, approvedCandidateRevision: null, tenantId: null, launch: { receipt: null, readBack: null }, lastError: null, createdBy: actor.userId, createdAt: now(), history: [] });
    const work = await documents.claimRebuild(actor,workspaceId,{ requestId: input.requestId, domainKey, input: normalized, payload });
    const loaded = loadWork(work);
    if (loaded.rebuild.revision > 0 || loaded.rebuild.status !== "building") return present(loaded);
    return deferBuild ? present(loaded) : build(actor,loaded);
  }
  async function read(actor: WorkspaceActor, workId: string): Promise<WebsiteOwnerReviewRecord> {
    const stored = await load(actor,workId);
    const tenantId = await routeTenant(actor,stored);
    // Presented with the current slug; the stored payload is not rewritten.
    const loaded = tenantId === stored.rebuild.tenantId ? stored : { ...stored, rebuild: { ...stored.rebuild, tenantId } };
    const agencyPublishPermission = await documents.agencyPublishPermission?.(actor,{ workspaceId: loaded.work.workspaceId, workId }) ?? null;
    if (tenantId && loaded.rebuild.candidate && (loaded.rebuild.launch.receipt?.artifactHash !== loaded.rebuild.candidate.contentHash || loaded.rebuild.launch.receipt?.candidateRevision !== loaded.rebuild.candidate.revision)) {
      const published = await documents.published(tenantId);
      if (published?.workId === workId && published.revision === loaded.rebuild.candidate.revision && published.contentHash === loaded.rebuild.candidate.contentHash && published.receipt) return { ...present({ ...loaded, rebuild: { ...loaded.rebuild, status: "published", launch: { receipt: published.receipt, readBack: { status: "pending", checkedAt: now(), message: "Publication is committed; the public read-back has not been confirmed yet." } } } }), agencyPublishPermission };
    }
    return { ...present(loaded), agencyPublishPermission };
  }
  async function list(actor: WorkspaceActor, workspaceId: string) {
    const works = await (dependencies.list ?? listWork)(actor,workspaceId);
    return works.filter(work => work.productId === "websites" && websiteRebuildSchema.safeParse(work.payload).success).map(work => present(loadWork(work)));
  }
  async function retry(actor: WorkspaceActor, workId: string, raw: unknown) {
    const input = z.object({ expectedRevision: z.number().int().nonnegative() }).strict().parse(raw);
    const loaded = await load(actor,workId);
    if (loaded.rebuild.revision !== input.expectedRevision || !["failed","building"].includes(loaded.rebuild.status)) throw new WorkspaceConflictError("Reload the failed rebuild before retrying.");
    await store.member(actor,loaded.work.workspaceId);
    return build(actor,loaded);
  }
  async function resolveFact(actor: WorkspaceActor, workId: string, factId: string, raw: unknown) {
    const input = rebuildFactInputSchema.parse(raw); const loaded = await load(actor,workId);
    const { candidate } = exact(loaded,{ expectedRevision: input.expectedRevision, candidateRevision: input.candidateRevision, candidateContentHash: input.candidateContentHash });
    await store.member(actor,loaded.work.workspaceId);
    const document = structuredClone(candidate.document); const fact = document.facts[factId];
    await documents.manage(actor,{ workspaceId: loaded.work.workspaceId, workId });
    if (!fact) throw new WorkspaceConflictError("This fact is no longer in the current document.");
    const contactLink = fact.kind === "contact" ? rebuildContactLink(fact.text) : null;
    const contactHref = (value: unknown) => contactLink && (value === contactLink.href || value === `${contactLink.href.split(":")[0]}:${fact.text}`);
    const descriptionFacts = "description" in loaded.rebuild.input ? extractBusinessFacts(loaded.rebuild.input) : null;
    const currentDescription = descriptionFacts ? { ...descriptionFacts, facts: document.facts } : null;
    const bindings = currentDescription ? descriptionContactBindings(currentDescription) : [];
    if (currentDescription && fact.kind === "claim" && ["edit","remove"].includes(input.action)) {
      const nextFacts = { ...document.facts };
      if (input.action === "remove") delete nextFacts[factId];
      else nextFacts[factId] = { ...fact, text: input.text! };
      const offered = (current: NonNullable<typeof currentDescription>) => descriptionContactBindings(current).map(binding => [binding.claimId,binding.contactId,current.facts[binding.claimId]!.text.slice(binding.start,binding.end)]);
      if (JSON.stringify(offered(currentDescription)) !== JSON.stringify(offered({ ...currentDescription, facts: nextFacts }))) throw new WorkspaceConflictError("Edit the separate email or phone fact first to change or remove this contact. Your current preview is unchanged.");
    }
    const claimChanges: Array<{ id: string; before: string; after: string }> = [];
    const updateDescriptionClaims = (text: string) => {
      const claimIds = [...new Set(bindings.filter(binding => binding.contactId === factId).map(binding => binding.claimId))];
      for (const id of claimIds) {
        const claim = document.facts[id]!; const before = claim.text; let next = before;
        for (const span of bindings.filter(binding => binding.contactId === factId && binding.claimId === id).sort((a,b) => b.start - a.start)) next = next.slice(0,span.start) + text + next.slice(span.end);
        next = next.trim();
        if (next !== before) { claimChanges.push({ id, before, after: next }); claim.text = next; claim.highRisk = isHighRiskWebsiteClaim(next); }
      }
    };
    const rewriteClaimCopy = (value: string, factIds?: string[], max?: number) => {
      let next = value;
      for (const claim of claimChanges.filter(claim => !factIds || factIds.includes(claim.id))) {
        if (max && claim.before.startsWith(next) && next.length >= 30) next = claim.after.slice(0,max);
        else next = next.split("\n\n").map(paragraph => paragraph === claim.before ? claim.after : paragraph).join("\n\n");
      }
      return next;
    };
    if (input.action === "remove") {
      delete document.facts[factId];
      updateDescriptionClaims("");
      const removeCopy = (value: string, factIds?: string[], max?: number) => {
        if (contactLink) return rewriteClaimCopy(value,factIds,max).split("\n\n").map(paragraph => paragraph === fact.text ? "" : paragraph).join("\n\n").trim();
        if (fact.text.startsWith(value) && value.length >= 30) return "";
        return value.includes(fact.text) ? value.replaceAll(fact.text,"").trim() : value;
      };
      const rewrite = (value: unknown, factIds: string[]): unknown => {
        if (typeof value === "string") return removeCopy(value,factIds);
        if (typeof value === "number" && String(value) === fact.text) return undefined;
        if (Array.isArray(value)) return value.map(child => rewrite(child,factIds)).filter(child => child !== undefined);
        if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).flatMap(([key,child]) => { const next = key === "href" && contactLink ? contactHref(child) ? undefined : child : rewrite(child,factIds); return next === undefined ? [] : [[key,next]]; }));
        return value;
      };
      for (const [id,node] of Object.entries(document.nodes)) if (node.factIds.includes(factId)) {
        const factIds = node.factIds.filter(value => value !== factId);
        const verification = factIds.length ? node.verification : { supported:true,confidence:1,needsReview:false };
        const updated = catalogNodeSchema.safeParse({ ...node,props:rewrite(node.props,node.factIds),factIds,verification });
        // Some required typed fields (for example a link's href) cannot remain
        // valid after removal. Preserve the surrounding graph and other evidence.
        document.nodes[id] = updated.success ? updated.data : { id,type:"Section",variant:"container",props:{},children:node.children,factIds,...(verification ? {verification} : {}) };
      }
      document.siteName = removeCopy(document.siteName) || "Business website";
      for (const page of document.pages) { page.title = removeCopy(page.title,undefined,70) || document.siteName.slice(0,70); page.description = removeCopy(page.description,undefined,160); }
    } else {
      if (input.action === "edit") {
        const before = fact.text; let replaced = false;
        const nextContactLink = contactLink ? rebuildContactLink(input.text!) : null;
        if (contactLink && !nextContactLink) throw new WorkspaceConflictError("Enter a valid email address or phone number for this contact. Your current preview is unchanged.");
        if (contactLink && nextContactLink!.label !== contactLink.label) throw new WorkspaceConflictError("Keep this contact as the same kind of email address or phone number. Your current preview is unchanged.");
        if (nextContactLink && Object.entries(document.facts).some(([id, current]) => id !== factId && current.kind === "contact" && rebuildContactLink(current.text)?.href.toLowerCase() === nextContactLink.href.toLowerCase())) throw new WorkspaceConflictError("This destination already belongs to another contact fact. Edit that existing email or phone instead. Your current preview is unchanged.");
        updateDescriptionClaims(input.text!);
        const rewrite = (value: unknown, factIds: string[]): unknown => {
          if (typeof value === "string") { const next = contactLink ? rewriteClaimCopy(value,factIds).split("\n\n").map(paragraph => paragraph === before ? input.text! : paragraph).join("\n\n") : value.replaceAll(before,input.text!); if (next !== value) replaced = true; return next; }
          if (Array.isArray(value)) return value.map(child => rewrite(child,factIds));
          if (value && typeof value === "object") {
            const link = value as Record<string, unknown>;
            return Object.fromEntries(Object.entries(value).map(([key,child]) => {
              if (key === "href" && contactLink) { if (contactHref(child)) { replaced = true; return [key,nextContactLink!.href]; } return [key,child]; }
              if (key === "label" && contactHref(link.href) && child === contactLink?.label) return [key,nextContactLink!.label];
              return [key,rewrite(child,factIds)];
            }));
          }
          return value;
        };
        for (const node of Object.values(document.nodes)) if (node.factIds.includes(factId)) node.props = rewrite(node.props,node.factIds) as typeof node.props;
        if (document.siteName === before) { document.siteName = input.text!.slice(0,160); replaced = true; }
        const rewriteMeta = (value: string,max: number) => {
          if (contactLink) { const next = value === before ? input.text! : rewriteClaimCopy(value,undefined,max); if (next !== value) replaced = true; return next.slice(0,max); }
          const truncated = before.startsWith(value) && value.length >= 30;
          if (truncated || value.includes(before)) replaced = true;
          return (truncated ? input.text! : value.replaceAll(before,input.text!)).slice(0,max);
        };
        for (const page of document.pages) { page.title = rewriteMeta(page.title,70); page.description = rewriteMeta(page.description,160); }
        if (!replaced && Object.values(document.nodes).some(node => node.factIds.includes(factId))) throw new WorkspaceConflictError("This fact has been rewritten in the site copy. Remove it, or edit the site's exact sentence before confirming.");
        fact.text = input.text!; fact.highRisk = isHighRiskWebsiteClaim(fact.text);
      }
      fact.origin = "owner_confirmed"; fact.verification = { supported: true, confidence: 1 };
    }
    const next = await saveCandidate(actor,loaded,siteDocumentSchema.parse(clearReviewedNodeFlags(document)),`fact_${input.action}`);
    return present(next);
  }
  async function approve(actor: WorkspaceActor, workId: string, raw: unknown): Promise<WebsiteOwnerReviewRecord> {
    const { allowAgencyPublish, agencyWorkspaceId, ...selection } = rebuildSelectionSchema.extend({ allowAgencyPublish: z.boolean().optional(), agencyWorkspaceId: z.string().uuid().optional() })
      .refine(value => value.allowAgencyPublish === true ? Boolean(value.agencyWorkspaceId) : value.agencyWorkspaceId === undefined, "Choose the current agency when authorizing publishing.").parse(raw);
    const loaded = await load(actor,workId); const { candidate } = exact(loaded,selection);
    if (unresolvedSiteFacts(candidate.document).length || Object.values(candidate.document.nodes).some(node => node.verification?.needsReview)) throw new WorkspaceConflictError("Resolve the flagged facts and changed copy before approving this website.");
    await documents.approve(actor,{ workspaceId: loaded.work.workspaceId, workId, revision: candidate.revision, contentHash: candidate.contentHash, ...(allowAgencyPublish ? { agencyWorkspaceId } : {}) });
    const approved = await update(actor,loaded,"rebuild_approved",{ status: "approved", approvedCandidateRevision: candidate.revision, lastError: null });
    return { ...present(approved), agencyPublishPermission: await documents.agencyPublishPermission?.(actor,{ workspaceId: loaded.work.workspaceId, workId }) ?? null };
  }
  async function assertCurrentCapabilities(actor: WorkspaceActor, loaded: Loaded) {
    if (!loaded.rebuild.publishedCapabilitySelection) return;
    const resolver = dependencies.resolveCapabilities ?? resolvePublishedWebsiteCapabilities;
    const projection = loaded.rebuild.history.some(entry => ["ask_booking_page_prepared", "ask_existing_pages_prepared"].includes(entry.kind))
      ? await resolver(actor,loaded.work.workspaceId,loaded.work.id,loaded.rebuild.publishedCapabilitySelection,{ requireConnectedCalendar: true })
      : await resolver(actor,loaded.work.workspaceId,loaded.work.id,loaded.rebuild.publishedCapabilitySelection);
    if (!projection || JSON.stringify(projection) !== JSON.stringify(loaded.rebuild.candidate!.document.capabilities)) throw new WorkspaceConflictError("The visitor form or booking connection changed. Reconnect it and approve the new preview before publishing.");
  }
  /** Confirm one exact node's displayed copy. Facts and publication remain separate decisions. */
  async function resolveCopyReview(actor: WorkspaceActor, workId: string, rawNodeId: string, raw: unknown) {
    const nodeId = siteIdSchema.parse(rawNodeId);
    const loaded = await load(actor,workId);
    const { candidate } = exact(loaded,raw);
    if (loaded.rebuild.status !== "review_ready") throw new WorkspaceConflictError("Open the current review-ready website preview before confirming copy.");
    await store.member(actor,loaded.work.workspaceId);
    await documents.manage(actor,{ workspaceId: loaded.work.workspaceId, workId });
    const document = structuredClone(candidate.document);
    const node = document.nodes[nodeId];
    if (!node || !node.verification?.needsReview) throw new WorkspaceConflictError("This website copy is no longer waiting on confirmation.");
    const unresolved = new Set(unresolvedSiteFacts(document));
    if (node.factIds.some(factId => !document.facts[factId] || unresolved.has(factId))) throw new WorkspaceConflictError("Confirm this copy's unresolved facts before reviewing the copy.");
    node.verification = { ...node.verification, supported: true, confidence: 1, needsReview: false };
    return present(await saveCandidate(actor,loaded,siteDocumentSchema.parse(document),"copy_review_confirmed"));
  }
  async function launch(actor: WorkspaceActor, workId: string, raw: unknown) {
    let loaded = await load(actor,workId); const { candidate } = exact(loaded,raw);
    if (loaded.rebuild.launch.receipt?.status === "published" && loaded.rebuild.launch.receipt.artifactHash === candidate.contentHash && loaded.rebuild.launch.receipt.candidateRevision === candidate.revision) return present(loaded.rebuild.status === "published" ? loaded : await update(actor,loaded,"publish_reconciled",{ status:"published" }));
    const routedTenant = await routeTenant(actor,loaded);
    if (routedTenant) {
      const published = await documents.published(routedTenant);
      if (published?.workId === workId && published.revision === candidate.revision && published.contentHash === candidate.contentHash && published.receipt) return present(await update(actor,loaded,"publish_reconciled",{ status: "published", launch: { receipt: published.receipt, readBack: { status: "pending", checkedAt: now(), message: "Publication is committed; the public read-back has not been confirmed yet." } } }));
    }
    if (loaded.rebuild.status !== "approved" || loaded.rebuild.approvedCandidateRevision !== candidate.revision) throw new WorkspaceConflictError("Approve the exact current preview before launching.");
    await assertCurrentCapabilities(actor,loaded);
    // Never re-approve as the launcher: that would replace the customer's
    // approval with the operator's (audit 2026-10-05, finding 6). Reserve and
    // publish each check launch authority and the exact approved revision
    // atomically; a scoped provider may launch only an owner's approval.
    const tenantId = dependencies.createHostedTenant ? await dependencies.createHostedTenant(actor,present(loaded)) : await documents.reserveHostedTenant(actor,{ workspaceId: loaded.work.workspaceId, workId, revision: candidate.revision, contentHash: candidate.contentHash, tenantId: routedTenant ?? hostedTenantSlug(present(loaded)) });
    loaded = await update(actor,loaded,"hosted_tenant_bound",{ tenantId });
    const providerUrl = `${tenantHostedBaseUrl(tenantId)}/`;
    const receipt: WebsiteLaunchReceipt = websiteLaunchReceiptSchema.parse({ status: "published", provider: "strelva-hosted", providerUrl, receiptId: `hosted-${createHash("sha256").update(`${workId}:${candidate.revision}:${candidate.contentHash}`).digest("hex").slice(0,32)}`, artifactHash: candidate.contentHash, candidateRevision: candidate.revision, publishedAt: now(), evidence: "The approved immutable site document is the hosted tenant's published revision." });
    const row = await documents.publish(actor,{ workspaceId: loaded.work.workspaceId, workId, revision: candidate.revision, contentHash: candidate.contentHash, tenantId, receipt });
    // Once this pointer/receipt exists, read-back failures cannot create a new
    // publish. The published document lets a later read reconcile lost CAS.
    const committedReceipt = row.receipt ?? receipt;
    loaded = await update(actor,loaded,"rebuild_published",{ status: "published", launch: { receipt: committedReceipt, readBack: { status: "pending", checkedAt: now(), message: "Published; checking the public site." } } });
    try { await invalidatePublishedSiteDocument(tenantId); await (dependencies.revalidate ?? (async () => { revalidatePath("/","layout"); }))(); } catch { /* Publication is committed; cache/read-back is separate. */ }
    let readBack: WebsiteRebuild["launch"]["readBack"];
    try {
      readBack = dependencies.checkLive ? await dependencies.checkLive(row,providerUrl) : await (async () => { const result = await checkWebsiteHealth({ workspaceId: row.workspaceId, workId, tenantId, revision: row.revision, contentHash: row.contentHash, url: providerUrl }); return { status: result.status === "healthy" ? "verified" as const : "failed" as const, checkedAt: result.checkedAt, message: result.status === "healthy" ? "The public site matches the published document." : "Live, but we couldn't confirm the public document yet." }; })();
    } catch { readBack = { status: "failed", checkedAt: now(), message: "Live, but we couldn't confirm the public document yet." }; }
    return present(await update(actor,loaded,"hosted_read_back",{ launch: { receipt: committedReceipt, readBack } }));
  }
  /**
   * Publish an approved rebuild onto a site this business already runs (a
   * tenant linked through tenant_workspace_links). Owner only, decided in SQL.
   * The website System keeps its identity (origin tenant:<stable_id>); only
   * the tenant's delivery model changes. Reports each part of the cutover
   * separately and never claims a part that did not happen: the domain stays
   * where it is until the owner's DNS step, and the client's old project is
   * kept as a fallback by the operator (nothing here can remove it).
   */
  async function publishOntoLinkedTenant(actor: WorkspaceActor, workId: string, raw: unknown) {
    const input = rebuildSelectionSchema.extend({ tenantId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/) }).strict().parse(raw);
    let loaded = await load(actor,workId);
    const { candidate } = exact(loaded,{ expectedRevision: input.expectedRevision, candidateRevision: input.candidateRevision, candidateContentHash: input.candidateContentHash });
    if (!documents.publishToLinkedTenant) throw new WorkspaceStoreError("Publishing onto an existing site is unavailable.");
    if (loaded.rebuild.status !== "approved" && loaded.rebuild.status !== "published") throw new WorkspaceConflictError("Approve the exact current preview before publishing it onto your site.");
    if (loaded.rebuild.approvedCandidateRevision !== candidate.revision) throw new WorkspaceConflictError("Approve the exact current preview before publishing it onto your site.");
    const providerUrl = `${tenantHostedBaseUrl(input.tenantId)}/`;
    const receipt: WebsiteLaunchReceipt = websiteLaunchReceiptSchema.parse({ status: "published", provider: "strelva-hosted", providerUrl, receiptId: `hosted-${createHash("sha256").update(`${workId}:${input.tenantId}:${candidate.revision}:${candidate.contentHash}`).digest("hex").slice(0,32)}`, artifactHash: candidate.contentHash, candidateRevision: candidate.revision, publishedAt: now(), evidence: "The approved immutable site document is the linked tenant's published revision." });
    const prior = await documents.published(input.tenantId);
    const replay = prior?.workId === workId && prior.revision === candidate.revision && prior.contentHash === candidate.contentHash && prior.receipt;
    // Recheck new publication authority, but never turn an accepted replay
    // into another publish because a visitor connection was later revoked.
    if (!replay) await assertCurrentCapabilities(actor,loaded);
    const linked = replay && documents.linkedPublications ? (await documents.linkedPublications(actor,{ workspaceId: loaded.work.workspaceId, workId })).find(item => item.revision === candidate.revision && item.contentHash === candidate.contentHash) : undefined;
    const row = replay && linked ? { ...prior, priorDeliveryModel: linked.priorDeliveryModel, fallbackUntil: linked.fallbackUntil } : await documents.publishToLinkedTenant(actor,{ workspaceId: loaded.work.workspaceId, workId, revision: candidate.revision, contentHash: candidate.contentHash, tenantId: input.tenantId, receipt });
    const committedReceipt = row.receipt ?? receipt;
    const tenantId = row.tenantId ?? input.tenantId;
    // The publication is committed. Nothing after this point can make it retryable.
    if (!replay || loaded.rebuild.status !== "published" || loaded.rebuild.launch.receipt?.receiptId !== committedReceipt.receiptId) loaded = await update(actor,loaded,"published_onto_linked_site",{ status: "published", tenantId, launch: { receipt: committedReceipt, readBack: { status: "pending", checkedAt: now(), message: "Published; checking the public site." } } });
    try { await invalidatePublishedSiteDocument(tenantId); await (dependencies.revalidate ?? (async () => { revalidatePath("/","layout"); }))(); } catch { /* Cache and read-back are separate from the publication. */ }
    const readUrl = committedReceipt.providerUrl;
    let readBack: WebsiteRebuild["launch"]["readBack"] = loaded.rebuild.launch.readBack;
    if (!replay) try {
      readBack = dependencies.checkLive ? await dependencies.checkLive(row,readUrl) : await (async () => { const result = await checkWebsiteHealth({ workspaceId: row.workspaceId, workId, tenantId, revision: row.revision, contentHash: row.contentHash, url: readUrl }); return { status: result.status === "healthy" ? "verified" as const : "failed" as const, checkedAt: result.checkedAt, message: result.status === "healthy" ? "The public site matches the published document." : "Published, but we couldn't confirm the public document yet." }; })();
    } catch { readBack = { status: "failed", checkedAt: now(), message: "Published, but we couldn't confirm the public document yet." }; }
    if (!replay) loaded = await update(actor,loaded,"hosted_read_back",{ launch: { receipt: committedReceipt, readBack } });
    const redirects = candidate.document.redirects.length;
    const cutover: WebsiteCutoverItem[] = [
      { id: "document_published", status: "done", label: `Published revision ${row.revision} at ${tenantHostedBaseUrl(tenantId)}.` },
      { id: "read_back", status: readBack?.status === "verified" ? "done" : readBack?.status === "failed" ? "failed" : "waiting", label: readBack?.message ?? "Not checked yet." },
      { id: "domain_moved", status: "waiting", label: "Your domain still points at the old site. Moving it is a DNS step you approve; Strelva prepares the exact records." },
      { id: "old_project_kept", status: "waiting", label: `Your old site's project is kept as a fallback until ${row.fallbackUntil.slice(0,10)}. Strelva never removes it automatically.` },
      { id: "redirects_live", status: redirects ? "done" : "not_needed", label: redirects ? `${redirects} redirect${redirects === 1 ? "" : "s"} from old addresses are served by the new site.` : "No old addresses needed redirects." },
    ];
    return { ...present(loaded), cutover, priorDeliveryModel: row.priorDeliveryModel, fallbackUntil: row.fallbackUntil };
  }
  async function patch(actor: WorkspaceActor, workId: string, raw: unknown) {
    const input = rebuildSelectionSchema.extend({ ops: z.unknown(), forceReview: z.boolean().optional() }).strict().parse(raw);
    const loaded = await load(actor,workId); const { candidate } = exact(loaded,{ expectedRevision: input.expectedRevision, candidateRevision: input.candidateRevision, candidateContentHash: input.candidateContentHash });
    await store.member(actor,loaded.work.workspaceId);
    const modelOptions = await (await import("./rebuild-runtime")).configuredWebsitePatchOptions({
      actor, workspaceId: loaded.work.workspaceId, workId, document: candidate.document, ops: input.ops,
      recheck: () => store.member(actor,loaded.work.workspaceId).then(() => undefined),
    });
    const prepared = await prepareSitePatch({ document: candidate.document, ops: input.ops, forceReview: input.forceReview, ...modelOptions });
    if (prepared.governance.action === "block") throw new WorkspaceConflictError(prepared.governance.reason);
    return present(await saveCandidate(actor,loaded,prepared.document,"site_patched"));
  }
  async function undo(actor: WorkspaceActor, workId: string, raw: unknown) {
    const input = rebuildSelectionSchema.extend({ targetRevision: z.number().int().positive() }).strict().parse(raw);
    const loaded = await load(actor,workId); exact(loaded,{ expectedRevision: input.expectedRevision, candidateRevision: input.candidateRevision, candidateContentHash: input.candidateContentHash });
    const previous = await documents.read(actor,{ workspaceId: loaded.work.workspaceId, workId, revision: input.targetRevision });
    if (!previous || previous.revision >= input.candidateRevision) throw new WorkspaceConflictError("Choose an earlier saved revision to undo to.");
    return present(await saveCandidate(actor,loaded,prepareSiteUndo(previous.document).document,"site_undo_requested",true));
  }
  async function domain(actor: WorkspaceActor, workId: string, raw?: unknown) {
    const loaded = await load(actor,workId); const tenantId = await routeTenant(actor,loaded);
    if (!tenantId || !loaded.rebuild.launch.receipt) return { domain: null, domains: [] };
    if (raw === undefined) return (dependencies.domainRead ?? readHostedDomains)(tenantId);
    const input = z.object({ expectedRevision: z.number().int().nonnegative(), domain: z.string().trim().min(1).max(253), action: z.enum(["attach","refresh","approve"]) }).strict().parse(raw);
    if (input.expectedRevision !== loaded.rebuild.revision) throw new WorkspaceConflictError("Reload the website before changing its domain.");
    const published = await documents.published(tenantId);
    if (!published || published.workId !== workId || published.workspaceId !== loaded.work.workspaceId) throw new WorkspaceAccessError();
    await store.member(actor,loaded.work.workspaceId);
    const key = { workspaceId: loaded.work.workspaceId, workId, tenantId };
    const hostname = normalizeCustomDomain(input.domain) ?? input.domain.toLowerCase();
    if (input.action === "approve") {
      // The owner decides the exact hostname; Strelva may then do the work.
      if (!documents.approveDomain) throw new WorkspaceStoreError("Domain approvals are unavailable.");
      const approved = await documents.approveDomain(actor,{ ...key, hostname });
      return { approved };
    }
    // The actual published revision carries the authority check: the owner as
    // before, or a Strelva operator on this owner's approval of this hostname.
    // A new unapproved draft neither grants nor removes domain authority.
    const action = input.action;
    const authorize = documents.authorizeDomain
      ? async () => { await documents.authorizeDomain!(actor,{ ...key, hostname, action }); }
      : () => documents.managePublishedTenant(actor,key);
    await authorize();
    return (dependencies.domainChange ?? changeHostedDomain)(tenantId,{ domain: input.domain, action },{ authorizeWrite: authorize });
  }
  async function initializeHandoff(actor: WorkspaceActor, accepted: AcceptedHandoff) {
    const loaded = await load(actor,accepted.customerWorkId);
    if (loaded.work.workspaceId !== accepted.customerWorkspaceId || loaded.rebuild.status === "published" || loaded.rebuild.tenantId) throw new WorkspaceConflictError("Only a private rebuild can be accepted into another business.");
    if (loaded.rebuild.candidate) return present(loaded);
    const copied = await documents.read(actor,{ workspaceId: accepted.customerWorkspaceId, workId: accepted.customerWorkId });
    if (!copied) throw new WorkspaceStoreError("The accepted website document could not be loaded. Reopen the handoff to finish receiving it.");
    const document = structuredClone(copied.document);
    for (const fact of Object.values(document.facts)) if (fact.origin === "owner_confirmed") { fact.origin = fact.sources.length ? "source" : "owner_stated"; fact.verification = { supported: false, confidence: 0 }; }
    for (const node of Object.values(document.nodes)) if (node.verification?.highRisk) node.verification = { ...node.verification, needsReview: true };
    return present(await saveCandidate(actor,loaded,siteDocumentSchema.parse(document),"agency_handoff_received"));
  }
  async function connectCapabilities(actor: WorkspaceActor, workId: string, raw: unknown) {
    const input = connectWebsiteCapabilitiesInputSchema.parse(raw); const loaded = await load(actor,workId);
    if (loaded.rebuild.revision !== input.expectedRevision || !loaded.rebuild.candidate) throw new WorkspaceConflictError("Reload the current website preview before connecting visitor tools.");
    await store.member(actor,loaded.work.workspaceId);
    const currentTenant = input.selection ? await routeTenant(actor,loaded) : null;
    if (input.selection && (!currentTenant || input.selection.tenantId !== currentTenant)) throw new WorkspaceConflictError("Publish this hosted website first, then connect visitor tools belonging to its own business and tenant.");
    const projection = input.selection ? await (dependencies.resolveCapabilities ?? resolvePublishedWebsiteCapabilities)(actor,loaded.work.workspaceId,workId,input.selection) : undefined;
    if (input.selection && !projection) throw new WorkspaceConflictError("This visitor-tool grant is no longer available. Choose a current published connection.");
    const document = structuredClone(loaded.rebuild.candidate.document);
    if (projection) document.capabilities = projection; else delete document.capabilities;
    if (projection?.booking && !Object.values(document.nodes).some(node => node.type === "Booking")) {
      const page = document.pages.find(page => page.path === "/contact") ?? document.pages[0]!;
      document.nodes.native_booking = { id: "native_booking", type: "Booking", variant: "inline", props: { title: "Book a time" }, children: [], factIds: [] };
      document.nodes[page.root]!.children.push("native_booking");
    }
    const rebuild = { ...loaded.rebuild }; if (input.selection) rebuild.publishedCapabilitySelection = input.selection; else delete rebuild.publishedCapabilitySelection;
    return present(await saveCandidate(actor,{ ...loaded,rebuild },siteDocumentSchema.parse(document),"visitor_tools_connected"));
  }
  async function capabilityOptions(actor: WorkspaceActor,workId: string) { const loaded = await load(actor,workId); return listPublishedWebsiteCapabilityOptions(actor,loaded.work.workspaceId,workId); }
  async function prepareExistingPages(actor: WorkspaceActor, workId: string, raw: unknown) {
    const input = rebuildSelectionSchema.extend({ candidate: askExistingPagesSchema }).strict().parse(raw);
    const loaded = await load(actor, workId);
    const { candidate } = exact(loaded, { expectedRevision: input.expectedRevision, candidateRevision: input.candidateRevision, candidateContentHash: input.candidateContentHash });
    await documents.manage(actor, { workspaceId: loaded.work.workspaceId, workId });
    const tenantId = await routeTenant(actor, loaded);
    const published = tenantId ? await documents.published(tenantId) : null;
    if (loaded.rebuild.status !== "published" || !published || published.workspaceId !== loaded.work.workspaceId || published.workId !== workId || published.revision !== candidate.revision || published.contentHash !== candidate.contentHash || siteDocumentHash(published.document) !== candidate.contentHash) throw new WorkspaceConflictError("An alternative needs the unchanged published native website. Finish any existing draft first.");
    if (candidate.document.capabilities) {
      const projection = await (dependencies.resolveCapabilities ?? resolvePublishedWebsiteCapabilities)(actor, loaded.work.workspaceId, workId, loaded.rebuild.publishedCapabilitySelection, { requireConnectedCalendar: true });
      if (!projection || JSON.stringify(projection) !== JSON.stringify(candidate.document.capabilities)) throw new WorkspaceConflictError("The website's executable connections changed. Reconnect them before preparing an alternative.");
    }
    const prepared = await prepareSitePatch({ document: candidate.document, ops: existingWebsitePageOperations(candidate.document, input.candidate), forceReview: true });
    if (prepared.governance.action === "block") throw new WorkspaceConflictError(prepared.governance.reason);
    return present(await saveCandidate(actor, loaded, prepared.document, "ask_existing_pages_prepared"));
  }
  async function prepareBookingPage(actor: WorkspaceActor, workId: string, raw: unknown) {
    const input = rebuildSelectionSchema.extend({ selection: connectWebsiteCapabilitiesInputSchema.shape.selection.unwrap(), path: z.string().min(1).max(80), title: z.string().min(1).max(70), description: z.string().max(160) }).strict().parse(raw);
    const loaded = await load(actor, workId);
    const { candidate } = exact(loaded, { expectedRevision: input.expectedRevision, candidateRevision: input.candidateRevision, candidateContentHash: input.candidateContentHash });
    await documents.manage(actor, { workspaceId: loaded.work.workspaceId, workId });
    const tenantId = await routeTenant(actor, loaded);
    const published = tenantId ? await documents.published(tenantId) : null;
    if (!tenantId || input.selection.tenantId !== tenantId || !published || published.workId !== workId || published.revision !== candidate.revision || published.contentHash !== candidate.contentHash) throw new WorkspaceConflictError("A booking page needs the unchanged published native website. Finish any existing draft first.");
    const projection = await (dependencies.resolveCapabilities ?? resolvePublishedWebsiteCapabilities)(actor, loaded.work.workspaceId, workId, input.selection, { requireConnectedCalendar: true });
    if (!projection?.booking || !projection.inquiry || projection.tenant !== tenantId) throw new WorkspaceConflictError("The site's booking and inquiry connections must both be published and current.");
    const document = structuredClone(candidate.document);
    if (document.pages.some(page => page.path === input.path) || document.pages.length >= 12) throw new WorkspaceConflictError("Choose a new page address within the website's page limit.");
    const suffix = createHash("sha256").update(input.path).digest("hex").slice(0,12);
    const root = `ask_booking_page_${suffix}`;
    const heading = `ask_booking_heading_${suffix}`;
    const booking = `ask_booking_form_${suffix}`;
    if ([root, heading, booking].some(id => document.nodes[id])) throw new WorkspaceConflictError("This page already has a prepared candidate.");
    const header = Object.values(document.nodes).find(node => node.type === "Header");
    const footer = Object.values(document.nodes).find(node => node.type === "Footer");
    document.nodes[heading] = { id: heading, type: "PageHeader", variant: "standard", props: { title: input.title, body: input.description }, children: [], factIds: [] };
    document.nodes[booking] = { id: booking, type: "Booking", variant: "inline", props: { title: input.title }, children: [], factIds: [] };
    document.nodes[root] = { id: root, type: "Section", variant: "container", props: {}, children: [...(header ? [header.id] : []), heading, booking, ...(footer ? [footer.id] : [])], factIds: [] };
    if (header?.type === "Header") header.props.links = [...(header.props.links ?? []), { label: input.title.slice(0,40), href: input.path }];
    document.pages.push({ path: input.path, title: input.title, description: input.description, root });
    document.capabilities = projection;
    const prepared = await prepareSitePatch({ document: candidate.document, ops: [
      ...[root, heading, booking].map(id => ({ op: "add", path: `/nodes/${id}`, value: document.nodes[id] })),
      ...(header ? [{ op: "replace", path: `/nodes/${header.id}`, value: header }] : []),
      { op: "add", path: "/pages/-", value: document.pages.at(-1) },
    ], forceReview: true });
    if (prepared.governance.action === "block") throw new WorkspaceConflictError(prepared.governance.reason);
    // Only the server-resolved same-tenant grant can supply capabilities.
    prepared.document.capabilities = projection;
    return present(await saveCandidate(actor, { ...loaded, rebuild: { ...loaded.rebuild, publishedCapabilitySelection: input.selection } }, siteDocumentSchema.parse(prepared.document), "ask_booking_page_prepared"));
  }
  return { create, read, list, retry, resolveFact, resolveCopyReview, approve, launch, publishOntoLinkedTenant, patch, undo, domain, initializeHandoff, connectCapabilities, capabilityOptions, prepareBookingPage, prepareExistingPages };
}
export const websiteRebuildService = createWebsiteRebuildService();
export const createWebsiteRebuild = websiteRebuildService.create;
export const readWebsiteRebuild = websiteRebuildService.read;
export const listWebsiteRebuilds = websiteRebuildService.list;
export const retryWebsiteRebuild = websiteRebuildService.retry;
export const resolveWebsiteRebuildFact = websiteRebuildService.resolveFact;
export const resolveWebsiteRebuildCopyReview = websiteRebuildService.resolveCopyReview;
export const approveWebsiteRebuild = websiteRebuildService.approve;
export const launchWebsiteRebuild = websiteRebuildService.launch;
export const patchWebsiteRebuild = websiteRebuildService.patch;
export const prepareExistingWebsitePages = websiteRebuildService.prepareExistingPages;
export const prepareWebsiteBookingPage = websiteRebuildService.prepareBookingPage;
export const publishWebsiteRebuildOntoLinkedSite = websiteRebuildService.publishOntoLinkedTenant;
export const undoWebsiteRebuild = websiteRebuildService.undo;
export const websiteRebuildDomain = websiteRebuildService.domain;
export const initializeRebuildHandoff = websiteRebuildService.initializeHandoff;
export const connectWebsiteRebuildCapabilities = websiteRebuildService.connectCapabilities;
export const listWebsiteRebuildCapabilityOptions = websiteRebuildService.capabilityOptions;

export { readPublishedWebsiteContent } from "./site-health";
export const approveWebsiteDomainRequest: typeof import("./domain-requests").websiteDomainRequestService.approve = (...args) => import("./domain-requests").then(module => module.websiteDomainRequestService.approve(...args));
/** Owner-link launch uses the same lifecycle, with only reserve/publish RPCs specialized. */
export function launchWebsiteRebuildByOwnerLink(actor: WorkspaceActor, workId: string, raw: unknown, session: OwnerLinkWebsiteSession) {
  return createWebsiteRebuildService(boundedStore, { documents: createWebsiteDocumentStore(undefined, session) }).launch(actor, workId, raw);
}
