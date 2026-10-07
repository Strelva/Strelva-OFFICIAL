/**
 * One-click newsletter unsubscribe (RFC 8058).
 *
 * Every newsletter carries `List-Unsubscribe: <https://…/api/newsletter/unsubscribe?token=…>`
 * and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. The token is an
 * HMAC over {tenantId, email}, signed with the approve-link secret chain so no
 * new secret is provisioned. It does not expire: an unsubscribe link in an old
 * email must keep working.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface UnsubscribeClaims {
  tenantId: string;
  email: string;
}

function secret(): string {
  const value = process.env.APPROVE_LINK_SECRET || process.env.OAUTH_STATE_SECRET || process.env.INTERNAL_API_SECRET;
  if (!value) throw new Error("Unsubscribe-link secret not configured");
  return value;
}

function sign(encoded: string): string {
  return createHmac("sha256", secret()).update(`newsletter-unsubscribe:${encoded}`).digest("base64url");
}

export function signUnsubscribeToken(claims: UnsubscribeClaims): string {
  const encoded = Buffer.from(JSON.stringify({ t: claims.tenantId, e: claims.email.trim() })).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyUnsubscribeToken(token: string): UnsubscribeClaims | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const encoded = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(encoded));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as { t?: unknown; e?: unknown };
    if (typeof payload.t !== "string" || !/^[a-z0-9-]{1,120}$/.test(payload.t)) return null;
    if (typeof payload.e !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.e)) return null;
    return { tenantId: payload.t, email: payload.e };
  } catch {
    return null;
  }
}

export function buildUnsubscribeUrl(origin: string, claims: UnsubscribeClaims): string {
  return `${origin.replace(/\/+$/, "")}/api/newsletter/unsubscribe?token=${encodeURIComponent(signUnsubscribeToken(claims))}`;
}
