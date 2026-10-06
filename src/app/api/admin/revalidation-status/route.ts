import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/platform/infra/auth";
import { getRecentFailures } from "@/lib/revalidate-client";

export async function GET() {
  const admin = await isSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const failures = await getRecentFailures();
  return NextResponse.json({
    failures,
    count: failures.length,
  });
}
