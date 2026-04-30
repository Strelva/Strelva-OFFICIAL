/**
 * Instagram OAuth Callback Route
 *
 * Exchanges authorization code for access tokens and saves connection.
 */

import { NextResponse } from "next/server";
import { saveConnection } from "@/lib/connections";

const INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const INSTAGRAM_LONG_LIVED_URL = "https://graph.instagram.com/access_token";

interface ShortLivedTokenResponse {
  access_token: string;
}

interface LongLivedTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  if (error) {
    console.error("[instagram-callback] OAuth error:", error);
    return NextResponse.redirect(`${appUrl}/dashboard/connections?error=oauth_denied`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/dashboard/connections?error=missing_params`);
  }

  // Decode state to get tenantId
  let tenantId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    tenantId = decoded.tenantId;
  } catch {
    return NextResponse.redirect(`${appUrl}/dashboard/connections?error=invalid_state`);
  }

  const clientId = process.env.INSTAGRAM_CLIENT_ID;
  const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${appUrl}/dashboard/connections?error=not_configured`);
  }

  const redirectUri = `${appUrl}/api/oauth/instagram/callback`;

  try {
    // Exchange code for short-lived token
    const tokenRes = await fetch(INSTAGRAM_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[instagram-callback] Token exchange failed:", errText);
      return NextResponse.redirect(`${appUrl}/dashboard/connections?error=token_exchange`);
    }

    const shortLived: ShortLivedTokenResponse = await tokenRes.json();

    // Exchange short-lived for long-lived token (60 days)
    const longLivedRes = await fetch(
      `${INSTAGRAM_LONG_LIVED_URL}?` +
        new URLSearchParams({
          grant_type: "ig_exchange_token",
          client_secret: clientSecret,
          access_token: shortLived.access_token,
        })
    );

    if (!longLivedRes.ok) {
      const errText = await longLivedRes.text();
      console.error("[instagram-callback] Long-lived token exchange failed:", errText);
      return NextResponse.redirect(`${appUrl}/dashboard/connections?error=long_lived_token`);
    }

    const longLived: LongLivedTokenResponse = await longLivedRes.json();

    // Save connection with long-lived token
    await saveConnection({
      tenantId,
      provider: "instagram",
      status: "connected",
      accessToken: longLived.access_token,
      expiresAt: new Date(Date.now() + longLived.expires_in * 1000).toISOString(),
    });

    return NextResponse.redirect(`${appUrl}/dashboard/connections?success=instagram`);
  } catch (err) {
    console.error("[instagram-callback] Error:", err);
    return NextResponse.redirect(`${appUrl}/dashboard/connections?error=unknown`);
  }
}
