import { NextResponse } from "next/server";
import { uploadTenantImageFile, mediaUploadErrorResponse } from "@/platform/infra/media/store";
import { verifyAuth, requireTenantPermission } from "@/platform/infra/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { isRateLimitedAsync } from "@/platform/infra/rate-limit";
import { requireActiveSubscription } from "@/lib/subscription";

export async function POST(request: Request) {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getTenantFromHeaders();

  if (await isRateLimitedAsync(`upload:${tenant}`, 20)) {
    return NextResponse.json(
      { error: "Too many uploads. Try again in a minute." },
      { status: 429 }
    );
  }

  const permissionDenied = await requireTenantPermission(tenant, "content:write");
  if (permissionDenied) return permissionDenied;
  const blocked = await requireActiveSubscription(tenant);
  if (blocked) return blocked;

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  try {
    const asset = await uploadTenantImageFile(tenant, file);
    return NextResponse.json({ url: asset.url, asset });
  } catch (err) {
    const { status, error } = mediaUploadErrorResponse(err);
    return NextResponse.json({ error }, { status });
  }
}
