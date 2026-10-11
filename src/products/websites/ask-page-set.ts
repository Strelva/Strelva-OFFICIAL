import { createHash } from "node:crypto";
import { z } from "zod";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { createWebsiteRebuildService } from "./rebuild-service";
import { safeSitePathSchema, siteDocumentSchema, type CatalogNode } from "./site-document";
import type { RebuildResult } from "./rebuild-pipeline";
import { websiteRebuildReleasedFor } from "./rebuild-release";

/** Closed native catalog: no scripts, integrations, visitor records or outside writes. */
export const askPageSetSchema = z.object({
  kind: z.literal("website-pages"),
  pages: z.array(z.object({
    path: safeSitePathSchema.max(80),
    title: z.string().trim().min(1).max(70),
    description: z.string().trim().max(160),
    paragraphs: z.array(z.string().trim().min(1).max(600)).min(1).max(8),
  }).strict()).min(1).max(6),
}).strict();
export type AskPageSet = z.infer<typeof askPageSetSchema>;

/** Agent-written copy is always owner-reviewed, never disguised as a business fact. */
export function composeAskPageSet(name: string, raw: unknown): RebuildResult {
  const input = askPageSetSchema.parse(raw);
  const nodes: Record<string, CatalogNode> = {};
  const review = { supported: false, confidence: 0, needsReview: true };
  nodes.header = { id: "header", type: "Header", variant: "logo-left", props: { brand: name, links: input.pages.map(page => ({ label: page.title.slice(0, 40), href: page.path })) }, children: [], factIds: [], verification: review };
  const pages = input.pages.map((page, index) => {
    const heading = `heading_${index}`;
    nodes[heading] = { id: heading, type: "PageHeader", variant: "standard", props: { title: page.title, body: page.description }, children: [], factIds: [], verification: review };
    const paragraphs = page.paragraphs.map((text, paragraph) => {
      const id = `copy_${index}_${paragraph}`;
      nodes[id] = { id, type: "RichText", variant: "standard", props: { text }, children: [], factIds: [], verification: review };
      return id;
    });
    const root = `page_${index}`;
    nodes[root] = { id: root, type: "Section", variant: "container", props: {}, children: ["header", heading, ...paragraphs], factIds: [] };
    return { path: page.path, title: page.title, description: page.description, root };
  });
  const document = siteDocumentSchema.parse({ version: 2, siteName: name, theme: { palette: "light", typeScale: "standard" }, pages, nodes, facts: {}, assets: {}, redirects: [], provenance: { composer: "rules" } });
  const facts = { name, nameFactId: "", facts: {}, services: [], people: [], contact: [], hours: [], locations: [], reviews: [], claims: [], brandColors: [], oldPaths: [], sourcePages: [] };
  const content = { writer: "model" as const, pages: input.pages.map(page => ({ path: page.path, title: page.title, sourceIds: [], blocks: page.paragraphs.map((text, index) => ({ id: `paragraph_${index}`, type: "paragraph" as const, text, factIds: [] })) })) };
  return { document, facts, content, events: [], pageMapping: [], checkpoint: { version: 1, inputHash: createHash("sha256").update(JSON.stringify(input)).digest("hex"), document, completedStages: ["write", "compose", "verify"], events: [] }, summary: { pages: pages.length, facts: 0, supported: 0, needsReview: Object.values(nodes).filter(node => node.verification?.needsReview).length, highRisk: 0 } };
}

/** Uses the normal durable native draft, preview, review and publication machinery. */
export async function prepareAskPageSet(actor: WorkspaceActor, input: { workspaceId: string; name: string; requestId: string; candidate: unknown }, dependencies: {
  released?: typeof websiteRebuildReleasedFor;
  create?: ReturnType<typeof createWebsiteRebuildService>["create"];
} = {}) {
  // Before native membership, Work, document, rate-limit or publication storage.
  if (!await (dependencies.released ?? websiteRebuildReleasedFor)(actor, input.workspaceId)) throw new Error("Website page-set preparation is not enabled for this business.");
  const composed = composeAskPageSet(input.name, input.candidate);
  const create = dependencies.create ?? (await import("./rebuild-service")).createWebsiteRebuildService(undefined, { pipeline: async () => composed }).create;
  const record = await create(actor, input.workspaceId, { requestId: input.requestId, businessName: input.name, description: `Prepared page set ${composed.checkpoint.inputHash}` });
  if (!record.rebuild.candidate || record.rebuild.status !== "review_ready") throw new Error("The page set could not be prepared.");
  return record;
}
