import { AskPossibilityUnsupportedError, type AskPossibilityInput } from "@/platform/ask/ports";
import { listBusinessSystems, type SystemListing } from "@/platform/systems/from-existing";
import { createSupabaseSystemStore } from "@/platform/systems/supabase-store";
import { systemOriginId } from "@/platform/systems";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { readWebsiteRebuild, prepareExistingWebsitePages, websiteRebuildReleasedFor } from "@/products/websites/index";

async function target(actor: WorkspaceActor, workspaceId: string, systemId: string): Promise<SystemListing | undefined> {
  const listing = await listBusinessSystems(actor, workspaceId, { store: createSupabaseSystemStore() });
  return listing.systems.find(item => item.system.id === systemId || item.references.tenantStableId && systemOriginId(workspaceId, { kind: "tenant", ref: item.references.tenantStableId }) === systemId);
}

/** Reuses the existing native Work and publication authority, never a projected baseline. */
export async function prepareExistingAskWebsitePages(actor: WorkspaceActor, input: AskPossibilityInput, dependencies: {
  released?: typeof websiteRebuildReleasedFor; target?: typeof target; read?: typeof readWebsiteRebuild; prepare?: typeof prepareExistingWebsitePages;
} = {}) {
  if (!await (dependencies.released ?? websiteRebuildReleasedFor)(actor, input.workspaceId)) throw new AskPossibilityUnsupportedError("Website alternatives are not enabled for this business.");
  if (input.candidate?.kind !== "existing-website-pages" || !input.systemId) throw new AskPossibilityUnsupportedError("Choose one unchanged native website for this alternative.");
  if (/\b(book(?:ing)?|appointments?|intake|forms?|payments?|checkout|reservations?|applications?)\b/i.test(input.candidate.pages.map(page => [page.title, page.description, ...page.paragraphs].join(" ")).join(" "))) throw new AskPossibilityUnsupportedError("New visitor actions need their own executable Connection; informational copy cannot substitute for a working flow.");
  const site = await (dependencies.target ?? target)(actor, input.workspaceId, input.systemId);
  const workId = site?.references.savedWorkId;
  const pointer = site?.system.currentRevision;
  if (!site || site.provenance !== "stored" || site.system.kind !== "website" || site.system.businessId !== input.workspaceId || !workId || !pointer || pointer.businessId !== input.workspaceId || pointer.systemId !== site.system.id || !site.references.tenantId || !site.references.tenantStableId) throw new AskPossibilityUnsupportedError("This website has no stored native baseline for a safe alternative. Strelva needs to prepare that first.");
  const record = await (dependencies.read ?? readWebsiteRebuild)(actor, workId);
  if (record.workspaceId !== input.workspaceId || record.rebuild.status !== "published" || !record.rebuild.candidate) throw new AskPossibilityUnsupportedError("Finish the website's current draft before opening another alternative.");
  const candidate = record.rebuild.candidate;
  const prepared = await (dependencies.prepare ?? prepareExistingWebsitePages)(actor, workId, { expectedRevision: record.rebuild.revision, candidateRevision: candidate.revision, candidateContentHash: candidate.contentHash, candidate: input.candidate });
  const next = prepared.rebuild.candidate!;
  const content = { kind: "ask-existing-website-pages", mode: input.candidate.mode, rebuildWorkId: workId, contextSystemId: site.system.id, candidateRevision: next.revision, candidateContentHash: next.contentHash, document: next.document, originalWords: input.words?.slice(0,3000) ?? input.intent, askOrigin: input.origin ?? null, askedOnBehalf: input.askedOnBehalf ?? null };
  return { content, previewHref: next.previewHref,
    changes: [{ baseline: pointer, candidate: { summary: input.introduces?.summary ?? input.title, content } }],
    effects: [{ id: "publish-website-alternative", kind: "publish" as const, channel: "hosted_website" as const, system: { systemId: site.system.id }, description: `Publish ${input.title}`, request: { workId, candidateRevision: next.revision, candidateContentHash: next.contentHash }, after: [] }],
  };
}
