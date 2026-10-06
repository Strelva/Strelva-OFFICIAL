import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/heartbeat";
import { reconcileLeadMirror } from "@/lib/client-leads";
import { alertOnce } from "@/lib/monitoring";
import { requireCronRequest } from "@/lib/cron-auth";

export const maxDuration = 120;

/**
 * Hourly retry for client leads whose Postgres copy failed at capture time
 * (src/lib/lead-mirror.ts). Anything still pending after the retry pages
 * operators, at most every six hours, and shows on /admin/client-leads.
 */
export async function GET(request: Request) {
  const denied = requireCronRequest(request);
  if (denied) return denied;

  const result = await reconcileLeadMirror({ limit: 200, deadlineMs: 90_000 });
  if (result.remaining > 0 || result.missing > 0) {
    await alertOnce(
      "lead_mirror_backlog",
      "high",
      { remaining: result.remaining, missing: result.missing, failed: result.failed },
      6 * 3600,
    );
  }
  await recordHeartbeat("lead-mirror-reconcile", {
    ok: result.failed === 0 && result.missing === 0,
    processed: result.checked,
    failed: result.failed + result.missing,
  });
  return NextResponse.json(result);
}
