import { NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { recordHeartbeat } from "@/platform/infra/heartbeat";
import { connectedSitesReleaseEnabled } from "@/products/connected-sites/server";
import { connectedSitesStore } from "@/products/connected-sites/server";

export const maxDuration = 60;

/** Batches per run; each batch removes at most this many rows of each kind. */
const BATCH = 1000;
const MAX_BATCHES = 10;

/**
 * Daily connected-site retention (20261008151000_connected_sites.sql):
 * visit and click events after 400 days, held spam after 30 days, through
 * `purge_connected_site_records`. Inquiries stay with the business. Runs while
 * the connected-sites env switch is on (the migration is applied then); with
 * it off the cron records a heartbeat and does nothing.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const denied = requireCronRequest(request);
  if (denied) return denied;
  if (!connectedSitesReleaseEnabled()) {
    await recordHeartbeat("connected-sites-purge", { ok: true, processed: 0 });
    return NextResponse.json({ status: "disabled" });
  }
  let events = 0;
  let spam = 0;
  try {
    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      const removed = await connectedSitesStore().purge(BATCH);
      events += removed.events;
      spam += removed.spam;
      if (removed.events < BATCH && removed.spam < BATCH) break;
    }
    await recordHeartbeat("connected-sites-purge", { ok: true, processed: events + spam });
    return NextResponse.json({ events, spam });
  } catch (error) {
    console.error("[cron connected-sites-purge] failed", error instanceof Error ? error.message : String(error));
    await recordHeartbeat("connected-sites-purge", { ok: false, processed: events + spam, failed: 1 });
    return NextResponse.json({ error: "Connected-site retention could not finish.", events, spam }, { status: 503 });
  }
}
