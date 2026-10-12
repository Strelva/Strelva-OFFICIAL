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

import { refreshGoogleTokens, GA4_READ_SCOPE, GSC_READ_SCOPE } from "@/platform/infra/google-token";
export { refreshGoogleTokens, GA4_READ_SCOPE, GSC_READ_SCOPE, type RefreshedGoogleTokens, type GoogleRefreshOutcome } from "@/platform/infra/google-token";

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
