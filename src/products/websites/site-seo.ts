import { APP_ROOT_DOMAIN, SITES_ROOT_DOMAIN, SITES_PATH_ORIGIN, isPlatformDomain, tenantHostedBaseUrl, sitePageUrl } from "@/platform/infra/brand";
import type { Metadata } from "next";
import type { SiteDocument } from "./site-document";
import type { TenantConfig } from "@/lib/types";
import { getTenantPublicUrlFromDomainMap, normalizeTenantDomain } from "@/lib/tenant-urls";

/** Canonicals are configuration, never a caller-controlled Host header. */
export function tenantCanonicalOrigin(tenant: string, config: TenantConfig | null | undefined): string {
  const preferred = normalizeTenantDomain(config?.productionDomain) || normalizeTenantDomain(config?.siteUrl);
  if (preferred && !((SITES_PATH_ORIGIN || SITES_ROOT_DOMAIN !== APP_ROOT_DOMAIN) && isPlatformDomain(preferred)) && !preferred.startsWith("admin.") && !preferred.endsWith(".vercel.app") && !preferred.includes("localhost") && /^[a-z0-9.-]+$/.test(preferred)) return `https://${preferred}`;
  const verified = config?.domainClaims?.find(claim => claim.status === "verified" && claim.role !== "admin" && !claim.domain.startsWith("admin."));
  const domain = normalizeTenantDomain(verified?.domain);
  if (domain && /^[a-z0-9.-]+$/.test(domain)) return `https://${domain}`;
  return getTenantPublicUrlFromDomainMap(tenant) || tenantHostedBaseUrl(tenant);
}
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
export function siteDocumentMetadata(document: SiteDocument, path: string, origin: string, preview = false): Metadata {
  const page = document.pages.find(item => item.path === path);
  if (!page) return { robots: { index: false, follow: false } };
  const url = sitePageUrl(path, origin);
  const logo = document.theme.logo ? document.assets[document.theme.logo] : undefined;
  const hero = Object.values(document.nodes).find(node => node.type === "Hero" && node.props.image);
  const imageId = hero?.type === "Hero" ? hero.props.image : undefined;
  const image = imageId ? document.assets[imageId] : undefined;
  return {
    metadataBase: new URL(origin), title: { absolute: page.title }, description: page.description,
    alternates: { canonical: url }, robots: preview ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: { title: page.title, description: page.description, type: "website", url, siteName: document.siteName, images: image ? [{ url: image.url, alt: image.alt, ...(image.width ? { width: image.width } : {}), ...(image.height ? { height: image.height } : {}) }] : [] },
    icons: logo ? { icon: logo.url, apple: logo.url } : { icon: [], apple: [] },
  };
}
/** Emit only document-backed details; no guessed prices, credentials or ratings. */
export function siteDocumentJsonLd(document: SiteDocument, origin: string, industry = ""): Record<string, unknown> {
  const category = Object.values(document.facts).find(fact => ["LegalService", "FoodEstablishment", "HealthAndBeautyBusiness", "LocalBusiness", "MedicalBusiness", "ProfessionalService", "AutomotiveBusiness", "HomeAndConstructionBusiness"].includes(fact.text) && (fact.origin === "owner_confirmed" || fact.verification?.supported))?.text;
  const schemaType = category ?? (/legal|law|attorney/i.test(industry) ? "LegalService" : /restaurant|food|cafe|bakery/i.test(industry) ? "FoodEstablishment" : /health|spa|salon|beauty/i.test(industry) ? "HealthAndBeautyBusiness" : "LocalBusiness");
  const locations = Object.values(document.nodes).find(node => node.type === "Locations");
  const location = locations?.type === "Locations" ? locations.props.items?.[0] : undefined;
  const review = Object.values(document.nodes).find(node => node.type === "ReviewSummary");
  const reviewFacts = review?.factIds.map(id => document.facts[id]) ?? [];
  const contacts = Object.values(document.facts).filter(fact => fact.kind === "contact" && (fact.origin === "owner_confirmed" || fact.origin === "owner_stated" || fact.verification?.supported));
  const phone = location?.phone ?? contacts.find(fact => /\+?[\d()\s-]{7,}/.test(fact.text))?.text.match(/\+?[\d()\s-]{7,}/)?.[0]?.trim();
  const email = contacts.find(fact => /[^\s@]+@[^\s@]+\.[^\s@]+/.test(fact.text))?.text.match(/[^\s@]+@[^\s@]+\.[^\s@]+/)?.[0];
  const logo = document.theme.logo ? document.assets[document.theme.logo] : undefined;
  const bookingPage = process.env.STRELVA_BOOKING_AGENTS === "1" && document.capabilities?.booking
    ? document.pages.find(page => { const seen = new Set<string>(); const hasBooking = (id: string): boolean => { if (seen.has(id)) return false; seen.add(id); const node = document.nodes[id]; return !!node && (node.type === "Booking" || node.children.some(hasBooking)); }; return hasBooking(page.root); }) : undefined;
  return { "@context": "https://schema.org", "@type": schemaType, name: document.siteName, url: origin, subjectOf: { "@type": "WebSite", "@id": `${origin}/#website`, name: document.siteName, url: origin }, description: document.pages.find(page => page.path === "/")?.description,
    ...(bookingPage ? { potentialAction: { "@type": "ReserveAction", target: sitePageUrl(bookingPage.path, origin) } } : {}),
    ...(phone ? { telephone: phone } : {}), ...(email ? { email } : {}), ...(location?.address ? { address: { "@type": "PostalAddress", streetAddress: location.address } } : {}),
    ...(logo ? { logo: new URL(logo.url, origin).toString() } : {}),
    ...(review?.type === "ReviewSummary" && review.props.rating !== undefined && review.props.count !== undefined && review.props.count > 0 && reviewFacts.length > 0 && reviewFacts.every(fact => fact && (fact.origin === "owner_confirmed" || fact.verification?.supported)) ? { aggregateRating: { "@type": "AggregateRating", ratingValue: review.props.rating, reviewCount: review.props.count } } : {}),
  };
}

/** FAQ answers are emitted only for visible, explicitly verified source-backed nodes. */
export function siteFaqJsonLd(document: SiteDocument, path = "/"): Record<string,unknown> | null {
  const page = document.pages.find(item => item.path === path);
  if (!page) return null;
  const visited = new Set<string>(); const answers: Array<Record<string,unknown>> = [];
  const visit = (id: string): void => {
    if (visited.has(id)) return; visited.add(id);
    const node = document.nodes[id]; if (!node) return;
    if (node.type === "Faq" && node.props.items?.length && node.factIds.length > 0 && node.factIds.every(factId => { const fact = document.facts[factId]; return fact && (fact.origin === "owner_confirmed" || fact.origin === "owner_stated" || fact.verification?.supported && fact.verification.confidence >= .85); })) {
      const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
      const facts = node.factIds.map(factId => document.facts[factId]!);
      for (const item of node.props.items) if (item.question && item.answer && facts.some(fact => normalize(fact.text) === normalize(item.answer) || fact.sources.some(source => normalize(source.quote) === normalize(item.answer)))) answers.push({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } });
    }
    node.children.forEach(visit);
  }; visit(page.root);
  return answers.length ? { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: answers } : null;
}
