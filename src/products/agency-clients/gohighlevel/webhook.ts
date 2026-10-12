import { createHash, createPublicKey, verify, type KeyObject } from "node:crypto";
import { z } from "zod";

/**
 * HighLevel webhook signatures, per the Webhook Integration Guide
 * (https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide,
 * read 2026-10-12):
 * - `X-GHL-Signature`: Ed25519 over the request body, base64. Current.
 * - `X-WH-Signature`: RSA-SHA256 over the request body, base64. Legacy; the
 *   guide says it is deprecated from 2026-09-01, after which only
 *   X-GHL-Signature is sent. Kept as a fallback only because the guide's own
 *   recommended flow still lists it.
 * We verify the raw body bytes as received. The guide's sample re-serializes
 * the parsed JSON; whether HighLevel signs exactly the bytes it sends is
 * UNVERIFIED until a sandbox delivery is captured.
 *
 * Public keys are HighLevel's published keys, copied from that guide. HighLevel
 * announces rotation by email and in its developer Slack; a rotation means
 * updating these constants.
 */
export const GHL_WEBHOOK_ED25519_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=
-----END PUBLIC KEY-----`;

export const GHL_WEBHOOK_RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAokvo/r9tVgcfZ5DysOSC
Frm602qYV0MaAiNnX9O8KxMbiyRKWeL9JpCpVpt4XHIcBOK4u3cLSqJGOLaPuXw6
dO0t6Q/ZVdAV5Phz+ZtzPL16iCGeK9po6D6JHBpbi989mmzMryUnQJezlYJ3DVfB
csedpinheNnyYeFXolrJvcsjDtfAeRx5ByHQmTnSdFUzuAnC9/GepgLT9SM4nCpv
uxmZMxrJt5Rw+VUaQ9B8JSvbMPpez4peKaJPZHBbU3OdeCVx5klVXXZQGNHOs8gF
3kvoV5rTnXV0IknLBXlcKKAQLZcY/Q9rG6Ifi9c+5vqlvHPCUJFT5XUGG5RKgOKU
J062fRtN+rLYZUV+BjafxQauvC8wSWeYja63VSUruvmNj8xkx2zE/Juc+yjLjTXp
IocmaiFeAO6fUtNjDeFVkhf5LNb59vECyrHD2SQIrhgXpO4Q3dVNA5rw576PwTzN
h/AMfHKIjE4xQA1SZuYJmNnmVZLIZBlQAF9Ntd03rfadZ+yDiOXCCs9FkHibELhC
HULgCsnuDJHcrGNd5/Ddm5hxGQ0ASitgHeMZ0kcIOwKDOzOU53lDza6/Y09T7sYJ
PQe7z0cvj7aE4B+Ax1ZoZGPzpJlZtGXCsu9aTEGEnKzmsFqwcSsnw3JB31IGKAyk
T1hhTiaCeIY/OwwwNUY2yvcCAwEAAQ==
-----END PUBLIC KEY-----`;

export interface GhlWebhookKeys {
  ed25519: KeyObject | string;
  rsa: KeyObject | string;
}

let publishedKeys: { ed25519: KeyObject; rsa: KeyObject } | null = null;
function defaultKeys(): GhlWebhookKeys {
  publishedKeys ??= { ed25519: createPublicKey(GHL_WEBHOOK_ED25519_PUBLIC_KEY), rsa: createPublicKey(GHL_WEBHOOK_RSA_PUBLIC_KEY) };
  return publishedKeys;
}

export type GhlSignatureResult = { ok: true; scheme: "ed25519" | "rsa" } | { ok: false; reason: "missing" | "invalid" };

function decodeSignature(value: string): Buffer | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "N/A" || !/^[A-Za-z0-9+/=_-]+$/.test(trimmed)) return null;
  const decoded = Buffer.from(trimmed, "base64");
  return decoded.length ? decoded : null;
}

/** Verify a delivery. When X-GHL-Signature is present it alone decides; the legacy header is only consulted without it. */
export function verifyGhlWebhookSignature(rawBody: string | Buffer, headers: Headers, keys: GhlWebhookKeys = defaultKeys()): GhlSignatureResult {
  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  const current = headers.get("x-ghl-signature");
  if (current !== null) {
    const signature = decodeSignature(current);
    if (!signature) return { ok: false, reason: "invalid" };
    try {
      return verify(null, body, keys.ed25519, signature) ? { ok: true, scheme: "ed25519" } : { ok: false, reason: "invalid" };
    } catch {
      return { ok: false, reason: "invalid" };
    }
  }
  const legacy = headers.get("x-wh-signature");
  if (legacy === null) return { ok: false, reason: "missing" };
  const signature = decodeSignature(legacy);
  if (!signature) return { ok: false, reason: "invalid" };
  try {
    return verify("sha256", body, keys.rsa, signature) ? { ok: true, scheme: "rsa" } : { ok: false, reason: "invalid" };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

/**
 * The deliveries we act on. AppInstall / AppUninstall shapes are from
 * docs/webhook events/AppInstall.md and AppUninstall.md; LocationCreate (agency
 * apps only) from LocationCreate.md, all in
 * https://github.com/GoHighLevel/highlevel-api-docs. Anything else is
 * acknowledged and ignored.
 */
const payloadSchema = z.object({
  type: z.string().optional(),
  webhookId: z.string().optional(),
  timestamp: z.string().optional(),
  appId: z.string().optional(),
  companyId: z.string().optional(),
  locationId: z.string().optional(),
  /** LocationCreate carries the new location's id as `id`. */
  id: z.string().optional(),
  name: z.string().optional(),
}).passthrough();

export type GhlWebhookEvent =
  /** A sub-account the agency's install now covers (bulk install, future location or SaaS install). */
  | { kind: "location_installed"; companyId: string | null; locationId: string }
  /** The agency installed the app at agency level. */
  | { kind: "agency_installed"; companyId: string }
  /** A new sub-account was created under the agency. */
  | { kind: "location_created"; companyId: string; locationId: string }
  /** The app was removed from one sub-account. */
  | { kind: "location_uninstalled"; companyId: string | null; locationId: string }
  /** The app was removed from the whole agency: its connection no longer works. */
  | { kind: "agency_uninstalled"; companyId: string }
  | { kind: "ignored"; type: string | null };

export interface ParsedGhlWebhook {
  /** Stable per delivery: HighLevel's webhookId, else a hash of the body, so a retry is recognised. */
  deliveryId: string;
  appId: string | null;
  event: GhlWebhookEvent;
}

export function parseGhlWebhook(rawBody: string): ParsedGhlWebhook | null {
  let json: unknown;
  try { json = JSON.parse(rawBody); } catch { return null; }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) return null;
  const payload = parsed.data;
  const deliveryId = payload.webhookId?.trim() || `sha256:${createHash("sha256").update(rawBody).digest("hex")}`;
  const type = payload.type ?? null;
  const companyId = payload.companyId?.trim() || null;
  const locationId = payload.locationId?.trim() || null;
  let event: GhlWebhookEvent;
  if (type === "INSTALL") {
    event = locationId ? { kind: "location_installed", companyId, locationId }
      : companyId ? { kind: "agency_installed", companyId } : { kind: "ignored", type };
  } else if (type === "UNINSTALL") {
    event = locationId ? { kind: "location_uninstalled", companyId, locationId }
      : companyId ? { kind: "agency_uninstalled", companyId } : { kind: "ignored", type };
  } else if (type === "LocationCreate" && companyId && payload.id) {
    event = { kind: "location_created", companyId, locationId: payload.id };
  } else {
    event = { kind: "ignored", type };
  }
  return { deliveryId: deliveryId.slice(0, 200), appId: payload.appId ?? null, event };
}
