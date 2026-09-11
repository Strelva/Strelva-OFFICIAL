import { NextResponse } from "next/server";
import { requireTenantAccess, verifyAuth } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTenantConfig } from "@/lib/tenants";
import { getInquiryRepository, inquiryReleaseEnabled, readInquiryRecord } from "@/products/inquiries/server";

export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!inquiryReleaseEnabled()) return json({ error: "Inquiry workspace is not enabled." }, 503);
  if (!(await verifyAuth())) return json({ error: "Unauthorized" }, 401);
  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;
    const config = await getTenantConfig(tenant);
    if (!config || !config.active) return json({ error: "Business unavailable." }, 404);
    const { id } = await params;
    if (!id || id.length > 256) return json({ error: "Inquiry record unavailable." }, 404);
    const result = await readInquiryRecord({
      tenantId: tenant,
      businessId: config.stableId ?? tenant,
      inquiryId: id,
      repository: getInquiryRepository(),
    });
    if (!result.available) return json({ error: "Inquiry records are temporarily unavailable." }, 503);
    if (!result.record) return json({ error: "Inquiry record unavailable." }, 404);
    return json(result);
  } catch {
    return json({ error: "Inquiry record is temporarily unavailable." }, 503);
  }
}
