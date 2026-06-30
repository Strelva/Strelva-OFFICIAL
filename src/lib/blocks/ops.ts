import { getDraftPageConfig, getPageConfig, setDraftPageConfig } from "@/lib/storage";
import type { PageConfig, PageSectionConfig, SitePageConfig } from "@/lib/types";
import { isBlockType, validateBlockProps, getBlockDefinition, blockDefaults } from "./registry";

/**
 * Block operations the AI agent uses to build a page out of blocks. All writes
 * go to the DRAFT page config — the owner reviews + publishes in Website > Build,
 * so the AI can compose freely without anything going live unapproved. Blocks are
 * addressed by their position among the page's blocks (not raw sections), so the
 * AI never has to reason about legacy template sections.
 */

const DEFAULT_PAGE = "home";

async function loadDraft(tenant: string): Promise<SitePageConfig> {
  return (await getDraftPageConfig(tenant)) || (await getPageConfig(tenant)) || {};
}

function pageSections(cfg: SitePageConfig, page: string): PageSectionConfig[] {
  return (cfg[page]?.sections ?? []).slice().sort((a, b) => a.order - b.order);
}

/** Raw-section positions that hold a block, in page order. */
function blockPositions(sections: PageSectionConfig[]): number[] {
  return sections.map((s, i) => (isBlockType(s.type) ? i : -1)).filter((i) => i >= 0);
}

async function saveDraft(cfg: SitePageConfig, page: string, sections: PageSectionConfig[], tenant: string): Promise<void> {
  const normalized = sections.map((s, i) => ({ ...s, order: i }));
  cfg[page] = { ...(cfg[page] as PageConfig | undefined), sections: normalized };
  await setDraftPageConfig(cfg, tenant);
}

export interface BlockSummary {
  index: number;
  type: string;
  label: string;
  props: Record<string, unknown>;
}

export async function listBlocks(tenant: string, page = DEFAULT_PAGE): Promise<BlockSummary[]> {
  const sections = pageSections(await loadDraft(tenant), page);
  return blockPositions(sections).map((pos, index) => {
    const sec = sections[pos];
    return {
      index,
      type: sec.type,
      label: getBlockDefinition(sec.type)?.label ?? sec.type,
      props: validateBlockProps(sec.type, sec.props),
    };
  });
}

type OpResult = { ok: true; index?: number; blocks: number } | { ok: false; error: string };

export async function addBlock(
  tenant: string,
  type: string,
  props: Record<string, unknown> = {},
  page = DEFAULT_PAGE,
): Promise<OpResult> {
  if (!isBlockType(type)) return { ok: false, error: `Unknown block type "${type}". Use list_blocks for valid types.` };
  const cfg = await loadDraft(tenant);
  const sections = pageSections(cfg, page);
  const merged = validateBlockProps(type, { ...blockDefaults(type), ...props });
  sections.push({ type, visible: true, order: sections.length, props: merged });
  await saveDraft(cfg, page, sections, tenant);
  return { ok: true, index: blockPositions(sections).length - 1, blocks: blockPositions(sections).length };
}

export async function updateBlock(
  tenant: string,
  index: number,
  props: Record<string, unknown>,
  page = DEFAULT_PAGE,
): Promise<OpResult> {
  const cfg = await loadDraft(tenant);
  const sections = pageSections(cfg, page);
  const pos = blockPositions(sections)[index];
  if (pos === undefined) return { ok: false, error: `No block at position ${index}.` };
  const sec = sections[pos];
  sections[pos] = { ...sec, props: validateBlockProps(sec.type, { ...(sec.props ?? {}), ...props }) };
  await saveDraft(cfg, page, sections, tenant);
  return { ok: true, index, blocks: blockPositions(sections).length };
}

export async function removeBlock(tenant: string, index: number, page = DEFAULT_PAGE): Promise<OpResult> {
  const cfg = await loadDraft(tenant);
  const sections = pageSections(cfg, page);
  const pos = blockPositions(sections)[index];
  if (pos === undefined) return { ok: false, error: `No block at position ${index}.` };
  sections.splice(pos, 1);
  await saveDraft(cfg, page, sections, tenant);
  return { ok: true, blocks: blockPositions(sections).length };
}

export async function moveBlock(tenant: string, index: number, direction: "up" | "down", page = DEFAULT_PAGE): Promise<OpResult> {
  const cfg = await loadDraft(tenant);
  const sections = pageSections(cfg, page);
  const positions = blockPositions(sections);
  const pos = positions[index];
  const swapPos = positions[index + (direction === "up" ? -1 : 1)];
  if (pos === undefined || swapPos === undefined) return { ok: false, error: "Can't move that block any further." };
  [sections[pos], sections[swapPos]] = [sections[swapPos], sections[pos]];
  await saveDraft(cfg, page, sections, tenant);
  return { ok: true, blocks: positions.length };
}
