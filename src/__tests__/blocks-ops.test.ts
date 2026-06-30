import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SitePageConfig } from "@/lib/types";

const mockGetDraft = vi.hoisted(() => vi.fn());
const mockGetPage = vi.hoisted(() => vi.fn());
const mockSetDraft = vi.hoisted(() => vi.fn());

vi.mock("@/lib/storage", () => ({
  getDraftPageConfig: mockGetDraft,
  getPageConfig: mockGetPage,
  setDraftPageConfig: mockSetDraft,
}));

import { listBlocks, addBlock, updateBlock, removeBlock } from "@/lib/blocks/ops";

function cfgWith(): SitePageConfig {
  return {
    home: {
      sections: [
        { type: "hero", visible: true, order: 0 }, // template section
        { type: "block:heading", visible: true, order: 1, props: { text: "Hi", level: 2, align: "left" } },
        { type: "block:text", visible: true, order: 2, props: { text: "Body", align: "left" } },
        { type: "services", visible: true, order: 3 }, // template section
      ],
      seo: {},
    },
  };
}

function savedConfig(): SitePageConfig {
  return mockSetDraft.mock.calls[0][0] as SitePageConfig;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetPage.mockResolvedValue(null);
  mockGetDraft.mockResolvedValue(cfgWith());
});

describe("block ops", () => {
  it("lists only blocks, indexed among blocks (not raw sections)", async () => {
    const blocks = await listBlocks("t");
    expect(blocks.map((b) => b.type)).toEqual(["block:heading", "block:text"]);
    expect(blocks.map((b) => b.index)).toEqual([0, 1]);
    expect(blocks[0].props.text).toBe("Hi");
  });

  it("updates the right block by block-position, leaving template sections untouched", async () => {
    const r = await updateBlock("t", 0, { text: "Updated" }); // block 0 = the heading (raw pos 1)
    expect(r.ok).toBe(true);
    const sections = savedConfig().home.sections;
    expect(sections[0].type).toBe("hero"); // template section untouched
    expect(sections[1].props?.text).toBe("Updated"); // heading updated
    expect(sections[2].props?.text).toBe("Body"); // text block untouched
  });

  it("appends a new block with validated props", async () => {
    const r = await addBlock("t", "block:button", { label: "Go" });
    expect(r.ok).toBe(true);
    const sections = savedConfig().home.sections;
    expect(sections[sections.length - 1].type).toBe("block:button");
    expect(sections[sections.length - 1].props?.label).toBe("Go");
    expect(sections[sections.length - 1].props?.href).toBe("#"); // default filled
  });

  it("rejects an unknown block type without writing", async () => {
    const r = await addBlock("t", "block:nope");
    expect(r.ok).toBe(false);
    expect(mockSetDraft).not.toHaveBeenCalled();
  });

  it("removes a block by block-position", async () => {
    const r = await removeBlock("t", 1); // block 1 = the text block (raw pos 2)
    expect(r.ok).toBe(true);
    const types = savedConfig().home.sections.map((s) => s.type);
    expect(types).toEqual(["hero", "block:heading", "services"]);
  });
});
