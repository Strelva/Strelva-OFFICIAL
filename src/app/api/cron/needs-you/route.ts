import { NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { recordHeartbeat } from "@/lib/heartbeat";
import { needsYouReleaseEnabled, needsYouService } from "@/platform/needs-you/server";

export const maxDuration = 300;

/**
 * Hourly Needs you chase. Opens items for converted businesses, sends urgent
 * asks at once and the morning email at 07:00 in each business's timezone,
 * reminds on day 3 and day 7, and lapses on day 14 with nothing changed.
 *
 * Every email goes through src/lib/email/send.ts. While client email is
 * gated, each delivery is recorded as suppressed ("owner not told"). With
 * STRELVA_NEEDS_YOU_RELEASE off it records a heartbeat and does nothing.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const denied = requireCronRequest(request);
  if (denied) return denied;

  if (!needsYouReleaseEnabled()) {
    await recordHeartbeat("needs-you", { ok: true, processed: 0 });
    return NextResponse.json({ status: "disabled", ranAt: new Date().toISOString() });
  }

  try {
    const summary = await needsYouService().chase();
    await recordHeartbeat("needs-you", {
      ok: summary.failed === 0,
      processed: summary.lapsed + summary.reminded + summary.digests + summary.urgent,
      failed: summary.failed,
    });
    return NextResponse.json({ ranAt: new Date().toISOString(), ...summary });
  } catch (error) {
    console.error("[cron needs-you] failed", error instanceof Error ? error.message : String(error));
    await recordHeartbeat("needs-you", { ok: false, failed: 1 });
    return NextResponse.json({ error: "Needs you chase failed." }, { status: 500 });
  }
}
