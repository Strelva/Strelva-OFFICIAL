import { createHash } from "node:crypto";
import { z } from "zod";
import { safeSitePathSchema, type SiteDocument, type CatalogNode } from "./site-document";
import type { SitePatchOperation } from "./site-operations";

const page = z.object({ path: safeSitePathSchema.max(80), title: z.string().trim().min(1).max(70), description: z.string().trim().max(160), paragraphs: z.array(z.string().trim().min(1).max(600)).min(1).max(8) }).strict();
/** Model supplies copy only. It cannot supply evidence, assets, theme or capabilities. */
export const askExistingPagesSchema = z.object({ kind: z.literal("existing-website-pages"), mode: z.enum(["section", "page-set", "rebuild"]), pages: z.array(page).min(1).max(6) }).strict();
export type AskExistingPages = z.infer<typeof askExistingPagesSchema>;

/** Keep every original route and executable page; rebuild only informational roots. */
export function existingWebsitePageOperations(document: SiteDocument, raw: unknown): SitePatchOperation[] {
  const input = askExistingPagesSchema.parse(raw);
  const paths = input.pages.map(page => page.path);
  if (new Set(paths).size !== paths.length) throw new Error("Choose distinct page addresses.");
  const actionable = (root: string): boolean => {
    const node = document.nodes[root]!;
    return node.type === "Booking" || node.type === "InquiryForm" || node.children.some(actionable);
  };
  if (input.mode === "section" && (input.pages.length !== 1 || !document.pages.some(page => page.path === paths[0]))) throw new Error("A section needs one existing page address.");
  if (input.mode === "page-set" && (paths.some(path => document.pages.some(page => page.path === path)) || document.pages.length + paths.length > 12)) throw new Error("A page set needs new addresses within the site's page limit.");
  if (input.mode === "rebuild") {
    const informational = document.pages.filter(page => !actionable(page.root));
    if (!informational.length || informational.some(page => !paths.includes(page.path)) || paths.some(path => !informational.some(page => page.path === path))) throw new Error("A rebuild must cover every existing informational page and leave executable pages unchanged.");
  }
  const header = Object.values(document.nodes).find(node => node.type === "Header");
  const footer = Object.values(document.nodes).find(node => node.type === "Footer");
  const ops: SitePatchOperation[] = [];
  for (const page of input.pages) {
    const suffix = createHash("sha256").update(JSON.stringify(page)).digest("hex").slice(0,12);
    const prefix = `ask_pages_${suffix}`;
    const nodes: CatalogNode[] = [ { id: `${prefix}_heading`, type: "PageHeader", variant: "standard", props: { title: page.title, body: page.description }, children: [], factIds: [] },
      ...page.paragraphs.map((text, index): CatalogNode => ({ id: `${prefix}_copy_${index}`, type: "RichText", variant: "standard", props: { text }, children: [], factIds: [] })) ];
    if (input.mode === "section") {
      const existing = document.pages.find(value => value.path === page.path)!;
      const root = structuredClone(document.nodes[existing.root]!);
      const at = footer ? root.children.indexOf(footer.id) : -1;
      root.children.splice(at < 0 ? root.children.length : at, 0, ...nodes.map(node => node.id));
      ops.push(...nodes.map(node => ({ op: "add" as const, path: `/nodes/${node.id}`, value: node })), { op: "replace", path: `/nodes/${root.id}`, value: root });
    } else {
      const root: CatalogNode = { id: `${prefix}_root`, type: "Section", variant: "container", props: {}, children: [...(header ? [header.id] : []), ...nodes.map(node => node.id), ...(footer ? [footer.id] : [])], factIds: [] };
      nodes.push(root);
      const index = document.pages.findIndex(value => value.path === page.path);
      ops.push(...nodes.map(node => ({ op: "add" as const, path: `/nodes/${node.id}`, value: node })), { op: index < 0 ? "add" : "replace", path: index < 0 ? "/pages/-" : `/pages/${index}`, value: { path: page.path, title: page.title, description: page.description, root: root.id } });
    }
    if (nodes.some(node => document.nodes[node.id])) throw new Error("This page copy already has a prepared candidate.");
  }
  if (input.mode === "page-set" && header?.type === "Header") ops.push({ op: "replace", path: `/nodes/${header.id}`, value: { ...header, props: { ...header.props, links: [...(header.props.links ?? []), ...input.pages.map(page => ({ label: page.title.slice(0,40), href: page.path }))] } } });
  return ops;
}
