import { describe, it, expect } from "vitest";
import { siteDocumentSchema, SITE_MAX_EXPANDED_NODES_PER_PAGE, type SiteDocument } from "@/products/websites/site-document";
import { sitePageTree, type SiteTree } from "@/products/websites/site-render-tree";
import { applySitePatch } from "@/products/websites/site-operations";

/** Audit finding 2 (Oct 5): 14 shared-reference nodes in about 1.7 KB rendered 20,480 elements. */
function amplified(levels = 13): SiteDocument {
  const nodes: Record<string, unknown> = {};
  for (let i = 0; i < levels; i += 1) nodes[`n${i}`] = { id: `n${i}`, type: "Section", variant: "container", props: { title: "x" }, children: [`n${i + 1}`, `n${i + 1}`], factIds: [] };
  nodes[`n${levels}`] = { id: `n${levels}`, type: "RichText", variant: "standard", props: { text: "x" }, children: [], factIds: [] };
  return { version: 2, siteName: "Amplified", theme: { palette: "light", typeScale: "standard" }, pages: [{ path: "/", title: "Home", description: "d", root: "n0" }], nodes, facts: {}, assets: {}, redirects: [], provenance: { composer: "rules" } } as unknown as SiteDocument;
}
function count(tree: SiteTree): number { return typeof tree === "string" ? 0 : 1 + tree.children.reduce((sum, child) => sum + count(child), 0); }

describe("bounded website expansion", () => {
  it("rejects a small document whose shared references expand past the per-page bound", () => {
    const doc = amplified();
    expect(Object.keys(doc.nodes)).toHaveLength(14);
    expect(JSON.stringify(doc).length).toBeLessThan(2000);
    const parsed = siteDocumentSchema.safeParse(doc);
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain("expands");
  });

  it("refuses to render an over-expanded tree even when schema validation was bypassed", () => {
    expect(() => sitePageTree(amplified())).toThrow(/expands/);
  });

  it("keeps legitimate reuse, such as one header shared across pages", () => {
    const doc = amplified(3);
    doc.nodes.header = { id: "header", type: "Header", variant: "logo-left", props: { brand: "Shared" }, children: [], factIds: [] };
    doc.nodes.about = { id: "about", type: "Section", variant: "container", props: { title: "About" }, children: ["header"], factIds: [] };
    doc.nodes.n0!.children.unshift("header");
    doc.pages.push({ path: "/about", title: "About", description: "d", root: "about" });
    const parsed = siteDocumentSchema.safeParse(doc);
    expect(parsed.success).toBe(true);
    expect(count(sitePageTree(parsed.data!))).toBeLessThan(SITE_MAX_EXPANDED_NODES_PER_PAGE);
    expect(count(sitePageTree(parsed.data!, "/about"))).toBeGreaterThan(1);
  });

  it("rejects a patch that turns a valid document into an amplified one", () => {
    const base = siteDocumentSchema.parse(amplified(3));
    const ops = Array.from({ length: 11 }, (_, i) => ({ op: "add", path: `/nodes/m${i}`, value: { id: `m${i}`, type: "Section", variant: "container", props: { title: "x" }, children: i === 10 ? [] : [`m${i + 1}`, `m${i + 1}`], factIds: [] } }));
    expect(() => applySitePatch(base, [...ops, { op: "replace", path: "/nodes/n3/children", value: ["m0", "m0"] }])).toThrow(/expands/);
  });
});
