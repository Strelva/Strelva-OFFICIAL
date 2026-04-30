/**
 * Instagram OAuth Initiation Route
 *
 * Required environment variables:
 * - INSTAGRAM_CLIENT_ID: Instagram App ID
 * - INSTAGRAM_CLIENT_SECRET: Instagram App Secret
 * - NEXT_PUBLIC_APP_URL: Base URL for redirect
 */

import { NextResponse } from "next/server";
import { verifyAuth, requireTenantAccess } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";

const INSTAGRAM_AUTH_URL = "https://api.instagram.com/oauth/authorize";
const SCOPES = ["user_profile", "user_media"];

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;

  const clientId = process.env.INSTAGRAM_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!clientId || !appUrl) {
    return NextResponse.json(
      { error: "OAuth not configured" },
      { status: 500 }
    );
  }

  const redirectUri = `${appUrl}/api/oauth/instagram/callback`;

  // Encode tenantId in state for callback
  const state = Buffer.from(JSON.stringify({ tenantId: tenant })).toString(
    "base64url"
  );

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(","),
    state,
  });

  const authUrl = `${INSTAGRAM_AUTH_URL}?${params.toString()}`;

  return NextResponse.redirect(authUrl);
}
