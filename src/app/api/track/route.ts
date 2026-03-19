import { NextResponse } from "next/server";
import { trackClick } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";

export async function POST(req: Request) {
  try {
    const { event } = await req.json();
    if (typeof event !== "string" || event.length > 50) {
      return NextResponse.json({ error: "Invalid event" }, { status: 400 });
    }
    const tenant = await getTenantFromHeaders();
    await trackClick(event, tenant);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
