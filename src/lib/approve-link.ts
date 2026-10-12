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
export const APPROVE_LINK_TTL_MS = 14 * 24 * 60 * 60 * 1000;

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
  const payload = verifyLegacyApprovePayload(token, now);
  return payload ? { eventId: payload.eventId, tenantId: payload.tenantId, action: payload.action } : null;
}

/** Retain signed expiry for conversion cutoff checks; never decode unverified claims. */
export function verifyLegacyApprovePayload(token: string, now = Date.now()): ApproveLinkPayload | null {
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
    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp) || payload.exp < now || payload.exp > now + APPROVE_LINK_TTL_MS) return null;
    return { eventId: payload.eventId, tenantId: payload.tenantId, action: payload.action, exp: payload.exp };
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

// ─── Workspace one-tap links (Needs you) ──────────────────────────────────────
//
// The workspace form binds the business (workspaceId), the Needs you item, the
// action, the recipient it was emailed to and the item's revision hash, so a
// link can't act on another business, another item, a newer revision, or for
// someone who is no longer the owner. Its MAC is domain-separated from the
// tenant form ("ws2." prefix), so neither form verifies as the other. The
// tenant form above keeps working unchanged for today's review alerts.

export interface WorkspaceApproveLinkClaims {
  workspaceId: string;
  itemId: string;
  action: ApproveLinkAction;
  /** Lowercased email the link was sent to. */
  recipient: string;
  /** owner_decisions.revision_hash at send time. */
  revision: string;
}

interface WorkspaceApproveLinkPayload extends WorkspaceApproveLinkClaims {
  v: 2;
  exp: number;
}

const WORKSPACE_LINK_DOMAIN = "ws2.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function signWorkspace(value: string): string {
  return sign(`${WORKSPACE_LINK_DOMAIN}${value}`);
}

/** Sign a workspace link. Expiry matches the item's 14-day lapse. */
export function signWorkspaceApproveToken(claims: WorkspaceApproveLinkClaims, now = Date.now()): string {
  const payload: WorkspaceApproveLinkPayload = {
    v: 2,
    workspaceId: claims.workspaceId,
    itemId: claims.itemId,
    action: claims.action,
    recipient: claims.recipient.trim().toLowerCase(),
    revision: claims.revision,
    exp: now + APPROVE_LINK_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signWorkspace(encoded)}`;
}

export function verifyWorkspaceApproveToken(token: string, now = Date.now()): WorkspaceApproveLinkClaims | null {
  const dotIdx = token.indexOf(".");
  if (dotIdx === -1) return null;
  const encoded = token.slice(0, dotIdx);
  const signature = token.slice(dotIdx + 1);
  if (!encoded || !signature) return null;
  const expected = Buffer.from(signWorkspace(encoded));
  const provided = Buffer.from(signature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(encoded, "base64url").toString()) as Partial<WorkspaceApproveLinkPayload>;
    if (p.v !== 2) return null;
    if (typeof p.workspaceId !== "string" || !UUID.test(p.workspaceId)) return null;
    if (typeof p.itemId !== "string" || !UUID.test(p.itemId)) return null;
    if (p.action !== "approve" && p.action !== "not-yet") return null;
    if (typeof p.recipient !== "string" || !p.recipient.includes("@")) return null;
    if (typeof p.revision !== "string" || !/^[0-9a-f]{64}$/.test(p.revision)) return null;
    if (typeof p.exp !== "number" || p.exp < now) return null;
    return { workspaceId: p.workspaceId, itemId: p.itemId, action: p.action, recipient: p.recipient, revision: p.revision };
  } catch {
    return null;
  }
}

/** Which kind of approve link a token is, or null when it is neither. */
export function verifyAnyApproveToken(token: string, now = Date.now()):
  | { kind: "tenant"; claims: ApproveLinkClaims }
  | { kind: "review"; claims: ReviewApproveLinkClaims }
  | { kind: "workspace"; claims: WorkspaceApproveLinkClaims }
  | null {
  const workspace = verifyWorkspaceApproveToken(token, now);
  if (workspace) return { kind: "workspace", claims: workspace };
  const review = verifyReviewApproveToken(token, now);
  if (review) return { kind: "review", claims: review };
  const tenant = verifyApproveToken(token, now);
  return tenant ? { kind: "tenant", claims: tenant } : null;
}

/** Review-only links preserve the tenant/event resolver and bind current authority. */
export interface ReviewApproveLinkClaims extends ApproveLinkClaims {
  workspaceId: string;
  recipient: string;
  authorityVersion: string;
}
const REVIEW_LINK_DOMAIN = "review3.";
export function signReviewApproveToken(claims: ReviewApproveLinkClaims, now = Date.now()): string {
  const payload = { ...claims, recipient: claims.recipient.trim().toLowerCase(), v: 3, exp: now + APPROVE_LINK_TTL_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(REVIEW_LINK_DOMAIN + encoded)}`;
}
export function verifyReviewApproveToken(token: string, now = Date.now()): ReviewApproveLinkClaims | null {
  const payload = verifyReviewApprovePayload(token, now);
  if (!payload) return null;
  return { tenantId: payload.tenantId, eventId: payload.eventId, action: payload.action, workspaceId: payload.workspaceId,
    recipient: payload.recipient, authorityVersion: payload.authorityVersion };
}
export function verifyReviewApprovePayload(token: string, now = Date.now()): (ReviewApproveLinkClaims & { exp: number }) | null {
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const encoded = token.slice(0, dot), provided = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(REVIEW_LINK_DOMAIN + encoded));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(encoded, "base64url").toString());
    if (p.v !== 3 || typeof p.tenantId !== "string" || !p.tenantId.trim() || typeof p.eventId !== "string" || !p.eventId.trim()
      || typeof p.workspaceId !== "string" || !UUID.test(p.workspaceId) || typeof p.recipient !== "string"
      || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.recipient) || p.recipient !== p.recipient.trim().toLowerCase()
      || typeof p.authorityVersion !== "string" || !/^[0-9a-f]{64}$/.test(p.authorityVersion)
      || !["approve", "not-yet"].includes(p.action) || !Number.isFinite(p.exp) || p.exp < now || p.exp > now + APPROVE_LINK_TTL_MS) return null;
    return { tenantId: p.tenantId, eventId: p.eventId, action: p.action, workspaceId: p.workspaceId, recipient: p.recipient, authorityVersion: p.authorityVersion, exp: p.exp };
  } catch { return null; }
}
export function buildReviewApproveUrl(origin: string, claims: ReviewApproveLinkClaims): string {
  return `${origin.replace(/\/+$/, "")}/api/approve?token=${encodeURIComponent(signReviewApproveToken(claims))}`;
}

export function buildWorkspaceApproveUrl(baseOrigin: string, claims: WorkspaceApproveLinkClaims): string {
  const origin = baseOrigin.replace(/\/+$/, "");
  return `${origin}/api/approve?token=${encodeURIComponent(signWorkspaceApproveToken(claims))}`;
}
