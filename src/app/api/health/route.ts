import { NextResponse } from "next/server";
import { getServiceHealth } from "@/lib/health";

export async function GET() {
  const report = await getServiceHealth();
  // Core down (Redis/Sanity erroring) → 503 so uptime monitors page; else 200.
  return NextResponse.json(report, { status: report.status === "down" ? 503 : 200 });
}
