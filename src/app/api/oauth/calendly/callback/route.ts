import { NextResponse } from "next/server";
import { saveConnection } from "@/lib/connections";
import { getRedis } from "@/lib/redis";
import { consumeOAuthState } from "@/lib/oauth-state";
import { verifyAuth, requireTenantAccess } from "@/lib/auth";

const TOKEN_URL = "https://auth.calendly.com/oauth/token";
const USER_URL = "https://api.calendly.com/users/me";
const WEBHOOK_URL = "https://api.calendly.com/webhook_subscriptions";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

interface CalendlyUser {
  resource: {
    uri: string;
    current_organization: string;
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const connectionsUrl = `${appUrl}/dashboard/sources`;

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

  // Bind the code exchange to a live session so a stolen state token can't
  // associate attacker tokens to a victim tenant.
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.redirect(
      `${connectionsUrl}?error=${encodeURIComponent("Session expired — please try connecting again")}`
    );
  }

  // Single-use state (HMAC verify + nonce del).
  const verifiedState = await consumeOAuthState(state);
  if (!verifiedState) {
    return NextResponse.redirect(
      `${connectionsUrl}?error=${encodeURIComponent("Invalid OAuth state")}`
    );
  }
  const tenantId = verifiedState.tenantId;

  const accessDenied = await requireTenantAccess(tenantId);
  if (accessDenied) {
    return NextResponse.redirect(
      `${connectionsUrl}?error=${encodeURIComponent("Access denied")}`
    );
  }

  const clientId = process.env.CALENDLY_CLIENT_ID;
  const clientSecret = process.env.CALENDLY_CLIENT_SECRET;

  if (!clientId || !clientSecret || !appUrl) {
    return NextResponse.redirect(
      `${connectionsUrl}?error=${encodeURIComponent("OAuth not configured")}`
    );
  }

  const redirectUri = `${appUrl}/api/oauth/calendly/callback`;

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
      console.error("Calendly token exchange failed:", errBody);
      return NextResponse.redirect(
        `${connectionsUrl}?error=${encodeURIComponent("Failed to connect Calendly account")}`
      );
    }

    const tokens: TokenResponse = await tokenRes.json();

    const expiresAt = new Date(
      Date.now() + tokens.expires_in * 1000
    ).toISOString();

    const userRes = await fetch(USER_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userRes.ok) {
      console.error("Calendly user fetch failed:", await userRes.text());
      return NextResponse.redirect(
        `${connectionsUrl}?error=${encodeURIComponent("Failed to fetch Calendly user")}`
      );
    }

    const userData: CalendlyUser = await userRes.json();
    const userUri = userData.resource.uri;
    const orgUri = userData.resource.current_organization;

    const webhookRes = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: `${appUrl}/api/webhooks/calendly`,
        events: ["invitee.created"],
        organization: orgUri,
        user: userUri,
        scope: "user",
      }),
    });

    if (!webhookRes.ok) {
      const webhookErr = await webhookRes.text();
      console.error("Calendly webhook registration failed:", webhookErr);
    }

    await saveConnection({
      provider: "calendly",
      tenantId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      status: "connected",
      lastSyncedAt: new Date().toISOString(),
    });

    const redis = getRedis();
    if (redis) {
      await redis.set(
        `calendly-meta:${tenantId}`,
        { userUri, orgUri },
        { ex: 60 * 60 * 24 * 365 }
      );
      // Reverse index so the webhook resolves the tenant in O(1) instead of a
      // blocking KEYS scan on every invitee.created event.
      await redis.set(`calendly-user-uri:${userUri}`, tenantId, {
        ex: 60 * 60 * 24 * 365,
      });
    }

    return NextResponse.redirect(`${connectionsUrl}?success=true`);
  } catch (err) {
    console.error("Calendly OAuth callback error:", err);
    return NextResponse.redirect(
      `${connectionsUrl}?error=${encodeURIComponent("Failed to connect Calendly account")}`
    );
  }
}
