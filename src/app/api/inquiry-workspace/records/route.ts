import { NextResponse } from "next/server";
import { requireTenantAccess, verifyAuth } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTenantConfig } from "@/lib/tenants";
import { getRedis } from "@/lib/redis";
import { getLeads } from "@/lib/leads";
import { getInquiryRepository, inquiryReleaseEnabled } from "@/products/inquiries/server";

export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers });

export async function GET(request: Request) {
  if (!inquiryReleaseEnabled()) return json({ error: "Inquiry workspace is not enabled." }, 503);
  if (!(await verifyAuth())) return json({ error: "Unauthorized" }, 401);
  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;
    const config = await getTenantConfig(tenant);
    if (!config || !config.active) return json({ error: "Business unavailable." }, 404);
    const redis = getRedis();
    if (!redis) return json({ records: null, recordsAvailable: false }, 503);
    const limitValue = Number(new URL(request.url).searchParams.get("limit") || 50);
    const limit = Number.isSafeInteger(limitValue) ? Math.max(1, Math.min(limitValue, 500)) : 50;
    const [records, overlays] = await Promise.all([
      getLeads(tenant, limit),
      getInquiryRepository().getRecordOverlays(tenant, config.stableId ?? tenant),
    ]);
    return json({ records, recordsAvailable: true, recordOverlays: overlays });
  } catch {
    return json({ error: "Inquiry records are temporarily unavailable." }, 503);
  }
}
