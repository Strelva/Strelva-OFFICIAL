import { NextResponse } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireTenantAccess } from "@/lib/auth";
import { listMembers } from "@/lib/rewards/memberRepositoryKv";
import { KvNotConfiguredError } from "@/lib/rewards/kv";

export async function GET() {
  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const members = await listMembers(tenant);
    return NextResponse.json({ members });
  } catch (err) {
    if (err instanceof KvNotConfiguredError) {
      return NextResponse.json({ error: "kv not configured" }, { status: 503 });
    }
    console.error("[rewards members GET]", err);
    return NextResponse.json({ error: "Failed to load members" }, { status: 500 });
  }
}
