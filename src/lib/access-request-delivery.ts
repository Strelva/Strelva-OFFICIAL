import { randomBytes } from "crypto";
import { renderEmailHtml, renderEmailText } from "@/lib/email/layout";
import { getRedis } from "@/lib/redis";
import { upsertLead } from "@/lib/db/repositories";
import { dualWritePgEnabled } from "@/lib/db/dual-write";

export type DeliveryStatus =
  | "received"
  | "reviewing"
  | "drafting"
  | "owner_review"
  | "launch_ready"
  | "launched"
  | "paused";

export type DeliveryPlan = "one-time" | "monthly";

export interface DeliveryLead {
  businessName: string;
  description?: string | null;
  location?: string | null;
  email: string;
  phone?: string | null;
  currentWebsite?: string | null;
  plan?: DeliveryPlan | null;
  referredBy?: string | null;
  statusToken: string;
  deliveryStatus: DeliveryStatus;
  submittedAt: string;
  statusUpdatedAt: string;
}

export const deliverySteps: Array<{
  id: Exclude<DeliveryStatus, "paused">;
  label: string;
  detail: string;
}> = [
  {
    id: "received",
    label: "Request received",
    detail: "Your business, current site, and build request are in the queue. We will follow up after review.",
  },
  {
    id: "reviewing",
    label: "Fit review",
    detail: "We check the business, the customer path, and what the site should prove.",
  },
  {
    id: "drafting",
    label: "Site draft",
    detail: "Your site gets built around calls, bookings, trust, and easy updates.",
  },
  {
    id: "owner_review",
    label: "Owner review",
    detail: "You get the draft before anything publishes.",
  },
  {
    id: "launch_ready",
    label: "Ready to launch",
    detail: "Domains, handoff, and the first proof loop are prepared.",
  },
  {
    id: "launched",
    label: "Live",
    detail: "Your site and weekly proof loop are running.",
  },
];

export function createDeliveryStatusToken(): string {
  return randomBytes(18).toString("hex");
}

export function normalizeDeliveryStatus(value: unknown): DeliveryStatus {
  if (
    value === "received" ||
    value === "reviewing" ||
    value === "drafting" ||
    value === "owner_review" ||
    value === "launch_ready" ||
    value === "launched" ||
    value === "paused"
  ) {
    return value;
  }
  if (value === "contacted" || value === "qualified") return "reviewing";
  if (value === "converted") return "launched";
  if (value === "lost") return "paused";
  return "received";
}

export function getDeliveryStepIndex(status: DeliveryStatus): number {
  if (status === "paused") return 0;
  const index = deliverySteps.findIndex((step) => step.id === status);
  return index >= 0 ? index : 0;
}

export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${"*".repeat(Math.max(2, name.length - visible.length))}@${domain}`;
}

export function buildDeliveryStatusUrl(origin: string, token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || origin;
  return new URL(`/delivery/${token}`, base).toString();
}

function cleanSubjectText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deliveryStatusEmailOptions(params: {
  businessName: string;
  statusUrl: string;
}) {
  // Sanitize the dynamic name (strip markup + newlines); the shared layout
  // auto-escapes everything we pass, so we don't pre-escape here.
  const businessName = cleanSubjectText(params.businessName);
  return {
    preheader: "Your site request is in the queue.",
    heading: "We've got your request",
    paragraphs: [
      `We received the request for ${businessName}. The first status is request received. Next we review the business, the current site, and what the site should help customers do. We will follow up after review.`,
      "No login is needed yet. This private tracking link shows where the request stands and what happens next.",
    ],
    button: { label: "Track your request", url: params.statusUrl },
  };
}

export function buildDeliveryStatusEmailHtml(params: {
  businessName: string;
  statusUrl: string;
}): string {
  return renderEmailHtml(deliveryStatusEmailOptions(params));
}

export function buildDeliveryStatusEmailText(params: {
  businessName: string;
  statusUrl: string;
}): string {
  return renderEmailText(deliveryStatusEmailOptions(params));
}

function validToken(token: string): boolean {
  return /^[a-f0-9]{36}$/.test(token);
}

function coerceLead(value: unknown): DeliveryLead | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.businessName !== "string" || typeof record.email !== "string") return null;
  if (typeof record.statusToken !== "string") return null;

  const now = new Date().toISOString();
  const planValue = record.plan === "one-time" || record.plan === "monthly" ? record.plan : null;
  return {
    businessName: record.businessName,
    description: typeof record.description === "string" ? record.description : null,
    location: typeof record.location === "string" ? record.location : null,
    email: record.email,
    phone: typeof record.phone === "string" ? record.phone : null,
    currentWebsite: typeof record.currentWebsite === "string" ? record.currentWebsite : null,
    plan: planValue,
    referredBy: typeof record.referredBy === "string" ? record.referredBy : null,
    statusToken: record.statusToken,
    deliveryStatus: normalizeDeliveryStatus(record.deliveryStatus ?? record.status),
    submittedAt: typeof record.submittedAt === "string" ? record.submittedAt : now,
    statusUpdatedAt: typeof record.statusUpdatedAt === "string" ? record.statusUpdatedAt : now,
  };
}

async function readRedisLeadByEmail(email: string): Promise<DeliveryLead | null> {
  const redis = getRedis();
  if (!redis) return null;
  const raw = await redis.get<unknown>(`lead:${email}`);
  if (typeof raw === "string") {
    try {
      return coerceLead(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  return coerceLead(raw);
}

export async function getDeliveryLeadByToken(token: string): Promise<DeliveryLead | null> {
  if (!validToken(token)) return null;

  const redis = getRedis();
  if (!redis) return null;
  const raw = await redis.get<unknown>(`lead-status:${token}`);
  if (typeof raw === "string") {
    try {
      return coerceLead(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  return coerceLead(raw);
}

/** Advance the canonical lead lifecycle stored on the delivery lead. Operator
 * workflow labels are projections of this state (see lead-workflow.ts). */
export async function updateDeliveryLeadStatus(
  token: string,
  deliveryStatus: DeliveryStatus,
): Promise<DeliveryLead | null> {
  const lead = await getDeliveryLeadByToken(token);
  if (!lead) return null;
  const next: DeliveryLead = {
    ...lead,
    deliveryStatus: normalizeDeliveryStatus(deliveryStatus),
    statusUpdatedAt: new Date().toISOString(),
  };
  await saveDeliveryLead(next);
  return next;
}

/**
 * Read the most recent delivery leads, newest-first, from the `leads:all` Redis
 * zset. Each member is a `lead:{email}` key hydrated to the full DeliveryLead.
 * Degrades to [] when Redis is absent — the admin leads board renders an honest
 * empty state rather than erroring.
 */
export async function getDeliveryLeads(limit = 100): Promise<DeliveryLead[]> {
  const redis = getRedis();
  if (!redis) return [];

  const memberKeys = await redis.zrange<string[]>("leads:all", 0, limit - 1, { rev: true });
  if (!memberKeys.length) return [];

  const leads: DeliveryLead[] = [];
  for (const leadKey of memberKeys) {
    const raw = await redis.get<unknown>(leadKey);
    const lead =
      typeof raw === "string"
        ? (() => {
            try {
              return coerceLead(JSON.parse(raw));
            } catch {
              return null;
            }
          })()
        : coerceLead(raw);
    if (lead) leads.push(lead);
  }
  return leads;
}

export async function getExistingLeadToken(email: string): Promise<string | null> {
  const lead = await readRedisLeadByEmail(email);
  return lead?.statusToken ?? null;
}

export async function saveDeliveryLead(lead: DeliveryLead): Promise<boolean> {
  let persisted = false;

  const redis = getRedis();
  if (redis) {
    const payload = JSON.stringify(lead);
    const leadKey = `lead:${lead.email}`;
    await redis.set(leadKey, payload);
    await redis.set(`lead-status:${lead.statusToken}`, payload);
    await redis.zadd("leads:all", { score: Date.now(), member: leadKey });
    persisted = true;
  }

  // Postgres mirror. Redis remains authoritative for this pre-tenant lifecycle
  // until delivery-lead reads are deliberately cut over (see persistence map).
  if (dualWritePgEnabled()) {
    await upsertLead({
      email: lead.email,
      business_name: lead.businessName,
      description: lead.description ?? null,
      location: lead.location ?? null,
      phone: lead.phone ?? null,
      current_website: lead.currentWebsite ?? null,
      plan: lead.plan ?? null,
      referred_by: lead.referredBy ?? null,
      status_token: lead.statusToken,
      delivery_status: lead.deliveryStatus,
      submitted_at: lead.submittedAt,
      status_updated_at: lead.statusUpdatedAt,
    });
  }

  return persisted;
}
