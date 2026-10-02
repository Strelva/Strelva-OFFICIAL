import { createHash } from "node:crypto";
import { z } from "zod";
import { isDeepStrictEqual } from "node:util";
import { decideAiContentGovernance, type AiGovernanceDecision } from "@/lib/ai-governance";
import { maybeAutoApprove } from "@/lib/ai-auto-approve";
import type { ContentSection, TenantConfig } from "@/lib/types";
import { siteDocumentSchema, siteDocumentHash, type SiteDocument } from "./site-document";

const pointer = z.string().min(1).max(500).refine(value => /^\/(?:nodes\/[^/]+|pages\/(?:0|[1-9]\d*|-))(?:\/.*)?$/.test(value), "Only site nodes and page entries may be patched");
export const sitePatchOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), path: pointer, value: z.unknown().refine(value => value !== undefined, "A patch value is required") }).strict(),
  z.object({ op: z.literal("replace"), path: pointer, value: z.unknown().refine(value => value !== undefined, "A patch value is required") }).strict(),
  z.object({ op: z.literal("remove"), path: pointer }).strict(),
  z.object({ op: z.literal("test"), path: pointer, value: z.unknown().refine(value => value !== undefined, "A patch value is required") }).strict(),
  z.object({ op: z.literal("copy"), path: pointer, from: pointer }).strict(),
  z.object({ op: z.literal("move"), path: pointer, from: pointer }).strict(),
]);
export const sitePatchSchema = z.array(sitePatchOperationSchema).min(1).max(100);
export type SitePatchOperation = z.infer<typeof sitePatchOperationSchema>;

function parts(path: string): string[] {
  const tokens = path.slice(1).split("/").map(token => {
    if (/~(?![01])/u.test(token)) throw new Error("Invalid JSON pointer escape");
    return token.replace(/~1/g, "/").replace(/~0/g, "~");
  });
  if (tokens.some(token => ["__proto__", "prototype", "constructor"].includes(token))) throw new Error("Unsafe JSON pointer");
  // Verification and fact association are server-owned evidence, not editable copy.
  if (tokens[0] === "nodes" && tokens.length > 2 && ["id", "factIds", "verification"].includes(tokens[2]!)) throw new Error("Fact evidence and node identity cannot be patched");
  return tokens;
}
function indexOf(array: unknown[], token: string, add = false): number {
  if (add && token === "-") return array.length;
  if (!/^(0|[1-9]\d*)$/.test(token)) throw new Error("Invalid array index");
  const index = Number(token);
  if (index > array.length || (!add && index === array.length)) throw new Error("JSON pointer does not exist");
  return index;
}
function location(root: unknown, path: string): { parent: Record<string, unknown> | unknown[]; key: string } {
  const tokens = parts(path); let parent = root;
  for (const token of tokens.slice(0, -1)) {
    if (!parent || typeof parent !== "object") throw new Error("JSON pointer does not exist");
    if (Array.isArray(parent)) parent = parent[indexOf(parent, token)];
    else if (Object.hasOwn(parent, token)) parent = (parent as Record<string, unknown>)[token];
    else throw new Error("JSON pointer does not exist");
  }
  if (!parent || typeof parent !== "object") throw new Error("JSON pointer does not exist");
  return { parent: parent as Record<string, unknown> | unknown[], key: tokens.at(-1)! };
}
function read(root: unknown, path: string): unknown {
  const { parent, key } = location(root, path);
  if (Array.isArray(parent)) return parent[indexOf(parent, key)];
  if (!Object.hasOwn(parent, key)) throw new Error("JSON pointer does not exist");
  return parent[key];
}
function write(root: unknown, path: string, op: "add" | "remove" | "replace", value?: unknown) {
  const { parent, key } = location(root, path);
  if (Array.isArray(parent)) {
    const index = indexOf(parent, key, op === "add");
    if (op === "add") parent.splice(index, 0, structuredClone(value));
    else if (op === "remove") parent.splice(index, 1);
    else parent[index] = structuredClone(value);
  } else {
    if (op !== "add" && !Object.hasOwn(parent, key)) throw new Error("JSON pointer does not exist");
    if (op === "remove") delete parent[key]; else parent[key] = structuredClone(value);
  }
}

/** Apply RFC 6902 atomically to a detached copy, then validate the entire catalog graph. */
export function applySitePatch(document: SiteDocument, raw: unknown): SiteDocument {
  const ops = sitePatchSchema.parse(raw); const next = structuredClone(siteDocumentSchema.parse(document));
  for (const op of ops) {
    parts(op.path);
    if (op.op === "test") { if (!isDeepStrictEqual(read(next, op.path), op.value)) throw new Error("Site patch test failed"); }
    else if (op.op === "copy" || op.op === "move") {
      parts(op.from);
      if (op.op === "move" && op.path.startsWith(`${op.from}/`)) throw new Error("Cannot move a node inside itself");
      const value = structuredClone(read(next, op.from));
      if (op.op === "move") write(next, op.from, "remove");
      write(next, op.path, "add", value);
    } else write(next, op.path, op.op, "value" in op ? op.value : undefined);
  }
  // A whole-node replace must not silently rewrite the server-owned provenance.
  for (const [id, node] of Object.entries(next.nodes)) {
    const before = document.nodes[id];
    if (before && (!isDeepStrictEqual(before.factIds, node.factIds) || !isDeepStrictEqual(before.verification, node.verification))) throw new Error("Fact evidence cannot be patched");
    if (!before && (node.factIds.length || node.verification)) throw new Error("New factual nodes need owner review and evidence");
  }
  return siteDocumentSchema.parse(next);
}

const SECTIONS: Record<string, ContentSection> = { Header: "navigation", Footer: "footer", Hero: "hero", Story: "story", ServiceGrid: "services", ServiceDetail: "services", Testimonials: "testimonials", Faq: "faq", Hours: "contact", Locations: "contact", Map: "contact", Booking: "contact", InquiryForm: "contact" };
export interface SitePatchRisk { level: "low" | "medium" | "high"; confidence: number }
export interface PreparedSitePatch { document: SiteDocument; contentHash: string; governance: AiGovernanceDecision; forceReview: boolean; changedNodeIds: string[] }
export async function prepareSitePatch(input: {
  document: SiteDocument; ops: unknown; tenantConfig?: TenantConfig | null; autoMode?: boolean; forceReview?: boolean;
  risk?: SitePatchRisk;
  verify?: (document: SiteDocument, changedNodeIds: string[]) => Promise<SiteDocument>;
}): Promise<PreparedSitePatch> {
  let document = applySitePatch(input.document, input.ops);
  const changedContentNodeIds = [...new Set([...Object.keys(document.nodes), ...Object.keys(input.document.nodes)])].filter(id => !isDeepStrictEqual(document.nodes[id], input.document.nodes[id]));
  const pagesChanged = !isDeepStrictEqual(document.pages, input.document.pages);
  const changedPages = document.pages.filter(page => {
    const before = input.document.pages.find(previous => previous.path === page.path);
    return !before || before.title !== page.title || before.description !== page.description || before.root !== page.root;
  });
  const changedNodeIds = [...new Set([...changedContentNodeIds, ...changedPages.map(page => page.root)])];
  let governance: AiGovernanceDecision = { action: "review", reasonCode: "unclassified", reason: "Site edits require review before publishing." };

  const factualChanges = changedNodeIds.some(id => document.nodes[id]?.factIds.length || input.document.nodes[id]?.factIds.length);
  let verified = !factualChanges;
  // Every proposed string is new evidence until an owner confirms it. Existing
  // fact IDs cannot confer approval on newly written copy.
  for (const id of changedContentNodeIds) {
    const node = document.nodes[id]; if (!node) continue;
    const texts: string[] = [];
    const collect = (value: unknown): void => { if (typeof value === "string" && value.trim()) { const text = value.trim(); for (let offset=0;offset<text.length;offset+=500) texts.push(text.slice(offset,offset+500)); } else if (typeof value === "number") texts.push(String(value)); else if (Array.isArray(value)) value.forEach(collect); else if (value && typeof value === "object") Object.values(value).forEach(collect); };
    collect(node.props);
    node.factIds = [...new Set(texts)].map(text => {
      const factId = `edit_${id.slice(0,50)}_${createHash("sha256").update(text).digest("hex").slice(0,16)}`;
      document.facts[factId] = { text,kind: "claim",highRisk: true,origin: "owner_stated",sources: [] };
      return factId;
    });
  }
  // SEO copy is visible factual content too. Page edits cannot reuse the old
  // root's source verification to approve a newly invented title or description.
  for (const page of changedPages) {
    const root = document.nodes[page.root]!;
    for (const text of [...new Set([page.title, page.description].filter(value => value.trim()))]) {
      const factId = `page_${createHash("sha256").update(`${page.path}:${text}`).digest("hex").slice(0,24)}`;
      document.facts[factId] = { text, kind:"claim", highRisk:true, origin:"owner_stated", sources:[] };
      if (!root.factIds.includes(factId)) root.factIds.push(factId);
    }
  }
  document = siteDocumentSchema.parse(document);
  // Existing source support does not prove that newly written node copy agrees.
  // Invalidate that evidence before calling the verifier.
  for (const id of changedNodeIds) {
    const node = document.nodes[id]; if (!node) continue;
    // Layout-only nodes contain no factual copy to confirm. Their enclosing
    // candidate still requires the explicit owner approval governed below.
    node.verification = node.factIds.length ? { supported: false, confidence: 0, needsReview: true } : { supported: true, confidence: 1, needsReview: false };
  }
  if (changedNodeIds.length && input.verify) {
    try {
      const candidate = siteDocumentSchema.parse(await input.verify(structuredClone(document), changedNodeIds));
      // A verifier may enrich evidence; it may never rewrite the proposed content.
      const content = (value: SiteDocument) => { const copy = structuredClone(value); for (const node of Object.values(copy.nodes)) delete node.verification; for (const fact of Object.values(copy.facts)) delete fact.verification; return copy; };
      if (!isDeepStrictEqual(content(candidate), content(document))) throw new Error("Verifier changed site content");
      document = candidate;
      verified = changedNodeIds.every(id => !document.nodes[id] || (document.nodes[id]!.verification?.supported === true && document.nodes[id]!.verification!.confidence >= .85 && document.nodes[id]!.verification!.needsReview !== true && document.nodes[id]!.factIds.every(factId => { const fact = document.facts[factId]; return !!fact && (!fact.highRisk || fact.origin === "owner_confirmed") && (fact.origin === "owner_confirmed" || (fact.verification?.supported && fact.verification.confidence >= .85)); })));
    } catch { verified = false; }
  }
  const governanceNodes = changedNodeIds.flatMap(id => { const next = document.nodes[id]; const before = input.document.nodes[id]; return before && next && before.type !== next.type ? [before,next] : [next ?? before!]; });
  const decisions = await Promise.all(governanceNodes.map(async node => {
    const section = SECTIONS[node.type] ?? "hero";
    const decision = decideAiContentGovernance(section, node.props, { tenantAutoPublish: input.autoMode === true });
    // Extending navigation to an added, validated page is part of the same
    // reviewed owner request. Existing links, brand and header structure remain
    // protected by the canonical structural block.
    const before = input.document.nodes[node.id];
    const addedPaths = new Set(document.pages.filter(page => !input.document.pages.some(previous => previous.path === page.path)).map(page => page.path));
    if (decision.action === "block" && before?.type === "Header" && node.type === "Header" && before.variant === node.variant && isDeepStrictEqual(before.children,node.children)) {
      const { links: oldLinks = [], ...oldProps } = before.props;
      const { links: nextLinks = [], ...nextProps } = node.props;
      if (isDeepStrictEqual(oldProps,nextProps) && nextLinks.length > oldLinks.length && isDeepStrictEqual(nextLinks.slice(0,oldLinks.length),oldLinks) && nextLinks.slice(oldLinks.length).every(link => addedPaths.has(link.href))) return { action:"review" as const,reasonCode:"tenant_review_required" as const,reason:"Adding a page and its navigation requires owner approval." };
    }
    return input.autoMode === true ? maybeAutoApprove(input.tenantConfig ?? undefined, section, decision) : decision;
  }));
  governance = decisions.find(value => value.action === "block") ?? decisions.find(value => value.action === "review") ?? decisions[0] ?? governance;
  if ((input.forceReview || pagesChanged) && governance.action !== "block") governance = { action: "review", reasonCode: "tenant_review_required", reason: "This revision requires owner approval." };
  if (governance.action === "publish" && (!verified || input.autoMode !== true || input.risk?.level !== "low" || input.risk.confidence < .9 || !Number.isFinite(input.risk.confidence))) governance = { action: "review", reasonCode: "unclassified", reason: "Verified facts, owner auto mode, and a confident low-risk assessment are required for automatic publication." };
  return { document, contentHash: siteDocumentHash(document), governance, forceReview: governance.action !== "publish", changedNodeIds };
}

/** Undo appends the previous content as a new revision; it never rewinds the live pointer. */
export function prepareSiteUndo(previous: SiteDocument): PreparedSitePatch {
  const document = siteDocumentSchema.parse(previous);
  return { document, contentHash: siteDocumentHash(document), changedNodeIds: Object.keys(document.nodes), forceReview: true, governance: { action: "review", reasonCode: "tenant_review_required", reason: "Undo creates a new revision requiring owner approval." } };
}
export function readSiteNodes(document: SiteDocument, path?: string) {
  const parsed = siteDocumentSchema.parse(document);
  if (!path) return { pages: parsed.pages, allPages: parsed.pages, nodes: parsed.nodes, patchRoots:["/nodes", "/pages"] };
  const page = parsed.pages.find(value => value.path === path);
  if (!page) throw new Error("Site page not found");
  const ids = new Set<string>(); const walk = (id: string) => { if (ids.has(id)) return; ids.add(id); parsed.nodes[id]!.children.forEach(walk); }; walk(page.root);
  return { pages: [page], allPages: parsed.pages, nodes: Object.fromEntries([...ids].map(id => [id, parsed.nodes[id]])), patchRoots:["/nodes", "/pages"] };
}
