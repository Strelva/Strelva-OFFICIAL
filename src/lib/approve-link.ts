/**
 * One-click approve-from-email tokens.
 *
 * An approval-needed email carries "Approve" and "Not yet" links the owner can
 * click without signing in. Each link is an HMAC-signed token binding the exact
 * {eventId, tenantId, action} it authorizes, plus an expiry — so a link can't be
 * tampered to approve a different event, act on another tenant, or work forever.
 *
 * Signing mirrors `oauth-state.ts`: base64url(JSON payload) + "." +
 * HMAC-SHA256(payload) as base64url, verified with a timing-safe compare. The
 * secret reuses the same source as the OAuth-state signer
 * (APPROVE_LINK_SECRET → OAUTH_STATE_SECRET → INTERNAL_API_SECRET) so no new
 * secret has to be provisioned; whichever value signed a token must remain
 * available to verify it.
 *
 * The route that consumes these tokens (`/api/approve`) maps the action to the
 * governance spine's resolver (approve → "approved", not-yet → "dismissed") and
 * is idempotent, so a double-clicked or replayed (but unexpired) link resolves
 * to a friendly "already handled" page rather than acting twice.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type ApproveLinkAction = "approve" | "not-yet";

export interface ApproveLinkClaims {
  eventId: string;
  tenantId: string;
  action: ApproveLinkAction;
}

interface ApproveLinkPayload extends ApproveLinkClaims {
  /** Absolute expiry (epoch ms). */
  exp: number;
}

/** Approval links live longer than an OAuth handshake — an owner may not open
 *  the email for days — but not forever. */
const APPROVE_LINK_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function getApproveLinkSecret(): string {
  const secret =
    process.env.APPROVE_LINK_SECRET ||
    process.env.OAUTH_STATE_SECRET ||
    process.env.INTERNAL_API_SECRET;
  if (!secret) throw new Error("Approve-link secret not configured");
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getApproveLinkSecret()).update(value).digest("base64url");
}

/** Sign an approve/not-yet token for a specific pending event. */
export function signApproveToken(claims: ApproveLinkClaims, now = Date.now()): string {
  const payload: ApproveLinkPayload = { ...claims, exp: now + APPROVE_LINK_TTL_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

/** Verify a token, returning its claims or null when tampered/expired/malformed. */
export function verifyApproveToken(token: string, now = Date.now()): ApproveLinkClaims | null {
  // Split on the first '.' only, so a base64url payload that somehow contains
  // a '.' (e.g. from a future encoding change) doesn't silently truncate the
  // signature portion.
  const dotIdx = token.indexOf(".");
  if (dotIdx === -1) return null;
  const encoded = token.slice(0, dotIdx);
  const signature = token.slice(dotIdx + 1);
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const providedBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString(),
    ) as Partial<ApproveLinkPayload>;
    if (typeof payload.eventId !== "string" || !payload.eventId.trim()) return null;
    if (typeof payload.tenantId !== "string" || !payload.tenantId.trim()) return null;
    if (payload.action !== "approve" && payload.action !== "not-yet") return null;
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    return { eventId: payload.eventId, tenantId: payload.tenantId, action: payload.action };
  } catch {
    return null;
  }
}

/**
 * Build the absolute one-click approve/not-yet URL for an email. `baseOrigin` is
 * a fully-qualified origin serving the control plane (e.g. the tenant dashboard
 * host) — the `/api/approve` route lives there.
 */
export function buildApproveUrl(baseOrigin: string, claims: ApproveLinkClaims): string {
  const token = signApproveToken(claims);
  const origin = baseOrigin.replace(/\/+$/, "");
  return `${origin}/api/approve?token=${encodeURIComponent(token)}`;
}
