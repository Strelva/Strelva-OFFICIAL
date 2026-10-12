/**
 * Shared Google OAuth token + scope helpers.
 *
 * A tenant connects Google once (the "Connect Google" button →
 * /api/oauth/google) and grants Business Profile, Search Console, and Analytics
 * in one consent. This module mints fresh access tokens from that connection's
 * refresh_token grant and reports which read scopes the tenant actually granted,
 * so callers can tell "connected but didn't grant analytics" apart from
 * "not connected at all". Never throws — every failure degrades to null/false.
 */

import { getGoogleGrant, getValidGoogleAccessToken } from "./google-access";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Read-only Search Console scope requested by /api/oauth/google. */
export const GSC_READ_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
/** Read-only GA4 (Analytics Data API) scope requested by /api/oauth/google. */
export const GA4_READ_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export interface RefreshedGoogleTokens {
  accessToken: string;
  /** Seconds until the access token expires, when Google said. */
  expiresIn: number | null;
  /** Google does not usually rotate here; when it does, the caller stores it. */
  refreshToken: string | null;
}

export type GoogleRefreshOutcome =
  | { ok: true; tokens: RefreshedGoogleTokens }
  | { ok: false; reason: "unconfigured" | "invalid_grant" | "rejected" | "network" };

/**
 * Mint a fresh access token from a refresh token via the refresh_token grant,
 * keeping a rotated refresh token if Google returns one, and telling a dead
 * grant (`invalid_grant`: revoked, expired, or minted for a Testing-status
 * app more than 7 days ago) apart from a transient failure.
 */
export async function refreshGoogleTokens(refreshToken: string): Promise<GoogleRefreshOutcome> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { ok: false, reason: "unconfigured" };

  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) {
      const body = typeof res.text === "function" ? await res.text().catch(() => "") : "";
      return { ok: false, reason: body.includes("invalid_grant") ? "invalid_grant" : "rejected" };
    }
    const data = await res.json() as { access_token?: unknown; expires_in?: unknown; refresh_token?: unknown };
    if (typeof data.access_token !== "string" || !data.access_token) return { ok: false, reason: "rejected" };
    return {
      ok: true,
      tokens: {
        accessToken: data.access_token,
        expiresIn: typeof data.expires_in === "number" ? data.expires_in : null,
        refreshToken: typeof data.refresh_token === "string" && data.refresh_token ? data.refresh_token : null,
      },
    };
  } catch {
    return { ok: false, reason: "network" };
  }
}

/**
 * Mint a fresh access token from a refresh token via the refresh_token grant.
 * Returns null when OAuth is unconfigured or Google rejects the exchange.
 *
 * Extracted from gbp-management.ts so the write-side (GBP) and the read-side
 * (GSC/GA4) share one refresh implementation.
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<string | null> {
  const outcome = await refreshGoogleTokens(refreshToken);
  return outcome.ok ? outcome.tokens.accessToken : null;
}

/**
 * Return a fresh access token for the tenant's Google grant. Reads the
 * business binding first and falls back to Redis (src/lib/google-access.ts).
 * Returns null when there is no connected grant, no refresh token on it, or
 * the refresh grant fails.
 */
export async function getGoogleAccessToken(
  tenantId: string
): Promise<string | null> {
  const grant = await getGoogleGrant(tenantId);
  if (!grant || grant.status !== "connected") return null;
  return getValidGoogleAccessToken(grant);
}

export interface GoogleScopeGrants {
  /** A connected google connection exists for the tenant. */
  connected: boolean;
  /** The connection's granted scopes include the GSC read scope. */
  hasGscScope: boolean;
  /** The connection's granted scopes include the GA4 read scope. */
  hasGa4Scope: boolean;
}

/**
 * Report which read scopes the tenant's Google connection actually granted.
 *
 * Connections created before the GSC/GA4 scopes were added won't list them (or
 * carry no scopes field at all) — both cases report false, so callers fall back
 * to the service account rather than attempting an OAuth call that would be
 * rejected. The tenant reconnecting Google re-grants with the new scopes.
 */
export async function getGoogleScopeGrants(
  tenantId: string
): Promise<GoogleScopeGrants> {
  const grant = await getGoogleGrant(tenantId);
  const connected = !!grant && grant.status === "connected";
  const scopes = grant?.scopes ?? undefined;
  return {
    connected,
    hasGscScope: connected && (scopes?.includes(GSC_READ_SCOPE) ?? false),
    hasGa4Scope: connected && (scopes?.includes(GA4_READ_SCOPE) ?? false),
  };
}
