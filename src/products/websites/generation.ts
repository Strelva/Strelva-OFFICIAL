import { createHash } from "node:crypto";
import { generateText, Output, type LanguageModel } from "ai";
import { defaults } from "@/lib/defaults";
import { getFallbackModel, getPrimaryModel, isTransientModelError, type ModelConfig } from "@/lib/ai-models";
import type { ContentMap, PageConfig, SitePageConfig, ThemeContent } from "@/lib/types";
import {
  WEBSITE_VERSION,
  websiteBriefSchema,
  websitePublishedCapabilitiesSchema,
  websiteSpecSchema,
  type WebsiteBrief,
  type WebsitePublishedCapabilities,
  type WebsiteSpec,
} from "./contracts";
import { renderGeneratedSite, type GeneratedPage, type GeneratedSection, type GeneratedSite } from "../../../custom-repo-starter/website-generation/renderer";

export const WEBSITE_GENERATION_MODE = {
  deterministic: "deterministic_brief",
  structuredProvider: "structured_provider",
} as const;
export const WEBSITE_RENDERER_CONTRACT_VERSION = "v1" as const;

export type WebsiteGenerationMode = typeof WEBSITE_GENERATION_MODE[keyof typeof WEBSITE_GENERATION_MODE];

export interface WebsiteDraft {
  version: typeof WEBSITE_VERSION;
  mode: WebsiteGenerationMode;
  brief: WebsiteBrief;
  spec: WebsiteSpec;
  content: ContentMap;
  pages: SitePageConfig;
  theme: ThemeContent;
}

export interface WebsiteGenerationProviderInput {
  version: typeof WEBSITE_VERSION;
  rendererContractVersion: typeof WEBSITE_RENDERER_CONTRACT_VERSION;
  brief: WebsiteBrief;
  baseline: WebsiteDraft;
}

/**
 * The provider is deliberately injected. The website product can connect a
 * governed model/cost adapter later, while local builds use the deterministic
 * brief path without making a paid call or pretending one happened.
 */
export type WebsiteGenerationProvider = (input: WebsiteGenerationProviderInput) => Promise<unknown>;

export interface WebsiteModelGenerationInput {
  brief: WebsiteBrief;
  baseline: WebsiteDraft;
  modelLabel: string;
}

export interface WebsiteModelGenerationOptions {
  /**
   * The runner is the admission seam. Production callers can wrap it in the
   * existing budget executor; tests can supply a deterministic structured
   * result without contacting a model provider.
   */
  run: (input: WebsiteModelGenerationInput) => Promise<unknown>;
}

/** Build a provider around an already-admitted structured model call. */
export function createStructuredWebsiteGenerationProvider(options: WebsiteModelGenerationOptions): WebsiteGenerationProvider {
  return async ({ brief, baseline }) => options.run({ brief, baseline, modelLabel: "structured-website-provider" });
}

function fallbackModelConfigured(): boolean {
  if (!process.env.AI_FALLBACK_PROVIDER || !process.env.AI_FALLBACK_MODEL) return false;
  if (process.env.AI_FALLBACK_PROVIDER === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  if (process.env.AI_FALLBACK_PROVIDER === "openai") return Boolean(process.env.OPENAI_API_KEY?.trim());
  return false;
}

function configuredWebsiteModels(): ModelConfig[] {
  const models: ModelConfig[] = [];
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()) models.push(getPrimaryModel());
  if (fallbackModelConfigured()) {
    const fallback = getFallbackModel();
    if (fallback) models.push(fallback);
  }
  return models;
}

function websiteModelPrompt(brief: WebsiteBrief, baseline: WebsiteDraft): string {
  return [
    "Create a website from the supplied brief.",
    "Return only a WebsiteSpec object. Keep version 1, provide a siteName, and preserve a home page plus any useful about/contact pages.",
    "Use only facts in the brief. Do not invent testimonials, addresses, phone numbers, pricing, certifications, client names, or provider claims.",
    "The baseline is a shape and renderer example, not business evidence. Replace its generic or empty content with the brief where the brief supplies it.",
    "Brief:", JSON.stringify(brief),
    "Baseline WebsiteSpec:", JSON.stringify(baseline.spec),
  ].join("\n\n");
}

/**
 * Opt-in adapter for the repository's configured AI models. It is disabled
 * unless website model generation is explicitly enabled and a model key is
 * present. Callers that need paid usage should invoke this provider inside the
 * existing budget admission path; token usage alone is never treated as cost.
 */
export function createConfiguredWebsiteGenerationProvider(): WebsiteGenerationProvider | null {
  if (process.env.STRELVA_WEBSITE_GENERATION_ENABLED !== "1") return null;
  const models = configuredWebsiteModels();
  if (!models.length) return null;
  return async ({ brief, baseline }) => {
    const abortSignal = AbortSignal.timeout(20_000);
    const options = (model: LanguageModel) => ({
      model,
      system: "You produce a reviewable structured website draft. Never execute code or external actions.",
      prompt: websiteModelPrompt(brief, baseline),
      output: Output.object({ schema: websiteSpecSchema }),
      maxOutputTokens: 4_000,
      maxRetries: 0,
      abortSignal,
    });
    try {
      const result = await generateText(options(models[0]!.model));
      return result.output;
    } catch (error) {
      if (!models[1] || !isTransientModelError(error)) throw new WebsiteGenerationProviderError("The configured website model did not return a structured draft.");
      try {
        const result = await generateText(options(models[1].model));
        return result.output;
      } catch {
        throw new WebsiteGenerationProviderError("The configured website model did not return a structured draft.");
      }
    }
  };
}

export interface WebsiteGenerationInput {
  workspaceId: string;
  workId: string;
  revision: number;
  brief: WebsiteBrief | Record<string, unknown>;
  publishedCapabilities?: WebsitePublishedCapabilities;
  now?: string;
  previewHref?: string;
}

export class WebsiteGenerationProviderError extends Error {
  constructor(message = "The structured website generation result was unavailable or invalid.") {
    super(message);
    this.name = "WebsiteGenerationProviderError";
  }
}

function blankContent(): ContentMap {
  const content = structuredClone(defaults);
  content.hero = {
    ...content.hero,
    headline: "",
    subheadline: "",
    tagline: "",
    ctaText: "",
    ctaLink: "",
    backgroundImageUrl: "",
  };
  content.services = { ...content.services, headline: "", description: "", services: [] };
  content.story = {
    ...content.story,
    headline: "",
    accentText: "",
    statement: "",
    paragraphs: [],
    stats: [],
    quote: "",
    quoteAttribution: "",
    imageUrl: "",
    secondaryImageUrl: "",
  };
  content.testimonials = { ...content.testimonials, headline: "", testimonials: [] };
  content.events = { ...content.events, headline: "", events: [] };
  content.providers = { ...content.providers, headline: "", description: "", providers: [] };
  content.contact = {
    ...content.contact,
    headline: "",
    description: "",
    email: "",
    phone: "",
    address: "",
    hours: "",
    locationTitle: "",
    locationDescription: "",
    instagramUrl: "",
    facebookUrl: "",
    googleMapsUrl: "",
  };
  content.settings = {
    ...content.settings,
    siteName: "",
    siteTagline: "",
    siteDescription: "",
    siteKeywords: "",
    ownerName: "",
    ownerTitle: "",
    trustBadge: "",
    footerTagline: "",
    copyrightText: "",
    bookingUrl: "",
    instagramHandle: "",
    vagaro_embed_id: "",
    logoUrl: "",
    marqueeText: "",
    brandVoice: "",
    businessModel: "",
  };
  content.faq = { ...content.faq, headline: "", description: "", faqs: [] };
  content.shop = { ...content.shop, headline: "", description: "", items: [] };
  content.products = { ...content.products, headline: "", description: "", products: [], bottomNote: "" };
  content.navigation = { ...content.navigation, menuItems: [], ctaLabel: "", ctaHref: "" };
  content.footer = { ...content.footer, tagline: "", columns: [], socialLinks: [], copyrightText: "" };
  return content;
}

/** Accept the earlier internal generator fixture shape while the public API
 * remains the smaller WebsiteBrief contract. Supplied legacy fields are
 * carried into the canonical brief; no business facts are invented. */
function normalizeBrief(raw: WebsiteBrief | Record<string, unknown>): WebsiteBrief {
  const value = raw as Record<string, unknown>;
  const contact = value.contact && typeof value.contact === "object" && !Array.isArray(value.contact)
    ? value.contact as Record<string, unknown>
    : {};
  return websiteBriefSchema.parse({
    businessName: value.businessName,
    description: value.description ?? value.offer,
    audience: value.audience,
    primaryGoal: value.primaryGoal ?? value.goal,
    primaryCallToAction: value.primaryCallToAction ?? value.cta ?? "Contact us",
    contactEmail: value.contactEmail ?? contact.email,
    notes: value.notes,
  });
}

function pageSections(slug: string): PageConfig["sections"] {
  if (slug === "/") return [
    { type: "hero", visible: true, order: 0 },
    { type: "trust-strip", visible: true, order: 1 },
    { type: "services", visible: true, order: 2 },
    { type: "story", visible: true, order: 3 },
    { type: "testimonials", visible: true, order: 4 },
    { type: "faq", visible: true, order: 5 },
    { type: "contact", visible: true, order: 6 },
    { type: "cta", visible: true, order: 7, props: { ctaText: "Get in touch", ctaHref: "#contact" } },
  ];
  if (slug === "/about") return [
    { type: "page-header", visible: true, order: 0, props: { title: "About" } },
    { type: "story", visible: true, order: 1 },
    { type: "testimonials", visible: true, order: 2 },
    { type: "cta", visible: true, order: 3, props: { ctaText: "Get in touch", ctaHref: "/contact" } },
  ];
  return [
    { type: "page-header", visible: true, order: 0, props: { title: "Contact" } },
    { type: "contact", visible: true, order: 1 },
    { type: "faq", visible: true, order: 2 },
  ];
}

function specPagesToMap(spec: WebsiteSpec): SitePageConfig {
  const pages: SitePageConfig = {};
  const source = spec.pages && typeof spec.pages === "object" && !Array.isArray(spec.pages)
    ? spec.pages as Record<string, unknown>
    : {};
  for (const [key, raw] of Object.entries(source)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const page = raw as Record<string, unknown>;
    const slug = key === "home" || key === "/" ? "home" : key.replace(/^\/+/, "");
    const rawSections = Array.isArray(page.sections) ? page.sections : [];
    const sections: PageConfig["sections"] = [];
    rawSections.forEach((rawSection, order) => {
      if (!rawSection || typeof rawSection !== "object" || Array.isArray(rawSection)) return null;
      const section = rawSection as Record<string, unknown>;
      const type = typeof section.type === "string"
        ? section.type
        : typeof section.kind === "string" ? section.kind : "";
      const props = section.props && typeof section.props === "object" && !Array.isArray(section.props)
        ? section.props as Record<string, unknown>
        : section.content && typeof section.content === "object" && !Array.isArray(section.content)
          ? section.content as Record<string, unknown>
          : {};
      if (type) sections.push({ type, visible: section.visible !== false, order: typeof section.order === "number" ? section.order : order, props });
      return undefined;
    });
    const seo = page.seo && typeof page.seo === "object" && !Array.isArray(page.seo) ? page.seo as PageConfig["seo"] : undefined;
    pages[slug] = { sections: sections.length ? sections : pageSections(slug === "home" ? "/" : `/${slug}`), ...(seo ? { seo } : {}) };
  }
  if (!pages.home) {
    pages.home = { sections: pageSections("/"), seo: { title: spec.siteName } };
  }
  return pages;
}

function contentFromSpec(spec: WebsiteSpec): ContentMap {
  const content = blankContent();
  content.settings = { ...content.settings, siteName: spec.siteName, copyrightText: spec.siteName };
  const source = spec.content && typeof spec.content === "object" && !Array.isArray(spec.content)
    ? spec.content as Record<string, unknown>
    : {};
  for (const [key, value] of Object.entries(source)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    switch (key) {
      case "hero": content.hero = { ...content.hero, ...record }; break;
      case "services": content.services = { ...content.services, ...record, services: Array.isArray(record.services) ? record.services as ContentMap["services"]["services"] : content.services.services }; break;
      case "story": content.story = { ...content.story, ...record, paragraphs: Array.isArray(record.paragraphs) ? record.paragraphs as string[] : content.story.paragraphs }; break;
      case "testimonials": content.testimonials = { ...content.testimonials, ...record, testimonials: Array.isArray(record.testimonials) ? record.testimonials as ContentMap["testimonials"]["testimonials"] : content.testimonials.testimonials }; break;
      case "faq": content.faq = { ...content.faq, ...record, faqs: Array.isArray(record.faqs) ? record.faqs as ContentMap["faq"]["faqs"] : content.faq.faqs }; break;
      case "contact": content.contact = { ...content.contact, ...record }; break;
      case "settings": content.settings = { ...content.settings, ...record }; break;
      case "navigation": content.navigation = { ...content.navigation, ...record }; break;
      case "footer": content.footer = { ...content.footer, ...record }; break;
      default: break;
    }
  }
  return content;
}

function themeFromSpec(spec: WebsiteSpec): ThemeContent {
  const theme = spec.theme && typeof spec.theme === "object" && !Array.isArray(spec.theme) ? spec.theme as Record<string, unknown> : {};
  const colors = theme.colors && typeof theme.colors === "object" && !Array.isArray(theme.colors)
    ? { ...defaults.theme.colors, ...theme.colors as Record<string, unknown> }
    : defaults.theme.colors;
  return {
    ...structuredClone(defaults.theme),
    ...theme as Partial<ThemeContent>,
    colors,
  } as ThemeContent;
}

function renderData(draft: WebsiteDraft): GeneratedSite {
  const pages: Record<string, GeneratedPage> = {};
  for (const [slug, page] of Object.entries(draft.pages)) {
    pages[slug] = {
      sections: page.sections.map((section): GeneratedSection => ({
        type: section.type,
        visible: section.visible,
        order: section.order,
        props: section.props,
      })),
      seo: page.seo,
    };
  }
  return {
    version: 1,
    siteName: draft.spec.siteName,
    content: draft.content as unknown as Record<string, unknown>,
    pages,
    theme: draft.theme as unknown as Record<string, unknown>,
    publishedCapabilities: draft.spec.publishedCapabilities,
  };
}

function deterministicDraft(brief: WebsiteBrief, publishedCapabilities?: WebsitePublishedCapabilities): WebsiteDraft {
  const content = blankContent();
  const offer = brief.description;
  const audience = brief.audience?.trim() || "";
  const goal = brief.primaryGoal || "Get in touch to learn more.";
  const action = brief.primaryCallToAction;
  const actionHref = "#contact";
  // Notes can contain operator instructions, approval context, or internal
  // filenames. They help a structured provider, but are never public site
  // content. Build the deterministic story from the supplied business facts.
  const about = `${brief.businessName} offers ${offer}${audience ? ` for ${audience.toLowerCase()}` : ""}.`;
  content.settings = {
    ...content.settings,
    siteName: brief.businessName,
    siteTagline: offer,
    siteDescription: goal,
    siteKeywords: audience,
    ownerName: "",
    ownerTitle: "",
    trustBadge: "",
    footerTagline: goal,
    copyrightText: brief.businessName,
    bookingUrl: actionHref,
    brandVoice: "clear and useful",
  };
  content.hero = {
    ...content.hero,
    headline: brief.businessName,
    subheadline: audience,
    tagline: offer,
    ctaText: action,
    ctaLink: actionHref,
  };
  content.services = {
    ...content.services,
    headline: offer,
    description: goal,
    services: [{
      id: "brief-offer",
      name: offer,
      description: goal,
      duration: "",
      price: "",
      featured: true,
      who_its_for: audience,
      booking_link: actionHref,
      comingSoon: false,
      image_url: "",
    }],
  };
  content.story = {
    ...content.story,
    headline: `About ${brief.businessName}`,
    statement: about,
    paragraphs: [about],
  };
  content.contact = {
    ...content.contact,
    headline: action,
    description: brief.primaryGoal || `Send a message to ${brief.businessName}.`,
    email: brief.contactEmail || "",
  };
  content.faq = {
    ...content.faq,
    headline: "Common questions",
    faqs: audience ? [{ id: "brief-faq-1", question: `Who is ${brief.businessName} for?`, answer: `This site is for ${audience.toLowerCase()}.` }] : [],
  };
  content.navigation = {
    ...content.navigation,
    menuItems: [{ label: "About", href: "/about" }, { label: "Contact", href: "/contact" }],
    ctaLabel: action,
    ctaHref: actionHref,
  };
  content.footer = { ...content.footer, tagline: goal, copyrightText: brief.businessName };
  const spec = websiteSpecSchema.parse({
    version: WEBSITE_VERSION,
    siteName: brief.businessName,
    content: content as unknown as Record<string, unknown>,
    pages: {
      home: { sections: pageSections("/") },
      about: { sections: pageSections("/about") },
      contact: { sections: pageSections("/contact") },
    },
    theme: structuredClone(defaults.theme),
    ...(publishedCapabilities ? { publishedCapabilities } : {}),
  });
  const pages = specPagesToMap(spec);
  // The section payload is the persisted provider contract; the ContentMap is
  // the starter renderer projection. Keep both derived from this one draft.
  for (const page of Object.values(pages)) {
    for (const section of page.sections) {
      if (section.type === "hero") section.props = content.hero as unknown as Record<string, unknown>;
      if (section.type === "services") section.props = content.services as unknown as Record<string, unknown>;
      if (section.type === "story") section.props = content.story as unknown as Record<string, unknown>;
      if (section.type === "testimonials") section.props = content.testimonials as unknown as Record<string, unknown>;
      if (section.type === "faq") section.props = content.faq as unknown as Record<string, unknown>;
      if (section.type === "contact") section.props = content.contact as unknown as Record<string, unknown>;
    }
  }
  return { version: WEBSITE_VERSION, mode: WEBSITE_GENERATION_MODE.deterministic, brief, spec, content, pages, theme: themeFromSpec(spec) };
}

function normalizeProviderDraft(baseline: WebsiteDraft, value: unknown): WebsiteDraft {
  const candidate = value && typeof value === "object" && !Array.isArray(value) && "spec" in value
    ? (value as { spec?: unknown }).spec
    : value;
  const spec = websiteSpecSchema.safeParse(candidate);
  if (!spec.success) throw new WebsiteGenerationProviderError("The structured provider must return a valid WebsiteSpec.");
  // Capability bindings are selected by the server. A model may shape page
  // content, but it cannot add, remove, or replace a published connection.
  const { publishedCapabilities: _providerCapabilities, ...providerSpec } = spec.data;
  const parsedSpec = websiteSpecSchema.parse({
    ...providerSpec,
    ...(baseline.spec.publishedCapabilities ? { publishedCapabilities: baseline.spec.publishedCapabilities } : {}),
  });
  return {
    version: WEBSITE_VERSION,
    mode: WEBSITE_GENERATION_MODE.structuredProvider,
    brief: baseline.brief,
    spec: parsedSpec,
    content: contentFromSpec(parsedSpec),
    pages: specPagesToMap(parsedSpec),
    theme: themeFromSpec(parsedSpec),
  };
}

export function draftFromWebsiteSpec(specInput: WebsiteSpec, brief: WebsiteBrief): WebsiteDraft {
  const spec = websiteSpecSchema.parse(specInput);
  return {
    version: WEBSITE_VERSION,
    mode: WEBSITE_GENERATION_MODE.structuredProvider,
    brief,
    spec,
    content: contentFromSpec(spec),
    pages: specPagesToMap(spec),
    theme: themeFromSpec(spec),
  };
}

export async function generateWebsiteDraft(input: WebsiteGenerationInput, provider?: WebsiteGenerationProvider): Promise<WebsiteDraft> {
  const brief = normalizeBrief(input.brief);
  const publishedCapabilities = input.publishedCapabilities === undefined
    ? undefined
    : websitePublishedCapabilitiesSchema.parse(input.publishedCapabilities);
  const baseline = deterministicDraft(brief, publishedCapabilities);
  if (!provider) return baseline;
  const value = await provider({ version: WEBSITE_VERSION, rendererContractVersion: WEBSITE_RENDERER_CONTRACT_VERSION, brief, baseline });
  return normalizeProviderDraft(baseline, value);
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function websiteSpecContentHash(spec: WebsiteSpec): string {
  return createHash("sha256").update(canonicalJson(spec), "utf8").digest("hex");
}

export function websiteDraftPreviewHtml(draft: WebsiteDraft): string {
  return renderGeneratedSite(renderData(draft));
}

export async function generateWebsiteArtifact(input: WebsiteGenerationInput, provider?: WebsiteGenerationProvider) {
  const draft = await generateWebsiteDraft(input, provider);
  const { buildWebsiteArtifact } = await import("./artifact");
  return buildWebsiteArtifact({
    workspaceId: input.workspaceId,
    workId: input.workId,
    revision: input.revision,
    draft,
    generatedAt: input.now,
    previewHref: input.previewHref,
  });
}

export { renderData as websiteDraftRenderData };
export { websiteSpecSchema };
export type { WebsiteBrief, WebsiteSpec };
