/**
 * The business's own look on the pages its visitors open (booking, the offer
 * from an inquiry, the manage link, payment) and in the email they get.
 * Presentation only: a brand never grants anything and never names Strelva.
 *
 * The source is the business's own record, in this order:
 * 1. its published native website (palette, accent, logo, the hero photo),
 * 2. the tenant's recorded branding (one accent color).
 * Nothing found means no brand, and the pages keep their neutral paper look.
 *
 * Every color is checked before use: an accent that would not read on the
 * page (contrast under 4.5 against the canvas) is dropped, never shown.
 */
import { SITE_PALETTES, safeSiteHref } from "./site-render-tree";
import type { SiteDocument } from "./site-document";

export interface VisitorBrandColors {
  canvas: string; surface: string; text: string; muted: string; line: string; inset: string;
  accent: string; onAccent: string;
}

export interface VisitorBrand {
  colors: VisitorBrandColors;
  /** The business's logo as its website shows it. */
  logo?: { url: string; alt: string } | null;
  /** One photo from the business's own home page, for the wide booking page. */
  photo?: { url: string; alt: string } | null;
  /** The business's own website, so its name in the header goes home. */
  website?: string | null;
}

const HEX = /^#[0-9a-f]{6}$/i;

function luminance(hex: string): number {
  const values = hex.slice(1).match(/.{2}/g)!.map(value => Number.parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return values[0]! * .2126 + values[1]! * .7152 + values[2]! * .0722;
}

export function visitorContrast(a: string, b: string): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

/** The label on an accent fill: whichever of white or near-black reads better. */
function onAccentFor(accent: string): string {
  return visitorContrast(accent, "#ffffff") >= visitorContrast(accent, "#161715") ? "#ffffff" : "#161715";
}

/** A light page in the business's accent: what a brand with only a color gets. */
function paletteWith(base: (typeof SITE_PALETTES)[keyof typeof SITE_PALETTES], accent?: string | null): VisitorBrandColors {
  const usable = accent && HEX.test(accent) && visitorContrast(accent, base.background) >= 4.5 ? accent.toLowerCase() : null;
  return {
    canvas: base.background, surface: base.background, text: base.text, muted: base.muted, line: base.border, inset: base.surface,
    accent: usable ?? base.accent, onAccent: usable ? onAccentFor(usable) : base.onAccent,
  };
}

function asset(doc: SiteDocument, id: string | undefined, alt: string): { url: string; alt: string } | null {
  const found = id ? doc.assets[id] : undefined;
  if (!found || !safeSiteHref(found.url) || !/^https?:|^\//i.test(found.url)) return null;
  return { url: found.url, alt: found.alt?.trim() || alt };
}

/** Reads the business's published native website. Pure. */
export function visitorBrandFromSiteDocument(doc: SiteDocument, website?: string | null): VisitorBrand {
  const colors = paletteWith(SITE_PALETTES[doc.theme.palette], doc.theme.accent);
  const hero = Object.values(doc.nodes).find(node => node?.type === "Hero" && typeof (node.props as { image?: unknown }).image === "string");
  return {
    colors,
    logo: asset(doc, doc.theme.logo, doc.siteName),
    photo: hero ? asset(doc, (hero.props as { image?: string }).image, "") : null,
    website: website && /^https:\/\//.test(website) ? website : null,
  };
}

/** Reads a tenant's recorded branding (its one accent). Null when there is nothing usable. Pure. */
export function visitorBrandFromAccent(accent: string | null | undefined, website?: string | null): VisitorBrand | null {
  if (!accent || !HEX.test(accent)) return null;
  const colors = paletteWith(SITE_PALETTES.light, accent);
  if (colors.accent !== accent.toLowerCase()) return null;
  return { colors, website: website && /^https:\/\//.test(website) ? website : null };
}

/** The --visitor-* variables the visitor stylesheet reads first. Empty without a brand. */
export function visitorBrandStyle(brand: VisitorBrand | null | undefined): Record<string, string> {
  if (!brand) return {};
  const c = brand.colors;
  return {
    "--visitor-canvas": c.canvas, "--visitor-surface": c.surface, "--visitor-text": c.text, "--visitor-muted": c.muted,
    "--visitor-line": c.line, "--visitor-inset": c.inset, "--visitor-accent": c.accent, "--visitor-on-accent": c.onAccent,
  };
}

/** The brand an email can carry: the accent fill and its label, and the logo when the business has one. */
export function visitorBrandForMail(brand: VisitorBrand | null | undefined): { accent: string; onAccent: string; logoUrl: string | null } | null {
  if (!brand) return null;
  const logo = brand.logo?.url && /^https:\/\//.test(brand.logo.url) ? brand.logo.url : null;
  return { accent: brand.colors.accent, onAccent: brand.colors.onAccent, logoUrl: logo };
}
