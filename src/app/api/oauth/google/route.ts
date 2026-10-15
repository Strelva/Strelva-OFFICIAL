import { getActorContext } from "@/platform/infra/auth";
import { providerKeyStatus } from "@/platform/connections/provider-keys";
import { assertTenantGoogleConnectionEligible } from "@/products/google-listing/server";
/**
 * Google OAuth Initiation Route
 *
 * Required environment variables:
 * - GOOGLE_CLIENT_ID: Google Cloud OAuth client ID
 * - GOOGLE_CLIENT_SECRET: Google Cloud OAuth client secret
 * - NEXT_PUBLIC_APP_URL: Base URL for redirect (e.g., https://admin.yourdomain.com)
 */

import { NextResponse } from "next/server";
import { verifyAuth, requireTenantPermission } from "@/platform/infra/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { createOAuthState } from "@/lib/oauth-state";
import { requireActiveSubscription } from "@/lib/subscription";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
// One consent grants everything the dashboard reads/writes for a tenant:
//  - business.manage      → GBP write-side (hours, posts, review replies)
//  - webmasters.readonly  → Search Console performance reads
//  - analytics.readonly   → GA4 (Analytics Data API) reads
// NOTE: these scopes must ALSO be registered on the OAuth consent screen in the
// Google Cloud console (operator step) — Google rejects the consent redirect
// for any scope not listed there.
const SCOPES = [
  "https://www.googleapis.com/auth/business.manage",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
];

export async function GET() {
  if (process.env.STRELVA_NATIVE_GOOGLE_ONLY === "1") return NextResponse.json({ error: "Use the native workspace Google connection in this admission mode." }, { status: 503 });
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantFromHeaders();
  const permissionDenied = await requireTenantPermission(tenant, "settings:write");
  if (permissionDenied) return permissionDenied;
  const blocked = await requireActiveSubscription(tenant);
  if (blocked) return blocked;

  const context = await getActorContext(tenant);
  if (!context.userId || !context.email || !["user", "super_admin"].includes(context.type)) return NextResponse.json({error:"Access denied"},{status:403});
  try { await assertTenantGoogleConnectionEligible({userId:context.userId,verifiedEmail:context.email},tenant); }
  catch (error) { return NextResponse.json({error:error instanceof Error ? error.message : "Google Business Profile is coming soon."},{status:409}); }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  // Missing keys are Strelva's to add, not a server fault: say so, and log the missing names once.
  if (!providerKeyStatus("google_sign_in_legacy").ready || !clientId || !appUrl) {
    return NextResponse.json(
      { error: "Google isn't set up on Strelva yet." },
      { status: 503 }
    );
  }

  const redirectUri = `${appUrl}/api/oauth/google/callback`;

  const state = createOAuthState(tenant);

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
