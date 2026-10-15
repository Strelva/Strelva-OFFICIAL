import { NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { dispatchAppEvents } from "@/platform/app-events/dispatcher";
import { appEventsMayBeOn } from "@/platform/app-events/release";
import { readAppEventHealth } from "@/platform/app-events/store";
import { recordHeartbeat } from "@/platform/infra/heartbeat";
import { alertOnce } from "@/platform/infra/monitoring";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { registerProductAppEventHandlers } from "@/server/app-events/handlers";

export const maxDuration = 60;

/**
 * Delivers Events to App handlers and to registered Webhooks, in order per
 * business, and sets aside the ones that cannot be delivered. Off means no
 * database call at all. Capture is a separate database switch: with it off
 * there is nothing to deliver.
 */
export async function GET(request: Request) {
  const denied = requireCronRequest(request); if (denied) return denied;
  if (!workspaceReleaseEnabled() || !appEventsMayBeOn()) {
    await recordHeartbeat("app-events", { ok: true, processed: 0 });
    return NextResponse.json({ status: "disabled" });
  }
  registerProductAppEventHandlers();
  const result = await dispatchAppEvents();
  const health = await readAppEventHealth().catch(() => null);
  if (health && health.emitFailuresLast24h > 0) await alertOnce("app_event_emit_failures", "high", { count: health.emitFailuresLast24h }, 6 * 3600);
  if (result.dead + result.webhooks.dead > 0) await alertOnce("app_event_dead_letters", "medium", { count: result.dead + result.webhooks.dead }, 6 * 3600);
  await recordHeartbeat("app-events", {
    ok: result.errors.length === 0 && (health?.emitFailuresLast24h ?? 0) === 0,
    processed: result.delivered + result.webhooks.delivered,
    failed: result.dead + result.retried + result.webhooks.dead + result.webhooks.retried + result.errors.length,
  });
  return NextResponse.json({ ...result, health });
}
