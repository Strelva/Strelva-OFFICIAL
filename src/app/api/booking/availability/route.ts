import { NextResponse } from "next/server";
import { getAvailableSlots } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const serviceId = searchParams.get("serviceId");

  if (!date || !serviceId) {
    return NextResponse.json(
      { error: "date and serviceId are required" },
      { status: 400 }
    );
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  try {
    const tenant = await getTenantFromHeaders();
    const slots = await getAvailableSlots(date, serviceId, tenant);
    return NextResponse.json({ date, serviceId, slots });
  } catch {
    return NextResponse.json({ error: "Failed to get availability" }, { status: 500 });
  }
}
