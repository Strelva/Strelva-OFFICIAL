import { z } from "zod";
import { createHash } from "node:crypto";
import { catalogNodeSchema, safeSitePathSchema, siteDocumentSchema, type CatalogNode, type SiteDocument } from "./site-document";
import type { CrawlResult } from "./rebuild-crawl";
import type { BusinessFacts, ContentBlock, RebuildContent } from "./rebuild-pipeline";
import { isHighRiskWebsiteClaim } from "./rebuild-risk";

export interface CompositionQuestion { id: string; candidates: string[] }
export interface CompositionDecision { choices: Record<string, string>; confidence: number; confidenceSource?: "model_self_reported" | "provider_probability" | "deterministic" }
export interface SiteComposer { name: "jev" | "model" | "rules"; compose: (questions: CompositionQuestion[], context: { businessName: string; category?: string }) => Promise<CompositionDecision> }
export interface VerificationDecision { supported: boolean; confidence: number; highRisk?: boolean }
export type SiteVerifier = (input: { sentence: string; facts: Array<{ id: string; text: string; quotes: string[]; origin: string }> }) => Promise<VerificationDecision>;
const decisionSchema = z.object({ choices: z.record(z.string(), z.string()), confidence: z.number().min(0).max(1), confidenceSource: z.enum(["model_self_reported", "provider_probability", "deterministic"]).optional() }).strict();

async function bounded<T>(task: Promise<T>, milliseconds: number): Promise<T> { let timer: ReturnType<typeof setTimeout> | undefined; try { return await Promise.race([task, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error("Composer timed out.")), milliseconds); })]); } finally { if (timer) clearTimeout(timer); } }

export class JevComposer implements SiteComposer {
  readonly name = "jev" as const;
  constructor(private readonly decide: SiteComposer["compose"]) {}
  async compose(questions: CompositionQuestion[], context: { businessName: string; category?: string }) { return decisionSchema.parse(await bounded(this.decide(questions, context), 2000)); }
}
export class ModelComposer implements SiteComposer {
  readonly name = "model" as const;
  constructor(private readonly decide: SiteComposer["compose"]) {}
  async compose(questions: CompositionQuestion[], context: { businessName: string; category?: string }) { return decisionSchema.parse(await bounded(this.decide(questions, context), 15000)); }
}
export class RuleComposer implements SiteComposer {
  readonly name = "rules" as const;
  async compose(questions: CompositionQuestion[], context: { businessName: string; category?: string }): Promise<CompositionDecision> {
    const legal = /legal|law|attorney|firm/i.test(`${context.category ?? ""} ${context.businessName}`);
    return { confidence: 1, confidenceSource: "deterministic", choices: Object.fromEntries(questions.map((question) => [question.id, question.id === "palette" ? legal ? "warm" : "light" : question.id === "typeScale" ? legal ? "editorial" : "standard" : question.candidates[0]!])) };
  }
}

async function chooseComposition(questions: CompositionQuestion[], facts: BusinessFacts, composers: SiteComposer[] = []): Promise<{ decisions: CompositionDecision; composer: SiteComposer["name"] }> {
  for (const composer of [...composers, new RuleComposer()]) {
    try { const decisions = decisionSchema.parse(await bounded(composer.compose(questions, { businessName: facts.name, category: facts.category }), composer.name === "jev" ? 2000 : 15000));
      if (decisions.confidence < 0.55 || questions.some((question) => !question.candidates.includes(decisions.choices[question.id] ?? "")) || Object.keys(decisions.choices).some((id) => !questions.some((question) => question.id === id))) continue;
      return { decisions, composer: composer.name };
    } catch { /* An unavailable or invalid composer falls through without losing content. */ }
  }
  throw new Error("No valid site composition was available.");
}

export async function composeRebuildSite(facts: BusinessFacts, content: RebuildContent, crawl?: CrawlResult, composers?: SiteComposer[], hostedAssets: SiteDocument["assets"] = {}): Promise<SiteDocument> {
  const questions: CompositionQuestion[] = [ { id: "palette", candidates: ["light", "warm", "dark", "ocean", "forest"] }, { id: "typeScale", candidates: ["standard", "editorial", "compact"] }, { id: "hero", candidates: ["statement", "split"] }, { id: "services", candidates: ["cards", "list", "icons"] }, { id: "reviews", candidates: ["wall", "single", "carousel"] } ];
  const { decisions, composer } = await chooseComposition(questions, facts, composers);
  const nodes: Record<string, CatalogNode> = {};
  const put = (raw: unknown): string => { const node = catalogNodeSchema.parse(raw); nodes[node.id] = node; return node.id; };
  const navigationLink = (page: RebuildContent["pages"][number]) => { const words = page.path.split("/").filter(Boolean).at(-1)?.replace(/[-_]/g, " ") || page.title; return { label: words.charAt(0).toUpperCase() + words.slice(1), href: page.path }; };
  const nav = content.pages.filter((page) => page.path !== "/" && !/privacy|terms|accessibility|advertising|disclaimer/i.test(page.path)).slice(0, 6).map(navigationLink);
  const footerLinks = content.pages.filter((page) => page.path !== "/").map(navigationLink);
  const assets = siteDocumentSchema.shape.assets.parse(hostedAssets); const logo = Object.entries(assets).find(([, asset]) => /logo/i.test(asset.alt))?.[0]; const heroImage = Object.entries(assets).find(([id]) => id !== logo)?.[0];
  const pages = content.pages.map((page, pageIndex) => {
    const prefix = `page_${pageIndex}`; const children: string[] = [];
    const add = (type: CatalogNode["type"], variant: string, props: unknown, blocks: ContentBlock[] = []) => children.push(put({ id: `${prefix}_node_${children.length}`, type, variant, props, children: [], factIds: [...new Set(blocks.flatMap((block) => block.factIds))].slice(0, 200) }));
    add("Header", "logo-left", { brand: facts.name, links: nav, cta: { label: "Get in touch", href: "/contact" } }, [{ id: "name", type: "heading", text: facts.name, factIds: [facts.nameFactId] }]);
    const primary = page.blocks.find((block) => block.type === "paragraph" && block.text !== page.title && !block.factIds.includes(facts.nameFactId));
    if (page.path === "/") add("Hero", heroImage ? "split" : decisions.choices.hero!, { title: facts.name, body: primary?.text ?? "", ...(heroImage ? { image: heroImage } : {}), cta: { label: "Get in touch", href: "/contact" } }, [{ id: "name", type: "heading", text: facts.name, factIds: [facts.nameFactId] }, ...(primary ? [primary] : [])]);
    else add("PageHeader", "standard", { title: page.title }, page.blocks.filter((block) => block.text === page.title));
    const services = page.blocks.filter((block) => block.type === "service").slice(0, 35);
    if (services.length) add("ServiceGrid", decisions.choices.services!, { title: "Services", items: services.map((block) => ({ title: block.text })) }, services);
    const people = page.blocks.filter((block) => block.type === "person").slice(0, 35);
    if (people.length) add("TeamGrid", people.length === 1 ? "single-bio" : "cards", { title: "People", people: people.map((block) => ({ name: block.text })) }, people);
    const reviews = page.blocks.filter((block) => block.type === "review").slice(0, 35);
    if (reviews.length) add("Testimonials", decisions.choices.reviews!, { title: "What clients say", items: reviews.map((block) => ({ quote: block.text })) }, reviews);
    const remaining = page.blocks.filter((block) => !services.includes(block) && !people.includes(block) && !reviews.includes(block) && !(page.path === "/" && block === primary) && !block.factIds.includes(facts.nameFactId));
    for (let offset = 0; offset < remaining.length; offset += 12) { const group = remaining.slice(offset, offset + 12); add("RichText", "standard", { text: group.map((block) => block.text).join("\n\n") }, group); }
    if (page.path === "/contact" || page.path === "/") {
      const location = facts.locations.find(id => facts.facts[id]?.verification?.supported); const phone = facts.contact.find(id => /^\+?[\d() .-]{7,}$/.test(facts.facts[id]!.text));
      if (location) { const ids = [facts.nameFactId, location, ...(phone ? [phone] : [])]; add("Locations", "list", { title: "Contact", items: [{ name: facts.name, address: facts.facts[location]!.text, ...(phone ? { phone: facts.facts[phone]!.text } : {}) }] }, ids.map(id => ({ id, type: "location" as const, text: facts.facts[id]!.text, factIds: [id] }))); }
      if (phone) add("Cta", "card", { body: facts.facts[phone]!.text, cta: { label: "Call us", href: `tel:${facts.facts[phone]!.text}` } }, [{ id: phone, type: "contact", text: facts.facts[phone]!.text, factIds: [phone] }]);
      const inquiryFacts = Object.entries(facts.facts).filter(([, fact]) => fact.kind === "claim" && /(?:do not|without).{0,70}(?:names|details)|share.{0,60}contact|general inquiry|do not include|contact information/i.test(fact.text)).slice(0, 1);
      const nextFacts = Object.entries(facts.facts).filter(([, fact]) => fact.kind === "claim" && /conflict check|respond.{0,30}inquiry|confirm.{0,30}availability/i.test(fact.text)).slice(0, 1);
      const faqs = [{ question: "What information should I send?", facts: inquiryFacts }, { question: "What happens next?", facts: nextFacts }].filter(entry => entry.facts.length);
      if (faqs.length) add("Faq", "accordion", { title: "Common questions", items: faqs.map(entry => ({ question: entry.question, answer: entry.facts.map(([, fact]) => fact.text).join("\n\n") })) }, faqs.flatMap(entry => entry.facts.map(([id, fact]) => ({ id, type: "paragraph" as const, text: fact.text, factIds: [id] }))));
      add("InquiryForm", "card", { title: "Get in touch", submitLabel: "Send inquiry" });
    }
    add("Footer", "simple", { text: facts.name, links: footerLinks }, [{ id: "name", type: "heading", text: facts.name, factIds: [facts.nameFactId] }]);
    const root = put({ id: `${prefix}_root`, type: "Section", variant: "container", props: {}, children, factIds: [] });
    return { path: page.path, title: page.title, description: (primary?.text ?? facts.name).slice(0, 160), root };
  });
  const paths = new Set(pages.map((page) => page.path)); const redirects: SiteDocument["redirects"] = [];
  for (const source of facts.sourcePages) { const old = new URL(source.url).pathname.replace(/\/$/, "") || "/"; const target = content.pages.find((page) => page.sourceIds.includes(source.sourceId))?.path ?? "/"; if (!paths.has(old) && old !== target && safeSitePathSchema.safeParse(old).success && !redirects.some((entry) => entry.from === old)) redirects.push({ from: old, to: target }); }
  // Assets are collected by the crawler, but may only enter the document
  // after the render service rehosts them. Never hotlink the source site.
  return siteDocumentSchema.parse({ version: 2, siteName: facts.name, theme: { palette: decisions.choices.palette, typeScale: decisions.choices.typeScale, ...(logo ? { logo } : {}) }, pages, nodes, facts: structuredClone(facts.facts), assets, redirects, provenance: { composer, ...(crawl ? { sourceUrl: crawl.pages[0]!.url, crawledAt: crawl.crawledAt } : {}) } });
}

function publicStrings(value: unknown): string[] { if (typeof value === "string") return [value]; if (Array.isArray(value)) return value.flatMap(publicStrings); if (value && typeof value === "object") return Object.entries(value).filter(([key]) => !["href", "image", "assetId", "links", "cta", "secondaryCta"].includes(key)).flatMap(([, item]) => publicStrings(item)); return []; }

export async function verifyRebuildSite(raw: SiteDocument, _facts: BusinessFacts, content: RebuildContent, verifier?: SiteVerifier): Promise<SiteDocument> {
  const document = structuredClone(siteDocumentSchema.parse(raw));
  for (const fact of Object.values(document.facts)) {
    const sourceExact = fact.sources.some((source) => source.quote === fact.text) || fact.kind === "location" && fact.sources.map(source => source.quote).join(", ") === fact.text;
    const sourceIntegrity = fact.verification?.supported !== false;
    // This is an exact quoted-source check, not a claim that a model checked
    // truth or that the publisher's claims are true. Paraphrases remain flagged.
    fact.verification = { supported: fact.origin === "owner_stated" || fact.origin === "owner_confirmed" || sourceExact && sourceIntegrity, confidence: fact.origin === "owner_stated" || fact.origin === "owner_confirmed" || sourceExact && sourceIntegrity ? 1 : 0 };
  }
  for (const node of Object.values(document.nodes)) {
    if (!node.factIds.length) continue;
    const bound = node.factIds.map((id) => ({ id, ...document.facts[id]! }));
    const text = publicStrings(node.props).join("\n");
    const claims = publicStrings(node.props).filter((sentence) => !["Services", "People", "What clients say", "Get in touch", "Send inquiry", "Contact", "Common questions", "What information should I send?", "What happens next?"].includes(sentence));
    const coverage = claims.every((sentence) => bound.some((fact) => fact.text === sentence) || sentence.split(/\n\n/).every((part) => bound.some((fact) => fact.text === part)) || content.pages.some((page) => page.title === sentence));
    let supported = coverage && bound.every((fact) => fact.verification?.supported); let confidence = supported ? 1 : 0;
    let highRisk = bound.some((fact) => fact.highRisk);
    if (!supported && verifier) {
      try { const result = z.object({ supported: z.boolean(), confidence: z.number().min(0).max(1), highRisk: z.boolean().optional() }).strict().parse(await bounded(verifier({ sentence: text, facts: bound.map((fact) => ({ id: fact.id, text: fact.text, quotes: fact.sources.map((source) => source.quote), origin: fact.origin })) }), 2000)); supported = result.supported && result.confidence >= 0.85 && bound.every((fact) => fact.verification?.supported); confidence = result.confidence; highRisk ||= result.highRisk ?? false; } catch { /* Failed checks stay flagged. */ }
    }
    node.verification = { supported, confidence, highRisk, needsReview: !supported || highRisk };
    if (!supported) {
      // The decision must show the actual proposed copy. Confirming an old
      // source fact is never confirmation of a model's changed sentence.
      const unbound = claims.flatMap(sentence => sentence.split(/\n\n/)).filter(sentence => !bound.some(fact => fact.text === sentence) && !content.pages.some(page => page.title === sentence));
      for (const proposed of unbound) {
        const words = proposed.split(/\s+/); const spans: string[] = []; let current = "";
        for (const word of words) { if ((current + " " + word).trim().length > 500 && current) { spans.push(current); current = ""; } current = (current + " " + word).trim(); } if (current) spans.push(current);
        for (const sentence of spans) {
          const id = `review_${createHash("sha256").update(`${node.id}:${sentence}`).digest("hex").slice(0, 20)}`;
          const quotes = [...new Map(bound.flatMap(fact => fact.sources).map(source => [`${source.sourceId}:${source.quote}`, source])).values()].slice(0, 40);
          const risky = isHighRiskWebsiteClaim(sentence);
          document.facts[id] = { text: sentence, kind: "claim", highRisk: risky, origin: "owner_stated", sources: quotes, verification: { supported: false, confidence: 0 } };
          if (!node.factIds.includes(id)) node.factIds.push(id);
          node.verification.highRisk ||= risky;
        }
      }
    }
  }
  return siteDocumentSchema.parse(document);
}
