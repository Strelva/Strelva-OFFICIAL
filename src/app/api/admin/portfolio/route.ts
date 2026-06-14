import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/auth";
import {
  buildPortfolioSnapshot,
  getPortfolioSummary,
  setPortfolioSummary,
} from "@/lib/portfolio";

export async function GET() {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Cache-first: the cron keeps reb:portfolio:summary warm. On a miss (cold
  // start, no Redis, or expired) recompute live and repopulate.
  let snapshot = await getPortfolioSummary();
  let cached = true;
  if (!snapshot) {
    snapshot = await buildPortfolioSnapshot();
    await setPortfolioSummary(snapshot);
    cached = false;
  }

  return NextResponse.json({ ...snapshot, cached });
}
