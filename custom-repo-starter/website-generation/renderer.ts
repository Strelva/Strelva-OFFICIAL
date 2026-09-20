/**
 * Small, dependency-free renderer used by generated client repositories.
 *
 * The control plane uses this same renderer for the local preview and copies
 * its runtime into the per-client export. It deliberately renders data only:
 * text is escaped, links are protocol checked, and no brief or model output is
 * evaluated as code.
 */

export interface GeneratedSection {
  type: string;
  visible: boolean;
  order: number;
  props?: Record<string, unknown>;
}

export interface GeneratedPage {
  sections: GeneratedSection[];
  seo?: { title?: string; description?: string; ogImage?: string };
}

export interface GeneratedSite {
  version: 1;
  siteName: string;
  content: Record<string, unknown>;
  pages: Record<string, GeneratedPage>;
  theme: Record<string, unknown>;
  /** Pinned artifact metadata; ignored by the renderer but carried into build receipts. */
  rendererDigest?: string;
  publishedCapabilities?: GeneratedPublishedCapabilities;
}

export interface GeneratedPublishedCapabilities {
  baseUrl: string;
  tenant: string;
  inquiry?: { capabilityId: string; version: number };
  booking?: { capabilityId: string; version: number; range: { from: string; to: string } };
}

type Dict = Record<string, unknown>;

function dict(value: unknown): Dict {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Dict : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Permit ordinary site links while rejecting script and data URLs. */
export function safeHref(value: unknown, fallback = "#"): string {
  const candidate = stringValue(value).trim();
  if (!candidate) return fallback;
  if ((candidate.startsWith("/") && !candidate.startsWith("//")) || candidate.startsWith("#")) return candidate;
  if (/^(https?:|mailto:|tel:)/i.test(candidate)) return candidate;
  return fallback;
}

function safeCss(value: unknown, fallback: string): string {
  const candidate = stringValue(value).trim();
  // Keep the accepted grammar deliberately narrow. In particular, do not let
  // arbitrary text reach a <style> element through a model-supplied theme.
  const rgb = /^rgba?\(\s*(?:\d{1,3}%?\s*,\s*){2}\d{1,3}%?(?:\s*,\s*(?:0|1|0?\.\d+|100%))?\s*\)$/i;
  const hsl = /^hsla?\(\s*\d{1,3}(?:deg)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*(?:0|1|0?\.\d+|100%))?\s*\)$/i;
  if (/^#[0-9a-f]{3,8}$/i.test(candidate) || rgb.test(candidate) || hsl.test(candidate) || /^[a-z][a-z0-9-]*$/i.test(candidate)) {
    return candidate;
  }
  return fallback;
}

function themeCss(theme: Dict): string {
  const colors = dict(theme.colors);
  const vars: Record<string, string> = {
    "--cream": safeCss(colors.cream, "#faf8f5"),
    "--cream-dark": safeCss(colors.creamDark, "#f0ece5"),
    "--cream-mid": safeCss(colors.creamMid, "#e8e2d8"),
    "--sage": safeCss(colors.sage, "#5a260c"),
    "--sage-dark": safeCss(colors.sageDark, "#3d1a08"),
    "--bark": safeCss(colors.bark, "#2c2418"),
    "--bark-light": safeCss(colors.barkLight, "#5a4d3e"),
    "--bark-faded": safeCss(colors.barkFaded, "#8a7d6e"),
  };
  return Object.entries(vars).map(([key, value]) => `${key}:${value}`).join(";");
}

function renderHero(content: Dict): string {
  const hero = dict(content.hero);
  const settings = dict(content.settings);
  const headline = stringValue(hero.headline, stringValue(settings.siteName, "Your business"));
  return `<section id="hero" class="hero"><p class="eyebrow">${escapeHtml(hero.subheadline)}</p><h1>${escapeHtml(headline).replace(/\n/g, "<br>")}</h1><p class="lead">${escapeHtml(hero.tagline)}</p><a class="button" href="${escapeHtml(safeHref(hero.ctaLink, "#contact"))}">${escapeHtml(hero.ctaText || "Get in touch")}</a></section>`;
}

function renderServices(content: Dict): string {
  const services = dict(content.services);
  const items = Array.isArray(services.services) ? services.services : [];
  const cards = items.map((item) => {
    const service = dict(item);
    const link = safeHref(service.booking_link, "#contact");
    return `<article class="service"><h3>${escapeHtml(service.name)}</h3><p>${escapeHtml(service.description)}</p>${service.duration || service.price ? `<p class="meta">${escapeHtml([service.duration, service.price].filter(Boolean).join(" · "))}</p>` : ""}<a href="${escapeHtml(link)}">Learn more</a></article>`;
  }).join("");
  return `<section id="services" class="section"><p class="eyebrow">${escapeHtml(services.sectionLabel || "Services")}</p><h2>${escapeHtml(services.headline || "What we offer")}</h2><p class="lead">${escapeHtml(services.description)}</p>${cards ? `<div class="services">${cards}</div>` : `<p class="empty">Services will be added as the business takes shape.</p>`}</section>`;
}

function renderStory(content: Dict): string {
  const story = dict(content.story);
  const paragraphs = Array.isArray(story.paragraphs) ? story.paragraphs : [];
  return `<section id="story" class="section"><p class="eyebrow">${escapeHtml(story.sectionLabel || "About")}</p><h2>${escapeHtml(story.headline)}</h2><p class="lead">${escapeHtml(story.statement)}</p>${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}</section>`;
}

function renderTestimonials(content: Dict): string {
  const testimonials = dict(content.testimonials);
  const items = Array.isArray(testimonials.testimonials) ? testimonials.testimonials : [];
  if (!items.length) return "";
  return `<section class="section"><p class="eyebrow">${escapeHtml(testimonials.sectionLabel || "Testimonials")}</p><h2>${escapeHtml(testimonials.headline)}</h2><div class="testimonials">${items.map((item) => { const row = dict(item); return `<figure><blockquote>“${escapeHtml(row.quote)}”</blockquote><figcaption>${escapeHtml(row.author)}${row.location ? ` · ${escapeHtml(row.location)}` : ""}</figcaption></figure>`; }).join("")}</div></section>`;
}

function renderFaq(content: Dict): string {
  const faq = dict(content.faq);
  const items = Array.isArray(faq.faqs) ? faq.faqs : [];
  if (!items.length) return "";
  return `<section class="section"><p class="eyebrow">${escapeHtml(faq.sectionLabel || "FAQ")}</p><h2>${escapeHtml(faq.headline)}</h2>${items.map((item) => { const row = dict(item); return `<details><summary>${escapeHtml(row.question)}</summary><p>${escapeHtml(row.answer)}</p></details>`; }).join("")}</section>`;
}

function renderContact(content: Dict): string {
  const contact = dict(content.contact);
  const links: string[] = [];
  if (contact.email) links.push(`<a href="${escapeHtml(safeHref(`mailto:${stringValue(contact.email)}`))}">${escapeHtml(contact.email)}</a>`);
  if (contact.phone) links.push(`<a href="${escapeHtml(safeHref(`tel:${stringValue(contact.phone)}`))}">${escapeHtml(contact.phone)}</a>`);
  return `<section id="contact" class="section contact"><p class="eyebrow">Contact</p><h2>${escapeHtml(contact.headline || "Let’s talk")}</h2><p class="lead">${escapeHtml(contact.description)}</p>${links.join(" · ")}${contact.address ? `<p>${escapeHtml(contact.address)}</p>` : ""}${contact.hours ? `<p class="meta">${escapeHtml(contact.hours)}</p>` : ""}</section>`;
}

function renderCta(content: Dict, props: Dict): string {
  const settings = dict(content.settings);
  const label = stringValue(props.ctaText, "Take the next step");
  const href = safeHref(props.ctaHref, safeHref(settings.bookingUrl, "#contact"));
  return `<section class="cta"><h2>${escapeHtml(props.heading || "Ready to begin?")}</h2><a class="button inverse" href="${escapeHtml(href)}">${escapeHtml(label)}</a></section>`;
}

function capabilityConfig(value: unknown): string {
  // The projection was validated at the server boundary. Escaping the JSON
  // before placing it in an attribute keeps the generated document inert even
  // if an upstream API changes its error or tenant text.
  return escapeHtml(JSON.stringify(value).replace(/</g, "\\u003c"));
}

function renderPublishedCapabilities(site: GeneratedSite): string {
  const capabilities = site.publishedCapabilities;
  if (!capabilities) return "";
  const sections: string[] = [];
  if (capabilities.inquiry) {
    sections.push(`<section id="inquiry-capability" class="section capability"><p class="eyebrow">Contact</p><h2>Send a request</h2><div data-strelva-capability="inquiry" data-strelva-config="${capabilityConfig({ baseUrl: capabilities.baseUrl, tenant: capabilities.tenant, inquiry: capabilities.inquiry })}"><p role="status">Loading inquiry form…</p></div></section>`);
  }
  if (capabilities.booking) {
    sections.push(`<section id="booking-capability" class="section capability"><p class="eyebrow">Appointments</p><h2>Choose a time</h2><div data-strelva-capability="booking" data-strelva-config="${capabilityConfig({ baseUrl: capabilities.baseUrl, tenant: capabilities.tenant, booking: capabilities.booking })}"><p role="status">Loading booking times…</p></div></section>`);
  }
  return sections.join("");
}

function renderSection(section: GeneratedSection, content: Dict): string {
  const props = dict(section.props);
  switch (section.type) {
    case "hero": return renderHero(content);
    case "services": return renderServices(content);
    case "story": return renderStory(content);
    case "testimonials":
    case "testimonial-quote": return renderTestimonials(content);
    case "faq": return renderFaq(content);
    case "contact": return renderContact(content);
    case "cta": return renderCta(content, props);
    case "trust-strip": {
      const settings = dict(content.settings);
      const labels = [settings.trustBadge, settings.ownerTitle].filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
      return labels.length ? `<section class="trust">${labels.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}</section>` : "";
    }
    case "page-header": return `<section class="section page-header"><p class="eyebrow">${escapeHtml(props.kicker || "")}</p><h1>${escapeHtml(props.title || dict(content.settings).siteName || "Your website")}</h1><p class="lead">${escapeHtml(props.description || "")}</p></section>`;
    default: return "";
  }
}

export function renderGeneratedPage(site: GeneratedSite, pageKey: string): string {
  const content = dict(site.content);
  const settings = dict(content.settings);
  const page = site.pages[pageKey] ?? site.pages.home;
  if (!page) return "";
  const title = stringValue(page.seo?.title, stringValue(settings.siteName, site.siteName));
  const description = stringValue(page.seo?.description, stringValue(settings.siteDescription));
  const sections = page.sections.filter((section) => section.visible).sort((a, b) => a.order - b.order).map((section) => renderSection(section, content)).join("") + (pageKey === "home" ? renderPublishedCapabilities(site) : "");
  const nav = Object.entries(site.pages).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([slug, candidate]) => `<a href="${escapeHtml(slug === "home" ? "/" : `/${slug}`)}">${escapeHtml(candidate.seo?.title || slug)}</a>`).join("");
  const runtime = site.publishedCapabilities ? `<script type="module" src="/website-generation/capability-runtime.mjs" defer></script>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><style>:root{${themeCss(dict(site.theme))}}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--cream);color:var(--bark);font-family:Arial,sans-serif;line-height:1.6}a{color:var(--sage);text-underline-offset:3px}.site-nav{display:flex;gap:1rem;justify-content:space-between;align-items:center;padding:1.25rem max(1.25rem,calc((100vw - 72rem)/2));border-bottom:1px solid var(--cream-mid);background:var(--cream)}.site-nav nav{display:flex;gap:1rem;flex-wrap:wrap}.wrap{max-width:72rem;margin:0 auto;padding:0 1.25rem}.hero{min-height:54vh;padding:clamp(5rem,12vw,9rem) 1.25rem 5rem;background:var(--bark);color:var(--cream)}.hero h1,.page-header h1{max-width:15ch;font-size:clamp(2.5rem,7vw,5.5rem);line-height:1.02;margin:.5rem 0 1rem}.section{padding:clamp(3rem,8vw,6rem) 0}.section h2,.cta h2{font-size:clamp(2rem,4vw,3.5rem);line-height:1.1;margin:.4rem 0 1rem}.eyebrow,.meta{font-size:.75rem;letter-spacing:.12em;text-transform:uppercase;color:var(--bark-faded)}.lead{font-size:1.15rem;max-width:42rem}.button{display:inline-block;padding:.8rem 1.2rem;background:var(--sage);color:#fff;text-decoration:none;border-radius:.35rem}.button.inverse{background:var(--cream);color:var(--bark)}.trust{display:flex;gap:2rem;flex-wrap:wrap;padding:1rem 1.25rem;background:var(--cream-dark);color:var(--bark-faded);font-size:.8rem;text-transform:uppercase;letter-spacing:.08em}.services,.testimonials{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:1rem;margin-top:2rem}.service,figure{margin:0;padding:1.25rem;background:var(--cream-dark);border:1px solid var(--cream-mid)}details{padding:1rem 0;border-bottom:1px solid var(--cream-mid)}summary{cursor:pointer;font-weight:600}.contact{background:var(--cream-dark);padding-left:1.25rem;padding-right:1.25rem}.cta{padding:4rem 1.25rem;background:var(--sage);color:#fff;text-align:center}.capability form{display:grid;gap:.75rem;max-width:40rem}.capability form>div{display:grid;gap:.4rem}.capability label{display:block;font-weight:600}.capability input,.capability select,.capability textarea{display:block;width:100%;min-width:0;max-width:100%;min-height:44px;padding:.7rem .8rem;border:1px solid var(--bark-faded);border-radius:.35rem;background:var(--cream);color:var(--bark);font:inherit}.capability textarea{min-height:7rem;resize:vertical}.capability button{min-height:44px;padding:.8rem 1.2rem;border:0;border-radius:.35rem;background:var(--sage);color:#fff;font:inherit;cursor:pointer}.capability form>button{justify-self:start}.capability button:disabled{opacity:.6;cursor:wait}.capability :is(input,select,textarea,button):focus-visible{outline:3px solid var(--sage);outline-offset:3px}.capability [aria-label="Booking receipt"]{max-width:40rem;margin-top:2rem;padding-top:1rem;border-top:1px solid var(--cream-mid)}.capability [aria-label="Booking receipt"] button{margin:.5rem .5rem 0 0}.capability [role="status"]:empty{display:none}.site-footer{padding:2rem 1.25rem;background:var(--bark);color:var(--cream)}@media(max-width:720px){.site-nav{align-items:flex-start;flex-direction:column}.site-nav nav{gap:.75rem}.wrap{padding:0 1rem}.hero{min-height:60vh;padding-top:5.5rem}.section{padding-top:3.5rem;padding-bottom:3.5rem}.services,.testimonials{grid-template-columns:1fr}.trust{gap:.75rem;flex-direction:column}}</style>${runtime}</head><body><header class="site-nav"><a href="/" aria-label="${escapeHtml(site.siteName)}">${escapeHtml(site.siteName)}</a><nav>${nav}</nav></header><main class="wrap">${sections}</main><footer class="site-footer"><strong>${escapeHtml(settings.siteName || site.siteName)}</strong><p>${escapeHtml(settings.footerTagline || settings.siteDescription)}</p></footer></body></html>`;
}

export function renderGeneratedSite(site: GeneratedSite): string {
  return renderGeneratedPage(site, "home");
}

export function renderGeneratedPages(site: GeneratedSite): Record<string, string> {
  return Object.fromEntries(Object.keys(site.pages).sort().map((pageKey) => [pageKey, renderGeneratedPage(site, pageKey)]));
}
