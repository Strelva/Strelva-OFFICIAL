import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/auth";
import { getRecentFailures } from "@/lib/revalidate-client";

export async function GET() {
  const admin = await isSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const failures = getRecentFailures();
  return NextResponse.json({
    failures,
    count: failures.length,
  });
}
