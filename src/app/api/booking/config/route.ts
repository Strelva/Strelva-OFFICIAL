import { NextResponse } from "next/server";
import { getBookingConfig, setBookingConfig } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { verifyAuth } from "@/lib/auth";

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tenant = await getTenantFromHeaders();
    const config = await getBookingConfig(tenant);
    return NextResponse.json(config);
  } catch {
    return NextResponse.json({ error: "Failed to get config" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const tenant = await getTenantFromHeaders();
    await setBookingConfig(body, tenant);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to update config" }, { status: 500 });
  }
}
