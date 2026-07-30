/**
 * Google OAuth Callback Route
 *
 * Handles the OAuth callback from Google, exchanges the code for tokens,
 * fetches account/location info for review polling, and saves the connection.
 *
 * Required environment variables:
 * - GOOGLE_CLIENT_ID: Google Cloud OAuth client ID
 * - GOOGLE_CLIENT_SECRET: Google Cloud OAuth client secret
 * - NEXT_PUBLIC_APP_URL: Base URL for redirect (e.g., https://admin.yourdomain.com)
 */

import { NextResponse } from "next/server";
import { saveConnection } from "@/lib/connections";
import { getRedis } from "@/lib/redis";
import { consumeOAuthState } from "@/lib/oauth-state";
import { verifyAuth, requireTenantAccess } from "@/lib/auth";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  /** Space-delimited list of scopes granted by the user. */
  scope?: string;
}

interface GoogleAccount {
  name: string; // "accounts/123456"
  accountName: string;
  type: string;
}

interface GoogleLocation {
  name: string; // "accounts/123/locations/456"
  title: string;
}

async function fetchAccounts(accessToken: string): Promise<GoogleAccount[]> {
  try {
    const res = await fetch(ACCOUNTS_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.accounts ?? [];
  } catch {
    return [];
  }
}

async function fetchLocations(accessToken: string, accountName: string): Promise<GoogleLocation[]> {
  try {
    const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.locations ?? [];
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  // Land on the Google Business tab after connecting — it shows the now-live
  // listing state (hours, posts) rather than the raw connection-detail page.
  const connectionsUrl = `${appUrl}/dashboard/google`;

  // Handle OAuth errors from Google
  if (error) {
    const errorDesc = url.searchParams.get("error_description") || error;
    return NextResponse.redirect(
      `${connectionsUrl}?error=${encodeURIComponent(errorDesc)}`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${connectionsUrl}?error=${encodeURIComponent("Missing OAuth parameters")}`
    );
  }

  // Verify session first — bind the code exchange to a user who currently holds
  // settings:write on the target tenant. This eliminates the replay window where
  // a stolen state token could associate attacker-controlled tokens to a victim
  // tenantId, because the callback now requires a valid browser session.
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.redirect(
      `${connectionsUrl}?error=${encodeURIComponent("Session expired — please try connecting again")}`
    );
  }

  // Consume the state token (HMAC verify + nonce del in Redis for single-use).
  const verifiedState = await consumeOAuthState(state);
  if (!verifiedState) {
    return NextResponse.redirect(
      `${connectionsUrl}?error=${encodeURIComponent("Invalid OAuth state")}`
    );
  }
  const tenantId = verifiedState.tenantId;

  // Confirm the session user still has access to the tenant embedded in the state.
  const accessDenied = await requireTenantAccess(tenantId);
  if (accessDenied) {
    return NextResponse.redirect(
      `${connectionsUrl}?error=${encodeURIComponent("Access denied")}`
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret || !appUrl) {
    return NextResponse.redirect(
      `${connectionsUrl}?error=${encodeURIComponent("OAuth not configured")}`
    );
  }

  const redirectUri = `${appUrl}/api/oauth/google/callback`;

  // Exchange code for tokens
  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error("Google token exchange failed:", errBody);
      return NextResponse.redirect(
        `${connectionsUrl}?error=${encodeURIComponent("Failed to connect Google account")}`
      );
    }

    const tokens: TokenResponse = await tokenRes.json();

    // Calculate expiration time
    const expiresAt = new Date(
      Date.now() + tokens.expires_in * 1000
    ).toISOString();

    // Fetch account and location info for review polling
    const accounts = await fetchAccounts(tokens.access_token);
    let accountId: string | undefined;
    let locationId: string | undefined;

    if (accounts.length > 0) {
      accountId = accounts[0].name; // e.g., "accounts/123"
      const locations = await fetchLocations(tokens.access_token, accountId);
      if (locations.length > 0) {
        // Extract location ID from full name "accounts/123/locations/456"
        const parts = locations[0].name.split("/locations/");
        locationId = parts[1];
      }
    }

    // Parse granted scopes from the token response (space-delimited string).
    const scopes = tokens.scope
      ? tokens.scope.split(" ").filter(Boolean)
      : undefined;

    // Save connection
    await saveConnection({
      provider: "google",
      tenantId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      status: "connected",
      lastSyncedAt: new Date().toISOString(),
      scopes,
    });

    // Store account/location metadata for review polling
    if (accountId || locationId) {
      const redis = getRedis();
      if (redis) {
        await redis.set(
          `google-meta:${tenantId}`,
          { accountId, locationId },
          { ex: 60 * 60 * 24 * 365 }
        );
      }
    }

    return NextResponse.redirect(`${connectionsUrl}?success=true`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(
      `${connectionsUrl}?error=${encodeURIComponent("Failed to connect Google account")}`
    );
  }
}
