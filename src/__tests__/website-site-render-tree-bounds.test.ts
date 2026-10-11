import { describe, expect, it } from "vitest";
import { siteDocumentSchema } from "@/products/websites/site-document";
import { sitePageTree, type SiteTree } from "@/products/websites/site-render-tree";

function countElements(tree: SiteTree): number {
  if (typeof tree === "string") return 0;
  return 1 + tree.children.reduce((sum, child) => sum + countElements(child), 0);
}

function exponentiallySharedDocument() {
  const levels = 15;
  const nodes = Object.fromEntries(Array.from({ length: levels }, (_, index) => {
    const id = `node${index}`;
    const children = index === levels - 1 ? [] : [`node${index + 1}`, `node${index + 1}`];
    return [id, {
      id,
      type: "Section",
      variant: "container",
      props: index === levels - 1 ? { title: "Leaf" } : {},
      children,
    }];
  }));

  return {
    version: 2,
    siteName: "Example business",
    theme: { palette: "light", typeScale: "standard" },
    pages: [{ path: "/", title: "Example business", description: "An example.", root: "node0" }],
    nodes,
    facts: {},
    assets: {},
    redirects: [],
    provenance: { composer: "rules" },
  };
}

function boundedDocument(extraSharedChild = false) {
  const nodes: Record<string, unknown> = {
    root: { id: "root", type: "Section", variant: "container", props: {}, children: ["group0", "group1", "group2"] },
  };
  const leafCounts = [166, 165, 165];
  let leafIndex = 0;

  leafCounts.forEach((count, groupIndex) => {
    const children = Array.from({ length: count }, (_, index) => `leaf${leafIndex + index}`);
    if (extraSharedChild && groupIndex === 0) children.push("leaf0");
    nodes[`group${groupIndex}`] = { id: `group${groupIndex}`, type: "Section", variant: "container", props: {}, children };
    children.slice(0, count).forEach((id) => {
      nodes[id] = { id, type: "Section", variant: "container", props: { title: "Leaf" }, children: [] };
    });
    leafIndex += count;
  });

  return {
    version: 2,
    siteName: "Example business",
    theme: { palette: "light", typeScale: "standard" },
    pages: [{ path: "/", title: "Example business", description: "An example.", root: "root" }],
    nodes,
    facts: {},
    assets: {},
    redirects: [],
    provenance: { composer: "rules" },
  };
}

describe("website render tree bounds", () => {
  it("keeps ordinary shared subtrees renderable", () => {
    const input = {
      version: 2,
      siteName: "Example business",
      theme: { palette: "light", typeScale: "standard" },
      pages: [{ path: "/", title: "Example business", description: "An example.", root: "root" }],
      nodes: {
        root: { id: "root", type: "Section", variant: "container", props: {}, children: ["shared", "shared"] },
        shared: { id: "shared", type: "Section", variant: "container", props: { title: "Shared section" }, children: [] },
      },
      facts: {},
      assets: {},
      redirects: [],
      provenance: { composer: "rules" },
    };
    const document = siteDocumentSchema.parse(input);

    expect(countElements(sitePageTree(document))).toBe(6);
  });

  it("accepts the full 500-node catalog and rejects a 501st rendered occurrence", () => {
    expect(siteDocumentSchema.parse(boundedDocument())).toBeDefined();
    expect(() => siteDocumentSchema.parse(boundedDocument(true))).toThrow(/rendered sections/i);
  });

  it("rejects a small document whose shared children expand exponentially", () => {
    const input = exponentiallySharedDocument();

    // Fifteen catalog nodes occupy a few kilobytes, but expanding each repeated
    // child occurrence creates 49,152 rendered elements.
    expect(Object.keys(input.nodes)).toHaveLength(15);
    expect(JSON.stringify(input).length).toBeLessThan(5_000);
    expect(() => siteDocumentSchema.parse(input)).toThrow(/rendered sections/i);
  });
});
