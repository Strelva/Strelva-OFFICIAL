import crypto from "crypto";
import { assignUserToTenant } from "./auth";
import { defaults } from "./defaults";
import { getDefaultPageConfig } from "./pageConfigDefaults";
import { getRedis } from "./redis";
import { logAuditEvent, setContent, setPageConfig } from "./storage";
import { getTenantDashboardUrl, getTenantPublicUrl } from "./tenant-urls";
import { createTenant, getAllTenants } from "./tenants";
import type { ActorContext } from "./auth";
import type {
  ContentMap,
  ContentSection,
  TemplateId,
  TenantConfig,
  TenantFeature,
} from "./types";

export const SELF_SERVE_CONTENT_SECTIONS: ContentSection[] = [
  "hero",
  "services",
  "story",
  "testimonials",
  "events",
  "providers",
  "contact",
  "settings",
  "faq",
  "shop",
  "products",
  "theme",
  "rewardsConfig",
  "navigation",
  "footer",
];

const TEMPLATE_BY_INDUSTRY: Record<string, TemplateId> = {
  wellness: "wellness",
  spa: "wellness",
  fitness: "wellness",
  yoga: "wellness",
  restaurant: "restaurant",
  food: "restaurant",
  "food-brand": "food-brand",
  retail: "food-brand",
  trades: "trades",
  contractor: "trades",
  plumbing: "trades",
  electrical: "trades",
  professional: "professional",
  services: "professional",
  legal: "professional",
  accounting: "professional",
};

const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "billing",
  "dashboard",
  "login",
  "scaffold",
  "scaffoldweb",
  "sign-in",
  "sign-up",
  "studio",
  "support",
  "www",
]);

export interface SelfServeTenantInput {
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  clerkUserId: string;
  industry?: string;
  template?: TemplateId;
  requestedSlug?: string;
  description?: string;
  location?: string;
  currentWebsite?: string;
  bookingUrl?: string;
  ownerPhone?: string;
  referredBy?: string;
}

export interface SelfServeTenantResult {
  tenant: TenantConfig;
  dashboardUrl: string;
  publicUrl: string;
  seededSections: ContentSection[];
}

export class SelfServeProvisioningError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "SelfServeProvisioningError";
  }
}

export function normalizeTenantSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

export function validateTenantSlug(slug: string): string | null {
  if (!slug) return "Choose a business name or subdomain.";
  if (slug.length < 3) return "Subdomain must be at least 3 characters.";
  if (slug.length > 48) return "Subdomain must be 48 characters or fewer.";
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    return "Subdomain can only use lowercase letters, numbers, and hyphens.";
  }
  if (RESERVED_SLUGS.has(slug)) {
    return "That subdomain is reserved.";
  }
  return null;
}

export function inferSelfServeTemplate(industry: string | undefined): TemplateId {
  const normalized = normalizeTenantSlug(industry || "professional");
  return TEMPLATE_BY_INDUSTRY[normalized] || "professional";
}

function generateSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

function cloneContent<K extends ContentSection>(section: K): ContentMap[K] {
  return structuredClone(defaults[section]);
}

function truncate(value: string | undefined, fallback: string, max = 180): string {
  const text = value?.trim() || fallback;
  return text.length > max ? `${text.slice(0, max - 1).trim()}...` : text;
}

export function buildSelfServeStarterContent(input: SelfServeTenantInput): ContentMap {
  const businessName = input.businessName.trim();
  const ownerName = input.ownerName.trim();
  const description = truncate(
    input.description,
    `${businessName} helps local customers get what they need with clear service, easy booking, and a site that stays current.`,
    220,
  );
  const location = input.location?.trim() || "Serving our local community";
  const bookingUrl = input.bookingUrl?.trim() || "";
  const ctaText = bookingUrl ? "Book Now" : "Get in Touch";
  const ctaLink = bookingUrl || "#contact";

  const content = Object.fromEntries(
    SELF_SERVE_CONTENT_SECTIONS.map((section) => [section, cloneContent(section)]),
  ) as ContentMap;

  content.hero = {
    ...content.hero,
    headline: businessName,
    subheadline: location,
    tagline: description,
    ctaText,
    ctaLink,
  };

  content.services = {
    ...content.services,
    headline: "What We Offer",
    description: "Add your core services, products, or offers here. The AI can help shape this after signup.",
    services: [],
  };

  content.story = {
    ...content.story,
    headline: `About\n${businessName}`,
    accentText: ownerName ? `${ownerName}, owner` : "Local business",
    statement: description,
    paragraphs: [
      `${businessName} is getting set up on Scaffold Web so the site can stay current without becoming another chore.`,
      "Add your story, services, photos, proof, and booking details here. The AI can draft and update this as the business grows.",
    ],
    quote: "",
    quoteAttribution: ownerName || businessName,
  };

  content.contact = {
    ...content.contact,
    email: input.ownerEmail.trim().toLowerCase(),
    phone: input.ownerPhone?.trim() || "",
    address: location,
    locationTitle: "Get in touch",
    locationDescription: `Reach out to ${businessName} for questions, bookings, or next steps.`,
  };

  content.settings = {
    ...content.settings,
    siteName: businessName,
    siteTagline: input.industry?.trim() || "Local business",
    siteDescription: description,
    ownerName,
    copyrightText: businessName,
    footerTagline: description,
    bookingUrl,
  };

  content.navigation = {
    ...content.navigation,
    ctaLabel: ctaText,
    ctaHref: ctaLink,
  };

  content.footer = {
    ...content.footer,
    tagline: description,
    copyrightText: businessName,
  };

  return content;
}

async function releaseSlugReservation(slug: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(`self-serve:slug:${slug}`).catch(() => {});
}

async function reserveSlug(slug: string, userId: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;
  const result: unknown = await redis.set(
    `self-serve:slug:${slug}`,
    { userId, reservedAt: new Date().toISOString() },
    { nx: true, ex: 10 * 60 },
  );
  return result === "OK" || result === true;
}

export async function getAvailableSelfServeSlug(baseValue: string): Promise<string> {
  const base = normalizeTenantSlug(baseValue);
  const validationError = validateTenantSlug(base);
  if (validationError) throw new SelfServeProvisioningError(validationError);

  const tenants = await getAllTenants();
  const taken = new Set(tenants.map((tenant) => tenant.id));
  if (!taken.has(base)) return base;

  for (let i = 2; i <= 99; i += 1) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }

  throw new SelfServeProvisioningError(
    "That business name has too many similar subdomains. Choose a custom subdomain.",
  );
}

async function seedStarterContent(
  tenantId: string,
  input: SelfServeTenantInput,
  template: TemplateId,
): Promise<ContentSection[]> {
  const starter = buildSelfServeStarterContent(input);

  for (const section of SELF_SERVE_CONTENT_SECTIONS) {
    await setContent(section, starter[section], tenantId);
  }

  await setPageConfig(getDefaultPageConfig(template), tenantId);
  return SELF_SERVE_CONTENT_SECTIONS;
}

export async function createSelfServeTenant(
  input: SelfServeTenantInput,
  actor: Pick<ActorContext, "userId" | "email" | "type" | "isSuperAdmin">,
): Promise<SelfServeTenantResult> {
  const businessName = input.businessName.trim();
  const ownerName = input.ownerName.trim() || businessName;
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  const slugBase = input.requestedSlug || businessName;
  const slug = await getAvailableSelfServeSlug(slugBase);

  const reserved = await reserveSlug(slug, input.clerkUserId);
  if (!reserved) {
    throw new SelfServeProvisioningError("That subdomain was just reserved. Try another one.", 409);
  }

  const template = input.template || inferSelfServeTemplate(input.industry);
  const siteUrl =
    process.env.NODE_ENV === "production"
      ? `https://${slug}.scaffoldweb.com`
      : `http://${slug}.localhost:3000`;
  const revalidationSecret = generateSecret();

  try {
    const tenant = await createTenant({
      siteName: businessName,
      ownerName,
      ownerEmail,
      industry: input.industry?.trim() || template,
      template,
      subdomain: slug,
      features: ["newsletter", ...(input.bookingUrl ? ["booking" as TenantFeature] : [])],
      siteUrl,
      revalidateUrl: `${siteUrl}/api/v1/revalidate`,
      revalidationSecret,
      bookingUrl: input.bookingUrl?.trim() || undefined,
      ownerPhone: input.ownerPhone?.trim() || undefined,
      referredBy: input.referredBy?.trim() || undefined,
      autoPublish: false,
    });

    const assigned = await assignUserToTenant(input.clerkUserId, tenant.id, "owner");
    if (!assigned) {
      throw new SelfServeProvisioningError("Tenant was created, but owner access could not be assigned.", 500);
    }

    const seededSections = await seedStarterContent(tenant.id, input, template);

    await logAuditEvent({
      tenant: tenant.id,
      action: "self_serve.tenant_created",
      targetType: "tenant",
      targetId: tenant.id,
      actor,
      metadata: {
        businessName,
        ownerEmail,
        template,
        referredBy: input.referredBy,
        currentWebsite: input.currentWebsite,
      },
    }).catch(() => {});

    return {
      tenant,
      dashboardUrl: getTenantDashboardUrl(tenant, "/dashboard?welcome=1"),
      publicUrl: getTenantPublicUrl(tenant),
      seededSections,
    };
  } catch (err) {
    await releaseSlugReservation(slug);
    if (err instanceof SelfServeProvisioningError) throw err;
    throw err;
  }
}
