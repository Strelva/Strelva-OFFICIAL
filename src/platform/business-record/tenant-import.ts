import { createHash } from "node:crypto";
import {
  contactInputSchema,
  factValueSchemas,
  phoneKey,
  serviceOperationSchema,
  personOperationSchema,
  tenantImportPayloadSchema,
  type ContactInput,
  type ConversionAccount,
  type ConversionBilling,
  type FactKey,
  type LINK_KINDS,
  type TenantImportPayload,
} from "./contracts";

/**
 * Builds the tenant -> business record import from what the managed tenant
 * already knows. Pure: the caller reads the tenant through the existing
 * src/lib readers and passes plain values in, so this never touches Redis,
 * Postgres or the tenant row. Nothing is invented: a field that is missing or
 * fails validation is listed in `skipped` with the reason.
 */

export interface TenantImportSource {
  tenant: {
    id: string;
    stableId?: string;
    siteName: string;
    ownerName?: string;
    ownerEmail?: string;
    ownerPhone?: string;
    siteUrl?: string;
    productionDomain?: string;
    bookingUrl?: string;
    businessHours?: {
      schedule: Array<{ day: number; open: string; close: string; closed: boolean }>;
      holidays?: Array<{ date: string; label: string }>;
      timezone?: string;
    };
    visibility?: { towns?: string[] };
    branding?: { tagline?: string };
  };
  contact?: {
    email?: string;
    phone?: string;
    address?: string;
    instagramUrl?: string;
    facebookUrl?: string;
    googleMapsUrl?: string;
  } | null;
  settings?: { siteDescription?: string; siteTagline?: string } | null;
  footer?: { socialLinks?: Array<{ label: string; href: string }> } | null;
  services?: Array<{ id?: string; name?: string; description?: string; duration?: string; price?: string; comingSoon?: boolean }> | null;
  leads?: Array<{ id: string; name?: string; email?: string; fields?: Record<string, string>; createdAt?: string }>;
  bookings?: Array<{ id: string; clientName?: string; clientEmail?: string; clientPhone?: string; createdAt?: string }>;
  billing?: ConversionBilling | null;
  account?: ConversionAccount | null;
  /** Default timezone when the tenant has hours but no zone (booking config zone). */
  defaultTimezone?: string;
}

export interface SkippedField {
  field: string;
  reason: string;
}

export interface TenantImportPlan {
  payload: TenantImportPayload;
  digest: string;
  commandId: string;
  skipped: SkippedField[];
  counts: {
    facts: number;
    services: number;
    people: number;
    contacts: number;
    leadsRead: number;
    bookingsRead: number;
    contactsSkipped: number;
  };
}

const MAX_CONTACTS = 1000;
type LinkKind = (typeof LINK_KINDS)[number];

function clean(value: string | undefined | null): string | undefined {
  const text = value?.replace(/\s+/g, " ").trim();
  return text ? text : undefined;
}

function url(value: string | undefined): string | undefined {
  const text = clean(value);
  if (!text) return undefined;
  const candidate = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function linkKind(label: string, href: string): LinkKind {
  const text = `${label} ${href}`.toLowerCase();
  if (text.includes("instagram")) return "instagram";
  if (text.includes("facebook")) return "facebook";
  if (text.includes("linkedin")) return "linkedin";
  if (text.includes("yelp")) return "yelp";
  if (text.includes("tiktok")) return "tiktok";
  if (text.includes("youtube")) return "youtube";
  if (/(?:^|\W)(?:x\.com|twitter)/.test(text)) return "x";
  if (text.includes("google.com/maps") || text.includes("maps.app.goo.gl")) return "google_maps";
  return "other";
}

/** Stable JSON so the same plan always produces the same digest. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** A deterministic UUID-shaped id (v4 layout) from a seed. */
export function uuidFromSeed(seed: string): string {
  const hex = sha256(seed);
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function planTenantImport(source: TenantImportSource, options: {
  targetWorkspaceId?: string;
  separateBusiness?: boolean;
  agencyWorkspaceId?: string;
  agencyStaffEmails?: string[];
  agencySelectionBasis?: "existing_contract" | "owner_choice";
} = {}): TenantImportPlan {
  if (options.separateBusiness && options.targetWorkspaceId) throw new Error("A separate business cannot also join an existing business.");
  const { tenant } = source;
  const skipped: SkippedField[] = [];
  const facts: Partial<Record<FactKey, { value: unknown; verified: false }>> = {};
  const setFact = (key: FactKey, value: unknown, field: string) => {
    if (value === undefined) {
      skipped.push({ field, reason: "not set on the tenant" });
      return;
    }
    const parsed = factValueSchemas[key].safeParse(value);
    if (parsed.success) facts[key] = { value: parsed.data, verified: false };
    else skipped.push({ field, reason: `invalid: ${parsed.error.issues[0]?.message ?? "rejected"}` });
  };

  setFact("display_name", clean(tenant.siteName), "tenant.siteName");
  skipped.push({ field: "legal_name", reason: "the tenant does not record a legal name" });
  setFact("phone", clean(source.contact?.phone), "contact.phone");
  setFact("email", clean(source.contact?.email)?.toLowerCase(), "contact.email");
  const address = clean(source.contact?.address);
  setFact("address", address ? { formatted: address.slice(0, 200) } : undefined, "contact.address");
  const description = clean(source.settings?.siteDescription) ?? clean(source.settings?.siteTagline) ?? clean(tenant.branding?.tagline);
  setFact("description", description?.slice(0, 2000), "settings.siteDescription");
  const towns = (tenant.visibility?.towns ?? []).map((town) => clean(town)).filter((town): town is string => Boolean(town));
  setFact("service_area", towns.length ? [...new Set(towns)].slice(0, 100) : undefined, "tenant.visibility.towns");
  const ownerEmail = clean(tenant.ownerEmail)?.toLowerCase();
  const ownerName = clean(tenant.ownerName);
  const ownerIsPerson = Boolean(ownerName) && ownerName!.toLowerCase() !== clean(tenant.siteName)?.toLowerCase();
  setFact("owner_recipient", ownerEmail ? { email: ownerEmail, ...(ownerIsPerson ? { name: ownerName!.slice(0, 160) } : {}) } : undefined, "tenant.ownerEmail");

  const links: Array<{ kind: LinkKind; url: string; label?: string }> = [];
  const addLink = (kind: (typeof links)[number]["kind"], raw: string | undefined, label?: string) => {
    const href = url(raw);
    if (href && !links.some((link) => link.url === href) && links.length < 30) links.push({ kind, url: href, ...(label ? { label: label.slice(0, 80) } : {}) });
  };
  addLink("website", tenant.productionDomain ?? tenant.siteUrl);
  addLink("booking", tenant.bookingUrl);
  addLink("instagram", source.contact?.instagramUrl);
  addLink("facebook", source.contact?.facebookUrl);
  addLink("google_maps", source.contact?.googleMapsUrl);
  for (const social of source.footer?.socialLinks ?? []) {
    const label = clean(social.label);
    addLink(linkKind(label ?? "", social.href), social.href, label);
  }
  setFact("links", links.length ? links : undefined, "links");

  const hours = tenant.businessHours;
  if (hours && Array.isArray(hours.schedule)) {
    const timezone = clean(hours.timezone) ?? clean(source.defaultTimezone);
    setFact("hours", timezone ? {
      timezone,
      weekly: hours.schedule
        .filter((day) => !day.closed)
        .map((day) => ({ day: day.day, opens: day.open, closes: day.close }))
        .sort((a, b) => a.day - b.day || a.opens.localeCompare(b.opens)),
      overrides: (hours.holidays ?? []).map((holiday) => ({ date: holiday.date, closed: true, ...(clean(holiday.label) ? { label: clean(holiday.label)!.slice(0, 120) } : {}) })),
    } : undefined, "tenant.businessHours");
  } else {
    skipped.push({ field: "tenant.businessHours", reason: "not set on the tenant; booking availability stays with bookings (Reborn item 2)" });
  }

  const services = [];
  for (const [index, service] of (source.services ?? []).entries()) {
    const duration = parseInt(service.duration ?? "", 10);
    const candidate = {
      op: "upsert" as const,
      name: clean(service.name)?.slice(0, 160) ?? "",
      description: clean(service.description)?.slice(0, 2000) ?? null,
      durationMinutes: Number.isInteger(duration) && duration >= 1 && duration <= 1440 ? duration : null,
      priceText: clean(service.price)?.slice(0, 80) ?? null,
      active: service.comingSoon !== true,
      position: index,
      externalRef: clean(service.id)?.slice(0, 200) ?? null,
    };
    const parsed = serviceOperationSchema.safeParse(candidate);
    if (parsed.success) services.push(parsed.data);
    else skipped.push({ field: `services[${index}]`, reason: "no usable name" });
  }

  const people = [];
  if (ownerName && ownerIsPerson) {
    const phone = clean(tenant.ownerPhone);
    const parsed = personOperationSchema.safeParse({
      op: "upsert",
      name: ownerName.slice(0, 160),
      roleTitle: "Owner",
      email: ownerEmail ?? null,
      phone: phone && phoneKey(phone) ? phone : null,
    });
    if (parsed.success) people.push(parsed.data);
    else skipped.push({ field: "tenant.ownerName", reason: "owner details failed validation" });
  } else {
    skipped.push({ field: "tenant.ownerName", reason: ownerName ? "same as the business name, not a person" : "not set on the tenant" });
  }

  const contacts: ContactInput[] = [];
  let contactsSkipped = 0;
  const addContact = (raw: { name?: string; email?: string; phone?: string; source: "inquiry" | "booking"; seenAt?: string }) => {
    const email = clean(raw.email)?.toLowerCase();
    const phone = clean(raw.phone);
    const seen = raw.seenAt && !Number.isNaN(Date.parse(raw.seenAt)) ? new Date(raw.seenAt).toISOString() : null;
    const parsed = contactInputSchema.safeParse({
      name: clean(raw.name)?.slice(0, 160) ?? null,
      email: email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null,
      phone: phone && phoneKey(phone) ? phone : null,
      source: raw.source,
      seenAt: seen,
    });
    if (parsed.success && contacts.length < MAX_CONTACTS) contacts.push(parsed.data);
    else contactsSkipped += 1;
  };
  for (const lead of source.leads ?? []) {
    const phone = lead.fields?.phone ?? lead.fields?.Phone ?? lead.fields?.telephone;
    addContact({ name: lead.name, email: lead.email ?? lead.fields?.email, phone, source: "inquiry", seenAt: lead.createdAt });
  }
  for (const booking of source.bookings ?? []) {
    addContact({ name: booking.clientName, email: booking.clientEmail, phone: booking.clientPhone, source: "booking", seenAt: booking.createdAt });
  }
  // Oldest first, so merged contacts keep their earliest first-seen time and
  // the plan is stable regardless of reader order.
  contacts.sort((a, b) => (a.seenAt ?? "").localeCompare(b.seenAt ?? "") || (a.email ?? "").localeCompare(b.email ?? "") || (a.phone ?? "").localeCompare(b.phone ?? ""));
  if (contactsSkipped) skipped.push({ field: "contacts", reason: `${contactsSkipped} lead or booking record(s) had no valid email or phone, or exceeded ${MAX_CONTACTS}` });

  if (!tenant.stableId) skipped.push({ field: "tenant.stableId", reason: "missing: this tenant was not read from Postgres, so it cannot be applied" });

  const payload = tenantImportPayloadSchema.parse({
    tenantId: tenant.id,
    tenantStableId: tenant.stableId ?? "00000000-0000-4000-8000-000000000000",
    // A multi-site account's business is named for the account, unless this
    // site becomes its own business: then it keeps the site's name.
    workspaceName: (clean(source.account?.multiSite && !options.separateBusiness ? source.account.name : undefined) ?? clean(tenant.siteName) ?? tenant.id).slice(0, 120),
    ...(options.targetWorkspaceId ? { targetWorkspaceId: options.targetWorkspaceId } : {}),
    ...(options.separateBusiness ? { separateBusiness: true as const } : {}),
    ...(options.agencyWorkspaceId ? { agencyWorkspaceId: options.agencyWorkspaceId } : {}),
    ...(options.agencyStaffEmails ? { agencyStaffEmails: options.agencyStaffEmails } : {}),
    ...(options.agencySelectionBasis ? { agencySelectionBasis: options.agencySelectionBasis } : {}),
    billing: source.billing ?? null,
    account: source.account ?? null,
    patch: {
      ...(Object.keys(facts).length ? { facts } : {}),
      ...(services.length ? { services } : {}),
      ...(people.length ? { people } : {}),
    },
    contacts,
  });
  const digest = sha256(canonicalJson(payload));
  return {
    payload,
    digest,
    commandId: uuidFromSeed(`strelva-tenant-conversion:v1:${payload.tenantStableId}:${digest}`),
    skipped,
    counts: {
      facts: Object.keys(facts).length,
      services: services.length,
      people: people.length,
      contacts: contacts.length,
      leadsRead: source.leads?.length ?? 0,
      bookingsRead: source.bookings?.length ?? 0,
      contactsSkipped,
    },
  };
}

export interface TenantUnlinkCommand {
  tenantId: string;
  workspaceId: string;
  digest: string;
  commandId: string;
}

/** The unlink command for one specific link. Rerunning against the same link
 * yields the same command, so a retried rollback replays instead of acting
 * twice; a later link (after a reconversion) gets a new one. */
export function planTenantUnlink(link: { tenantId: string; tenantStableId: string; workspaceId: string; linkedAt: string }): TenantUnlinkCommand {
  const body = { kind: "tenant_unlink", version: 1, ...link };
  const digest = sha256(canonicalJson(body));
  return {
    tenantId: link.tenantId,
    workspaceId: link.workspaceId,
    digest,
    commandId: uuidFromSeed(`strelva-tenant-unlink:v1:${link.tenantStableId}:${digest}`),
  };
}
