/**
 * Instagram OAuth Initiation Route
 *
 * Required environment variables:
 * - INSTAGRAM_CLIENT_ID: Instagram App ID
 * - INSTAGRAM_CLIENT_SECRET: Instagram App Secret
 * - NEXT_PUBLIC_APP_URL: Base URL for redirect
 */

import { NextResponse } from "next/server";
import { verifyAuth, requireTenantAccess, requireTenantPermission } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { createOAuthState } from "@/lib/oauth-state";
import { requireActiveSubscription } from "@/lib/subscription";

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
  const permissionDenied = await requireTenantPermission(tenant, "settings:write");
  if (permissionDenied) return permissionDenied;
  const blocked = await requireActiveSubscription(tenant);
  if (blocked) return blocked;

  const clientId = process.env.INSTAGRAM_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!clientId || !appUrl) {
    return NextResponse.json(
      { error: "OAuth not configured" },
      { status: 500 }
    );
  }

  const redirectUri = `${appUrl}/api/oauth/instagram/callback`;

  const state = createOAuthState(tenant);

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
