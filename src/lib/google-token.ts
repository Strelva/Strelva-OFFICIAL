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

import { getConnection } from "./connections";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Read-only Search Console scope requested by /api/oauth/google. */
export const GSC_READ_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
/** Read-only GA4 (Analytics Data API) scope requested by /api/oauth/google. */
export const GA4_READ_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

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
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

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
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token as string;
  } catch {
    return null;
  }
}

/**
 * Return a fresh access token for the tenant's Google connection, minted from
 * its stored refresh token. Returns null when there is no connected google
 * connection, no refresh token on it, or the refresh grant fails.
 */
export async function getGoogleAccessToken(
  tenantId: string
): Promise<string | null> {
  const connection = await getConnection(tenantId, "google");
  if (!connection || connection.status !== "connected") return null;
  if (!connection.refreshToken) return null;
  return refreshAccessToken(connection.refreshToken);
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
  const connection = await getConnection(tenantId, "google");
  const connected = !!connection && connection.status === "connected";
  const scopes = connection?.scopes;
  return {
    connected,
    hasGscScope: connected && (scopes?.includes(GSC_READ_SCOPE) ?? false),
    hasGa4Scope: connected && (scopes?.includes(GA4_READ_SCOPE) ?? false),
  };
}
