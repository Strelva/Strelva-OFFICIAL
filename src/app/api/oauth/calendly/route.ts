import { beginOAuthHolder } from "./connection-holder";
import { providerKeyStatus } from "@/platform/connections/provider-keys";
import { NextResponse } from "next/server";
import { verifyAuth, requireTenantPermission } from "@/platform/infra/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { createOAuthState } from "@/lib/oauth-state";
import { requireActiveSubscription } from "@/lib/subscription";

const CALENDLY_AUTH_URL = "https://auth.calendly.com/oauth/authorize";

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantFromHeaders();
  const permissionDenied = await requireTenantPermission(tenant, "settings:write");
  if (permissionDenied) return permissionDenied;
  const blocked = await requireActiveSubscription(tenant);
  if (blocked) return blocked;

  try {
    await beginOAuthHolder("calendly", tenant);
  } catch {
    return NextResponse.json({ error: "This account cannot be connected for this business." }, { status: 403 });
  }

  const clientId = process.env.CALENDLY_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  // Missing keys are Strelva's to add, not a server fault: say so, and log the missing names once.
  if (!providerKeyStatus("calendly").ready || !clientId || !appUrl) {
    return NextResponse.json(
      { error: "Calendly isn't set up on Strelva yet." },
      { status: 503 }
    );
  }

  const redirectUri = `${appUrl}/api/oauth/calendly/callback`;
  const state = createOAuthState(tenant);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  });

  const authUrl = `${CALENDLY_AUTH_URL}?${params.toString()}`;

  return NextResponse.redirect(authUrl);
}
