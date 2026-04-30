/**
 * Google OAuth Initiation Route
 *
 * Required environment variables:
 * - GOOGLE_CLIENT_ID: Google Cloud OAuth client ID
 * - GOOGLE_CLIENT_SECRET: Google Cloud OAuth client secret
 * - NEXT_PUBLIC_APP_URL: Base URL for redirect (e.g., https://admin.yourdomain.com)
 */

import { NextResponse } from "next/server";
import { verifyAuth, requireTenantAccess } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES = ["https://www.googleapis.com/auth/business.manage"];

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!clientId || !appUrl) {
    return NextResponse.json(
      { error: "OAuth not configured" },
      { status: 500 }
    );
  }

  const redirectUri = `${appUrl}/api/oauth/google/callback`;

  // Encode tenantId in state for callback
  const state = Buffer.from(JSON.stringify({ tenantId: tenant })).toString(
    "base64url"
  );

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });

  const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;

  return NextResponse.redirect(authUrl);
}
