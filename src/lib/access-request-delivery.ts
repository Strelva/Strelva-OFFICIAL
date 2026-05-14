import { randomBytes } from "crypto";
import { getRedis } from "@/lib/redis";
import { getSanityClient } from "@/lib/sanity";

export const hasLeadSanity = !!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID && !!process.env.SANITY_API_TOKEN;

export type DeliveryStatus =
  | "received"
  | "reviewing"
  | "drafting"
  | "owner_review"
  | "launch_ready"
  | "launched"
  | "paused";

export interface DeliveryLead {
  businessName: string;
  description?: string | null;
  location?: string | null;
  email: string;
  currentWebsite?: string | null;
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
    detail: "Your business, current site, and first workflow are in the queue.",
  },
  {
    id: "reviewing",
    label: "Fit review",
    detail: "We check the business, the customer path, and what the first site should prove.",
  },
  {
    id: "drafting",
    label: "First site draft",
    detail: "The first version gets shaped around calls, bookings, trust, and easy updates.",
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
  const base = process.env.NEXT_PUBLIC_SITE_URL || origin;
  return new URL(`/delivery/${token}`, base).toString();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function cleanSubjectText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildDeliveryStatusEmailHtml(params: {
  businessName: string;
  statusUrl: string;
}): string {
  const businessName = escapeHtml(cleanSubjectText(params.businessName));
  const statusUrl = escapeHtml(params.statusUrl);

  return `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; color: #151515;">
      <p style="font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; color: #5b6f68; margin: 0 0 18px;">Scaffold Web</p>
      <h1 style="font-size: 28px; line-height: 1.15; margin: 0 0 18px;">Your site request is in the queue.</h1>
      <p style="font-size: 16px; line-height: 1.65; color: #444; margin: 0 0 24px;">
        We received the request for <strong>${businessName}</strong>. The first status is request received. Next we review the business, the current site, and the first workflow the site should handle.
      </p>
      <a href="${statusUrl}" style="display: inline-block; border-radius: 999px; background: #111; color: #fff; padding: 13px 20px; text-decoration: none; font-weight: 600; font-size: 15px;">
        Track site delivery
      </a>
      <p style="font-size: 14px; line-height: 1.6; color: #666; margin: 24px 0 0;">
        No login is needed yet. This private tracking link shows where the request stands and what happens next.
      </p>
    </div>
  `;
}

export function buildDeliveryStatusEmailText(params: {
  businessName: string;
  statusUrl: string;
}): string {
  const businessName = cleanSubjectText(params.businessName);
  return [
    "Your site request is in the queue.",
    "",
    `We received the request for ${businessName}.`,
    "The first status is request received. Next we review the business, the current site, and the first workflow the site should handle.",
    "",
    `Track site delivery: ${params.statusUrl}`,
    "",
    "No login is needed yet. This private tracking link shows where the request stands and what happens next.",
  ].join("\n");
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
  return {
    businessName: record.businessName,
    description: typeof record.description === "string" ? record.description : null,
    location: typeof record.location === "string" ? record.location : null,
    email: record.email,
    currentWebsite: typeof record.currentWebsite === "string" ? record.currentWebsite : null,
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

  if (hasLeadSanity) {
    const query: string = `*[_type == "onboardLead" && statusToken == $token][0]{
        businessName,
        description,
        location,
        email,
        currentWebsite,
        referredBy,
        status,
        deliveryStatus,
        statusToken,
        submittedAt,
        statusUpdatedAt
      }`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = await (getSanityClient() as any).fetch(query, { token });
    return coerceLead(doc);
  }

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

export async function getExistingLeadToken(email: string): Promise<string | null> {
  if (hasLeadSanity) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = await (getSanityClient() as any).fetch(
      `*[_type == "onboardLead" && email == $email][0]{statusToken}`,
      { email },
    );
    return typeof doc?.statusToken === "string" ? doc.statusToken : null;
  }

  const lead = await readRedisLeadByEmail(email);
  return lead?.statusToken ?? null;
}

export async function saveDeliveryLead(lead: DeliveryLead): Promise<void> {
  if (hasLeadSanity) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (getSanityClient() as any).fetch(
      `*[_type == "onboardLead" && email == $email][0]._id`,
      { email: lead.email },
    );
    if (existing) {
      await getSanityClient().patch(existing).set(lead).commit();
    } else {
      await getSanityClient().create({
        _type: "onboardLead",
        ...lead,
        status: "new",
      });
    }
  }

  const redis = getRedis();
  if (redis) {
    const payload = JSON.stringify(lead);
    const leadKey = `lead:${lead.email}`;
    await redis.set(leadKey, payload);
    await redis.set(`lead-status:${lead.statusToken}`, payload);
    await redis.zadd("leads:all", { score: Date.now(), member: leadKey });
  }
}
