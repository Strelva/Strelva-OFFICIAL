import { NextResponse } from "next/server";
import { isTenantId } from "@/lib/scaffold-contracts";
import { getTenantConfig } from "@/lib/tenants";
import { getInquiryRepository, inquiryReleaseEnabled, projectPublishedInquiry } from "@/products/inquiries/server";
import { INQUIRY_WORKSPACE_EXIT_CODE, resolveInquiryWorkspace } from "@/products/inquiries/server";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: responseHeaders });

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: responseHeaders });
}

export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  if (!inquiryReleaseEnabled()) return json({ error: "Inquiry forms are not enabled." }, 503);
  const { tenant } = await params;
  const capabilityId = new URL(request.url).searchParams.get("capabilityId");
  if (!isTenantId(tenant) || !capabilityId || capabilityId.length > 200) return json({ error: "Invalid inquiry form." }, 400);
  try {
    const config = await getTenantConfig(tenant);
    if (!config || !config.active) return json({ error: "Inquiry form unavailable." }, 404);
    const workspace = await resolveInquiryWorkspace({
      tenantId: tenant,
      tenantStableId: config.stableId,
      fallbackBusinessId: config.stableId ?? tenant,
    });
    if (workspace.exitCompleted) return json({ error: "Inquiry form is stopped for this workspace.", code: INQUIRY_WORKSPACE_EXIT_CODE }, 409);
    const snapshot = await getInquiryRepository().getSnapshot(tenant, workspace.businessId);
    const capability = snapshot?.state.capabilities.find((item) => item.id === capabilityId && item.businessId === workspace.businessId);
    const projection = capability ? projectPublishedInquiry(capability) : null;
    return projection ? json(projection) : json({ error: "Inquiry form unavailable." }, 404);
  } catch {
    return json({ error: "Inquiry forms are temporarily unavailable." }, 503);
  }
}
