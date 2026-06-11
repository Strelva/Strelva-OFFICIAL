/**
 * GET /api/gbp/state
 *
 * Returns the live GBP state (hours + last 3 posts) for the authenticated
 * tenant. Always fetched fresh from the GBP API — never returns cached claims.
 *
 * Auth: Clerk session required; tenant must be accessible to the caller.
 *
 * 200 { state: GbpState }
 * 204 when GBP is not connected or data is unavailable (no error — the
 *     dashboard can render a "Connect Google" prompt on 204).
 * 401 / 403 on auth failure.
 */

import { NextResponse } from "next/server";
import { verifyAuth, requireTenantAccess } from "@/lib/auth";
import { requireTenantFromHeaders } from "@/lib/tenant";
import { getGbpState } from "@/lib/gbp-management";

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let tenantId: string;
  try {
    tenantId = await requireTenantFromHeaders();
  } catch {
    return NextResponse.json({ error: "Missing tenant" }, { status: 400 });
  }

  const denied = await requireTenantAccess(tenantId);
  if (denied) return denied;

  const state = await getGbpState(tenantId);
  if (!state) {
    // Not connected or no metadata — return 204 so UI can show a connect prompt.
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json({ state });
}
