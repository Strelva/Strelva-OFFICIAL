import { NextResponse } from "next/server";
import { getActivity } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";

export async function GET() {
  try {
    const tenant = await getTenantFromHeaders();
    const activity = await getActivity(tenant);
    return NextResponse.json(activity);
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
