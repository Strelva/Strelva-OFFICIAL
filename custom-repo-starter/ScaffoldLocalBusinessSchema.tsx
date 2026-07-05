/**
 * Scaffold Web LocalBusiness JSON-LD emitter for custom-repo client sites.
 *
 * Renders a single <script type="application/ld+json"> LocalBusiness schema from
 * props. Local-business sites that ship this schema get richer Google results
 * (name, phone, hours, map pin) — and our OWN audit engine grades a prospect
 * DOWN for missing it, so every client build should emit it.
 *
 * Server-safe on purpose: NO "use client". It renders the same deterministic
 * markup on the server and the client, so there is no hydration mismatch and no
 * client JS is shipped for it. Self-contained: imports only React (no
 * `@/lib/...`), a true single-file drop-in — the same contract the other
 * starter components follow.
 *
 * Honesty rule: any prop you don't pass is OMITTED from the output. It never
 * emits an empty string, a placeholder, or a fabricated value — a missing field
 * simply isn't in the schema.
 *
 * Usage (in a server component, typically the root layout or a page):
 *
 *   import { ScaffoldLocalBusinessSchema } from "@/components/ScaffoldLocalBusinessSchema";
 *
 *   <ScaffoldLocalBusinessSchema
 *     name="Green Leaf Dental"
 *     url="https://greenleafdental.com"
 *     phone="+1-716-555-0100"
 *     priceRange="$$"
 *     address={{ streetAddress: "12 Main St", addressLocality: "Buffalo",
 *                addressRegion: "NY", postalCode: "14201", addressCountry: "US" }}
 *     geo={{ latitude: 42.8864, longitude: -78.8784 }}
 *     hours={["Mo-Fr 09:00-17:00", "Sa 10:00-14:00"]}
 *     sameAs={["https://www.facebook.com/greenleaf", "https://instagram.com/greenleaf"]}
 *   />
 */

import type { ReactElement } from "react";

export interface LocalBusinessAddress {
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  addressCountry?: string;
}

export interface LocalBusinessGeo {
  latitude: number;
  longitude: number;
}

export interface ScaffoldLocalBusinessSchemaProps {
  /** Business name — the one required field. */
  name: string;
  /** More specific schema.org type, e.g. "Dentist", "Restaurant". Default "LocalBusiness". */
  type?: string;
  url?: string;
  /** Rendered as schema.org `telephone`. */
  phone?: string;
  email?: string;
  description?: string;
  /** One image URL or several. */
  image?: string | string[];
  /** e.g. "$", "$$", "$$$". */
  priceRange?: string;
  address?: LocalBusinessAddress;
  geo?: LocalBusinessGeo;
  /** schema.org `openingHours` strings, e.g. "Mo-Fr 09:00-17:00". */
  hours?: string[];
  /** Profile/social URLs, rendered as schema.org `sameAs`. */
  sameAs?: string[];
}

type JsonLd = Record<string, unknown>;

function cleanString(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

/** Drop empty-string / undefined members; return undefined if nothing is left. */
function compactAddress(address: LocalBusinessAddress | undefined): JsonLd | undefined {
  if (!address) return undefined;
  const out: JsonLd = {};
  for (const key of ["streetAddress", "addressLocality", "addressRegion", "postalCode", "addressCountry"] as const) {
    const v = cleanString(address[key]);
    if (v) out[key] = v;
  }
  if (Object.keys(out).length === 0) return undefined;
  return { "@type": "PostalAddress", ...out };
}

function compactGeo(geo: LocalBusinessGeo | undefined): JsonLd | undefined {
  if (!geo) return undefined;
  const { latitude, longitude } = geo;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  return { "@type": "GeoCoordinates", latitude, longitude };
}

/**
 * Build the LocalBusiness JSON-LD object, omitting every field that wasn't
 * provided. Pure + exported so it is unit-testable without rendering.
 */
export function buildLocalBusinessSchema(props: ScaffoldLocalBusinessSchemaProps): JsonLd {
  const schema: JsonLd = {
    "@context": "https://schema.org",
    "@type": cleanString(props.type) ?? "LocalBusiness",
    name: props.name.trim(),
  };

  const url = cleanString(props.url);
  if (url) schema.url = url;

  const phone = cleanString(props.phone);
  if (phone) schema.telephone = phone;

  const email = cleanString(props.email);
  if (email) schema.email = email;

  const description = cleanString(props.description);
  if (description) schema.description = description;

  if (typeof props.image === "string") {
    const img = cleanString(props.image);
    if (img) schema.image = img;
  } else if (Array.isArray(props.image)) {
    const imgs = props.image.map((i) => cleanString(i)).filter((i): i is string => Boolean(i));
    if (imgs.length) schema.image = imgs;
  }

  const priceRange = cleanString(props.priceRange);
  if (priceRange) schema.priceRange = priceRange;

  const address = compactAddress(props.address);
  if (address) schema.address = address;

  const geo = compactGeo(props.geo);
  if (geo) schema.geo = geo;

  if (Array.isArray(props.hours)) {
    const hours = props.hours.map((h) => cleanString(h)).filter((h): h is string => Boolean(h));
    if (hours.length) schema.openingHours = hours;
  }

  if (Array.isArray(props.sameAs)) {
    const sameAs = props.sameAs.map((s) => cleanString(s)).filter((s): s is string => Boolean(s));
    if (sameAs.length) schema.sameAs = sameAs;
  }

  return schema;
}

/**
 * Renders one <script type="application/ld+json"> with the LocalBusiness schema.
 * Server-safe (no hydration), self-contained, omits any field not passed.
 */
export function ScaffoldLocalBusinessSchema(props: ScaffoldLocalBusinessSchemaProps): ReactElement {
  const schema = buildLocalBusinessSchema(props);
  // Escape "<" so a value can never close the <script> element early (the one
  // injection vector for inline JSON-LD). JSON.stringify already escapes quotes.
  const json = JSON.stringify(schema).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
