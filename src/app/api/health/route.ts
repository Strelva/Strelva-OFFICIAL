import { NextResponse } from "next/server";
import { getServiceHealth } from "@/lib/health";

export async function GET() {
  const report = await getServiceHealth();
  // Core down (Redis or Supabase missing/failing in production) → 503.
  return NextResponse.json(report, { status: report.status === "down" ? 503 : 200 });
}
