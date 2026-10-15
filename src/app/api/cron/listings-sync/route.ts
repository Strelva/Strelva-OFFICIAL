import { NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { listingsSyncMayBeOn, sweepListingsSync } from "@/products/listings-sync/server";

export const maxDuration = 60;

/**
 * Daily sweep for Listings in sync: queues a check for each business whose record
 * moved or whose last check is a day old, then runs a few. Off means no database
 * call. Not scheduled in vercel.json: checks also run on app events, "Check now"
 * and after a fix. Adding it to vercel.json is a separate decision.
 */
async function sweep(request: Request) {
  const denied = requireCronRequest(request);
  if (denied) return denied;
  if (!listingsSyncMayBeOn()) return NextResponse.json({ skipped: true, reason: "listings_sync off" });
  return NextResponse.json(await sweepListingsSync());
}

export const GET = sweep;
export const POST = sweep;
