import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getPageConfig, setPageConfig } from "@/lib/storage";
import { getTenantFromHeaders, requireTenantFromHeaders } from "@/lib/tenant";
import { verifyAuth, requireTenantAccess } from "@/lib/auth";

export async function GET() {
  try {
    const tenant = await getTenantFromHeaders();
    const config = await getPageConfig(tenant);
    return NextResponse.json(config);
  } catch {
    return NextResponse.json({ error: "Failed to load page config" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const authed = await verifyAuth();
    if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenant = await requireTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const body = await request.json();
    await setPageConfig(body, tenant);
    revalidatePath("/");
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to save page config" }, { status: 500 });
  }
}
