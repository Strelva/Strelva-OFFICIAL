import { NextResponse } from "next/server";
import { verifyAuth } from "@/platform/infra/auth";
import { currentReleaseViewer } from "@/platform/release-flags/viewer";
import { inquiryReleaseEnabledForTenant, inquiryReleaseMayBeOn } from "@/products/inquiries";
import { discoverInquiryPortfolio } from "@/products/inquiries";

export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  if (!inquiryReleaseMayBeOn()) return NextResponse.json({ error: "Inquiries are not enabled." }, { status: 503, headers });
  if (!await verifyAuth()) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    // Per site: only businesses with inquiries on (their row under `workspace`).
    const viewer = await currentReleaseViewer();
    return NextResponse.json(await discoverInquiryPortfolio(undefined, (tenantId) => inquiryReleaseEnabledForTenant(tenantId, viewer)), { headers });
  }
  catch { return NextResponse.json({ error: "Your businesses could not be loaded." }, { status: 503, headers }); }
}
