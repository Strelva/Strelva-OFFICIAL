import { NextResponse } from "next/server";
import { getActivity } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";

export async function GET(request: Request) {
  try {
    const tenant = await getTenantFromHeaders();
    const url = new URL(request.url);
    const section = url.searchParams.get("section") || undefined;
    const actor = url.searchParams.get("actor") || undefined;

    const activity = await getActivity(tenant, { section, actor });
    return NextResponse.json(activity);
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
