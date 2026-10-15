import { NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { recordHeartbeat } from "@/platform/infra/heartbeat";
import { connectedSitesReleaseEnabled } from "@/products/connected-sites/server";
import { connectedSitesStore } from "@/products/connected-sites/server";
import { intakeSensitiveFieldsAvailable, purgeIntakeSensitive, verticalIntakeReleaseMayBeOn } from "@/products/vertical-intake/server";

export const maxDuration = 60;

/** Batches per run; each batch removes at most this many rows of each kind. */
const BATCH = 1000;
const MAX_BATCHES = 10;

/**
 * Dental intake's member IDs are ciphertext with a 30-day life. Runs only where the App may be on (or where
 * member IDs may have been collected), in its own try/catch: a failure here never stops connected-site
 * retention. Null means it did not run.
 */
async function purgeIntake(): Promise<{ removed: number; failed: boolean } | null> {
  if (!verticalIntakeReleaseMayBeOn() && !intakeSensitiveFieldsAvailable()) return null;
  let removed = 0;
  try {
    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      const count = await purgeIntakeSensitive(BATCH);
      removed += count;
      if (count < BATCH) break;
    }
    return { removed, failed: false };
  } catch (error) {
    console.error("[cron connected-sites-purge] intake retention failed", error instanceof Error ? error.message : String(error));
    return { removed, failed: true };
  }
}

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
    const intake = await purgeIntake();
    await recordHeartbeat("connected-sites-purge", { ok: !intake?.failed, processed: intake?.removed ?? 0, ...(intake?.failed ? { failed: 1 } : {}) });
    return NextResponse.json({ status: "disabled", ...(intake ? { intakeSensitive: intake.removed } : {}) });
  }
  let events = 0;
  let spam = 0;
  const intake = await purgeIntake();
  const intakeSensitive = intake?.removed ?? 0;
  const intakeFailed = intake?.failed ? 1 : 0;
  try {
    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      const removed = await connectedSitesStore().purge(BATCH);
      events += removed.events;
      spam += removed.spam;
      if (removed.events < BATCH && removed.spam < BATCH) break;
    }
    await recordHeartbeat("connected-sites-purge", { ok: !intakeFailed, processed: events + spam + intakeSensitive, ...(intakeFailed ? { failed: 1 } : {}) });
    return NextResponse.json({ events, spam, ...(intake ? { intakeSensitive } : {}) });
  } catch (error) {
    console.error("[cron connected-sites-purge] failed", error instanceof Error ? error.message : String(error));
    await recordHeartbeat("connected-sites-purge", { ok: false, processed: events + spam + intakeSensitive, failed: 1 + intakeFailed });
    return NextResponse.json({ error: "Connected-site retention could not finish.", events, spam, ...(intake ? { intakeSensitive } : {}) }, { status: 503 });
  }
}
