import { authorizeTenantOperatorRead } from "@/platform/operator-read-audit/admission";
import { NextResponse } from "next/server";
import { requireTenantAccess, verifyAuth } from "@/platform/infra/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTenantConfig } from "@/lib/tenants";
import { getLeads, leadReadStoreReady, leadReadSource } from "@/lib/leads";
import { getInquiryRepository, inquiryReleaseMayBeOn, inquiryReleasedForCurrentUser } from "@/products/inquiries/server";
import { resolveInquiryWorkspace } from "@/products/inquiries/server";

export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers });

export async function GET(request: Request) {
  if (!inquiryReleaseMayBeOn()) return json({ error: "Inquiry workspace is not enabled." }, 503);
  if (!(await verifyAuth())) return json({ error: "Unauthorized" }, 401);
  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;
    await authorizeTenantOperatorRead(tenant);
    if (!(await inquiryReleasedForCurrentUser(tenant))) return json({ error: "Inquiry workspace is not enabled." }, 503);
    const config = await getTenantConfig(tenant);
    if (!config || !config.active) return json({ error: "Business unavailable." }, 404);
    const workspace = await resolveInquiryWorkspace({
      tenantId: tenant,
      tenantStableId: config.stableId,
      fallbackBusinessId: config.stableId ?? tenant,
    });
    if (!(await leadReadStoreReady())) return json({ records: null, recordsAvailable: false }, 503);
    const params = new URL(request.url).searchParams;
    const before = params.get("before");
    const beforeId = params.get("beforeId");
    if (beforeId && (!before || !/^lead_[A-Za-z0-9_-]{1,100}$/.test(beforeId))) return json({ error: "Invalid inquiry cursor." }, 400);
    if (before && !Number.isFinite(Date.parse(before))) return json({ error: "Invalid inquiry cursor." }, 400);
    const limitValue = Number(params.get("limit") || 50);
    const limit = Number.isSafeInteger(limitValue) ? Math.max(1, Math.min(limitValue, 500)) : 50;
    const [records, overlays] = await Promise.all([
      getLeads(tenant, limit, before, beforeId),
      getInquiryRepository().getRecordOverlays(tenant, workspace.businessId),
    ]);
    const durableReads = await leadReadSource() === "postgres";
    return json({ records, recordsAvailable: true, recordOverlays: overlays,
      ...(durableReads ? { nextBefore: records.length === limit ? records.at(-1)?.createdAt ?? null : null,
        nextBeforeId: records.length === limit ? records.at(-1)?.id ?? null : null } : {}) });
  } catch {
    return json({ error: "Inquiry records are temporarily unavailable." }, 503);
  }
}
