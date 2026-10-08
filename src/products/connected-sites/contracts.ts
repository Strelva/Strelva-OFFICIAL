/**
 * Connected sites: a website built anywhere (Wix, Squarespace, a builder, a
 * developer) that a business connects to Strelva with one script line. Its
 * facts come from the business record; its inquiries go into the one lead
 * store; Strelva never edits its pages. Re-implemented from
 * feat/connected-sites onto the October 2026 model (website System spec,
 * decision 3 working default).
 *
 * Contracts and pure helpers only. Storage is store.ts; behavior is server.ts.
 */
import { z } from "zod";
import { verifiedProfileUrls, type PublicBusinessVerification } from "@/platform/business-record/verification";
import type { BusinessRecord } from "@/platform/business-record/contracts";
import { selectPublishedBusinessPolicies, type PublishedPolicies } from "@/platform/business-record/policies";
import { publishedPolicyRows, PAYMENT_LABELS } from "./published-policies";
import { platformSchemaHintSchema } from "./schema-hint";

export const SITE_KEY_PATTERN = /^sk_pub_[a-z0-9]{24}$/;
export const VERIFICATION_TOKEN_PATTERN = /^[a-z0-9]{32}$/;
/** `<meta name="strelva-site-verification" content="...">` on the live page proves control of the host. */
export const VERIFICATION_META_NAME = "strelva-site-verification";

export const PLATFORMS = [
  "unknown", "custom", "wix", "squarespace", "wordpress", "webflow", "shopify",
  "framer", "godaddy", "google-sites", "square", "duda", "carrd",
  "lovable", "v0", "bolt", "chatgpt", "claude", "strelva",
] as const;
export type SitePlatform = (typeof PLATFORMS)[number];

/** What a browser may report. Inquiries, replies and bookings are recorded by the server, never the beacon. */
export const BEACON_EVENT_KINDS = ["visit", "call_click", "email_click", "booking_click", "directions_click", "form_submit"] as const;
export type BeaconEventKind = (typeof BEACON_EVENT_KINDS)[number];

export interface ConnectedSite {
  id: string;
  workspaceId: string;
  publicKey: string;
  label: string;
  siteUrl: string;
  siteHost: string;
  allowedOrigins: string[];
  platform: SitePlatform;
  captureForms: boolean;
  injectSchema: boolean;
  status: "active" | "revoked";
  /** Shown to managers until the host is proven; null afterwards and for members. */
  verificationToken: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
  firstEventAt: string | null;
  lastEventAt: string | null;
}

/** What the public routes need about a site, by key. No workspace id leaves the server. */
export interface ResolvedConnectedSite {
  id: string;
  workspaceId: string;
  siteUrl: string;
  siteHost: string;
  allowedOrigins: string[];
  captureForms: boolean;
  injectSchema: boolean;
  verified: boolean;
}

export const connectedSiteSchema = z.object({
  id: z.string().uuid(), workspaceId: z.string().uuid(), publicKey: z.string().regex(SITE_KEY_PATTERN), label: z.string(),
  siteUrl: z.string(), siteHost: z.string(), allowedOrigins: z.array(z.string()), platform: z.enum(PLATFORMS),
  captureForms: z.boolean(), injectSchema: z.boolean(), status: z.enum(["active", "revoked"]),
  verificationToken: z.string().nullable().optional().transform(value => value ?? null),
  verifiedAt: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(), revokedAt: z.string().nullable(),
  firstEventAt: z.string().nullable(), lastEventAt: z.string().nullable(),
});

export const resolvedConnectedSiteSchema = z.object({
  id: z.string().uuid(), workspaceId: z.string().uuid(), siteUrl: z.string(), siteHost: z.string(), allowedOrigins: z.array(z.string()),
  captureForms: z.boolean(), injectSchema: z.boolean(), verified: z.boolean(),
});

export interface ConnectedInquiry {
  id: string;
  siteId: string;
  siteHost: string;
  leadId: string;
  name: string;
  email: string | null;
  message: string | null;
  source: string | null;
  capturedAt: string;
}

// ---------------------------------------------------------------------------
// Public context (GET /api/v1/connect/{siteKey}/context). The shape connect.js
// fills into `[data-strelva-fact]` elements, derived from the business record.

export interface PublicFacts {
  policies?: PublishedPolicies;
  name?: string;
  description?: string;
  phone?: string;
  email?: string;
  address?: { street?: string; locality?: string; region?: string; postalCode?: string; country?: string; formatted?: string };
  service_area?: string[];
  hours?: Array<{ day: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"; closed?: boolean; opens?: string; closes?: string }>;
  booking_url?: string;
  social_links?: string[];
  services?: Array<{ name: string; description?: string; priceText?: string }>;
}

export interface PublicContext {
  revision: number;
  facts: PublicFacts;
  jsonLd: Record<string, unknown> | null;
  site: { captureForms: boolean; injectSchema: boolean };
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const SOCIAL_KINDS = new Set(["instagram", "facebook", "linkedin", "yelp", "tiktok", "x", "youtube", "google_business"]);

/**
 * Business record facts (confirmed only; the SQL read filters them) to the
 * public shape. Weekly hours become one row per day; a day with no hours is
 * closed. Overrides stay on the record and are not served yet.
 */
export function publicFactsFromRecord(raw: { facts: Record<string, unknown>; services: Array<{ name: string; description?: string | null; priceText?: string | null }> }): PublicFacts {
  const facts = raw.facts;
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
  const out: PublicFacts = {};
  const name = text(facts.display_name) ?? text(facts.legal_name);
  if (name) out.name = name;
  if (text(facts.description)) out.description = text(facts.description);
  if (text(facts.phone)) out.phone = text(facts.phone);
  if (text(facts.email)) out.email = text(facts.email);
  const address = facts.address && typeof facts.address === "object" ? facts.address as Record<string, unknown> : null;
  if (address) {
    const street = [text(address.line1), text(address.line2)].filter(Boolean).join(", ") || undefined;
    out.address = { ...(street ? { street } : {}), ...(text(address.city) ? { locality: text(address.city) } : {}), ...(text(address.region) ? { region: text(address.region) } : {}),
      ...(text(address.postalCode) ? { postalCode: text(address.postalCode) } : {}), ...(text(address.country) ? { country: text(address.country) } : {}), ...(text(address.formatted) ? { formatted: text(address.formatted) } : {}) };
  }
  if (Array.isArray(facts.service_area)) out.service_area = facts.service_area.filter((item): item is string => typeof item === "string");
  const hours = facts.hours && typeof facts.hours === "object" ? facts.hours as { weekly?: Array<{ day: number; opens: string; closes: string }> } : null;
  if (hours && Array.isArray(hours.weekly)) {
    const order = [1, 2, 3, 4, 5, 6, 0];
    out.hours = order.flatMap((day): NonNullable<PublicFacts["hours"]> => {
      const ranges = hours.weekly!.filter(item => item.day === day);
      if (!ranges.length) return [{ day: DAY_KEYS[day]!, closed: true }];
      return ranges.map(range => ({ day: DAY_KEYS[day]!, opens: range.opens, closes: range.closes }));
    });
  }
  if (Array.isArray(facts.links)) {
    const links = facts.links as Array<{ kind?: string; url?: string }>;
    const booking = links.find(link => link.kind === "booking" && typeof link.url === "string");
    if (booking?.url) out.booking_url = booking.url;
    const social = links.filter(link => link.kind && SOCIAL_KINDS.has(link.kind) && typeof link.url === "string").map(link => link.url!);
    if (social.length) out.social_links = social;
  }
  if (raw.services.length) out.services = raw.services.map(service => ({ name: service.name, ...(service.description ? { description: service.description } : {}), ...(service.priceText ? { priceText: service.priceText } : {}) }));
  return out;
}

/** SQL has already enforced actor/publication access and excluded private facts.
 * Policies still pass through the canonical confirmation selector. */
export function publicFactsFromConfirmedRecord(workspaceId: string, raw: {
  revision: number; facts: Record<string, unknown>;
  services: Array<{ name: string; description?: string | null; priceText?: string | null }>;
  policyFacts?: BusinessRecord["facts"];
}): PublicFacts {
  const facts = publicFactsFromRecord(raw);
  const policies = selectPublishedBusinessPolicies({ workspaceId, revision: raw.revision, facts: raw.policyFacts ?? {} });
  if (Object.keys(policies).length) facts.policies = policies;
  if (policies.service_area) facts.service_area = policies.service_area.value;
  return facts;
}

/**
 * schema.org LocalBusiness from confirmed facts only, or null without a name.
 * The one serializer: connect.js, the public business page and the static
 * paste block all use it. Services become Offers of a Service; free-text
 * prices stay out (a price must be a number in schema.org, and none is guessed).
 */
export function businessJsonLd(facts: PublicFacts, siteUrl?: string | null, verification?: PublicBusinessVerification): Record<string, unknown> | null {
  if (!facts.name) return null;
  const ld: Record<string, unknown> = { "@context": "https://schema.org", "@type": "LocalBusiness", name: facts.name, ...(siteUrl ? { url: siteUrl } : {}) };
  if (facts.description) ld.description = facts.description;
  if (facts.phone) ld.telephone = facts.phone;
  if (facts.email) ld.email = facts.email;
  if (facts.address) {
    ld.address = { "@type": "PostalAddress", ...(facts.address.street ? { streetAddress: facts.address.street } : {}), ...(facts.address.locality ? { addressLocality: facts.address.locality } : {}),
      ...(facts.address.region ? { addressRegion: facts.address.region } : {}), ...(facts.address.postalCode ? { postalCode: facts.address.postalCode } : {}), ...(facts.address.country ? { addressCountry: facts.address.country } : {}) };
  }
  const open = (facts.hours ?? []).filter(row => !row.closed && row.opens && row.closes);
  if (open.length) {
    const names: Record<string, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
    ld.openingHoursSpecification = open.map(row => ({ "@type": "OpeningHoursSpecification", dayOfWeek: names[row.day], opens: row.opens, closes: row.closes }));
  }
  const sameAs = [...new Set([...(facts.social_links ?? []), ...(verification ? verifiedProfileUrls(verification) : [])])];
  if (sameAs.length) ld.sameAs = sameAs;
  if (facts.service_area?.length) ld.areaServed = facts.service_area;
  if (facts.services?.length) {
    ld.makesOffer = facts.services.map(service => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: service.name, ...(service.description ? { description: service.description } : {}) } }));
  }
  const policies = publishedPolicyRows(facts.policies);
  if (policies.length) ld.additionalProperty = policies.map(row => ({ "@type": "PropertyValue", propertyID: `strelva:policy:${row.key}`, name: row.label, value: row.text }));
  if (facts.policies?.payment_methods) ld.paymentAccepted = facts.policies.payment_methods.value.map(method => PAYMENT_LABELS[method]).join(", ");
  return ld;
}

// ---------------------------------------------------------------------------
// Public write contracts.

const clientId = z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/);
export const beaconEventSchema = z.object({
  id: clientId,
  kind: z.enum(BEACON_EVENT_KINDS),
  at: z.number().int().positive().optional(),
  path: z.string().max(500).optional(),
  ref: z.string().max(500).optional(),
  target: z.string().max(500).optional(),
});
export const beaconBatchSchema = z.object({ sid: clientId.optional(), events: z.array(beaconEventSchema).max(20), platformSchema: platformSchemaHintSchema.optional() })
  .refine(batch => batch.events.length > 0 || batch.platformSchema !== undefined, "An event or schema report is required");
export type BeaconBatch = z.infer<typeof beaconBatchSchema>;

export const publicInquirySchema = z.object({
  id: clientId,
  sid: clientId.optional(),
  capture: z.enum(["strelva-form", "site-form"]),
  path: z.string().max(500).optional(),
  ref: z.string().max(500).optional(),
  _hp: z.string().max(500).optional(),
  fields: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_ -]{0,63}$/), z.string().max(5000)).refine(fields => Object.keys(fields).length <= 30, "Too many fields"),
});
export type PublicInquiry = z.infer<typeof publicInquirySchema>;

// ---------------------------------------------------------------------------
// Helpers shared by the server, routes and tests.

/** scheme://host[:port], lowercase, http(s) only, no credentials. */
export function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return null;
  }
}

/** The site's own origin plus its www/apex twin. Nothing else is ever allowed. */
export function defaultAllowedOrigins(siteUrl: string): string[] {
  const origin = normalizeOrigin(siteUrl);
  if (!origin) return [];
  const url = new URL(origin);
  const origins = [origin];
  if (url.hostname.includes(".") && !/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) && url.hostname !== "localhost") {
    const twin = url.hostname.startsWith("www.") ? url.hostname.slice(4) : `www.${url.hostname}`;
    origins.push(`${url.protocol}//${twin}${url.port ? `:${url.port}` : ""}`);
  }
  return origins;
}

export function referrerHost(ref: string | undefined, ownOrigins: readonly string[]): string | null {
  if (!ref) return null;
  const origin = normalizeOrigin(ref);
  if (!origin || ownOrigins.includes(origin)) return null;
  return new URL(origin).hostname.slice(0, 255);
}

/** Query strings and fragments routinely carry emails and tokens; drop them. */
export function safePath(path: string | undefined): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) return null;
  return trimmed.split(/[?#]/)[0]!.slice(0, 500) || "/";
}

/** The usual contact fields, whatever names a site's form uses. */
export function contactFromFields(fields: Record<string, string>): { name: string | null; email: string | null; phone: string | null; message: string | null } {
  const entries = Object.entries(fields).map(([key, value]) => [key.toLowerCase().replace(/[\s_-]+/g, ""), value.trim()] as const);
  const pick = (test: (key: string) => boolean) => entries.find(([key, value]) => value && test(key))?.[1] ?? null;
  const first = pick(key => key === "firstname" || key === "fname");
  const last = pick(key => key === "lastname" || key === "lname");
  const name = pick(key => key === "name" || key === "fullname" || key === "yourname") ?? ([first, last].filter(Boolean).join(" ") || null);
  const emailRaw = pick(key => key.includes("email"));
  const email = emailRaw && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailRaw) ? emailRaw.slice(0, 320) : null;
  const phoneRaw = pick(key => key.includes("phone") || key === "tel" || key.includes("mobile"));
  const phone = phoneRaw && /^\+?[0-9 ().-]{7,24}$/.test(phoneRaw) ? phoneRaw : null;
  const message = pick(key => ["message", "comments", "comment", "details", "question", "body", "howcanwehelp", "notes", "description"].includes(key));
  return { name: name?.slice(0, 200) ?? null, email, phone, message: message?.slice(0, 5000) ?? null };
}

/**
 * Tokens found on a fetched page that could prove control of its host: the
 * verification meta tag and the site key on a connect script.
 */
export function verificationProofs(html: string): string[] {
  const found = new Set<string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!new RegExp(`\\bname=["']${VERIFICATION_META_NAME}["']`, "i").test(tag)) continue;
    const content = tag.match(/\bcontent=["']([a-z0-9]{32})["']/i)?.[1];
    if (content) found.add(content.toLowerCase());
  }
  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
    const key = tag.match(/\bdata-strelva-site=["'](sk_pub_[a-z0-9]{24})["']/i)?.[1];
    if (key) found.add(key.toLowerCase());
  }
  return [...found].slice(0, 20);
}
