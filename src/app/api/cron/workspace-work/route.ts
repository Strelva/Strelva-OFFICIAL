import { NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { recordHeartbeat } from "@/platform/infra/heartbeat";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { listDueWork, sweepDueWork, snapshotDueResponsibilityMeters } from "@/products/operations/server";

export const maxDuration = 60;

/**
 * Due Make real activations and idle Possibilities. An activation already
 * running keeps settling even after Systems is turned off for its workspace
 * (spec section 6.5); a channel that is off leaves its step Waiting. Failures
 * are reported, never thrown, so the work sweep below always runs.
 */
async function settleSystems(): Promise<{ activations: { processed: number; failed: number }; withdrawn: number; error?: string }> {
  try {
    const { liveMakeReal, listDueActivations } = await import("@/platform/make-real/live-server");
    const { withdrawIdlePossibilities } = await import("@/platform/possibilities/supabase-repository");
    const resumed = await liveMakeReal.resumeDue(await listDueActivations(20), 15_000);
    const withdrawn = await withdrawIdlePossibilities({ idleDays: 90, limit: 100 }).catch(() => []);
    return { activations: { processed: resumed.processed, failed: resumed.failed }, withdrawn: withdrawn.length };
  } catch (error) {
    return { activations: { processed: 0, failed: 1 }, withdrawn: 0, error: error instanceof Error ? error.message.slice(0, 200) : "unavailable" };
  }
}

export async function GET(request: Request) {
  const denied = requireCronRequest(request); if (denied) return denied;
  if (!workspaceReleaseEnabled()) {
    await recordHeartbeat("workspace-work", { ok: true, processed: 0 });
    return NextResponse.json({ status: "disabled" });
  }
  const systems = await settleSystems();
  // Preserve the existing response exactly with notice flags off. This retry
  // lane is independent of general background work and cannot replay sends
  // with an unknown provider outcome.
  const { toolNoticesMayBeOn, retryToolNotices } = await import("@/products/applications/server");
  const notices = toolNoticesMayBeOn() ? await retryToolNotices().catch(() => ({ processed: 0, failed: 1 })) : null;
  if (notices) {
    systems.activations.processed += notices.processed;
    systems.activations.failed += notices.failed;
  }
  // New standing work is opt-in independently of the read/create workspace release.
  if (process.env.STRELVA_BACKGROUND_WORK_RELEASE !== "1") {
    await recordHeartbeat("workspace-work", { ok: systems.activations.failed === 0, processed: systems.activations.processed, failed: systems.activations.failed });
    return NextResponse.json({ status: "disabled", systems });
  }
  try {
    const result = await sweepDueWork(await listDueWork());
    const responsibilityMeter = await snapshotDueResponsibilityMeters(20).catch(() => ({ processed: 0, failed: 1, failures: [] }));
    await recordHeartbeat("workspace-work", { ok: result.failed === 0 && systems.activations.failed === 0 && responsibilityMeter.failed === 0, processed: result.processed + systems.activations.processed, failed: result.failed + systems.activations.failed + responsibilityMeter.failed });
    return NextResponse.json({ ...result, systems, responsibilityMeter });
  } catch {
    await recordHeartbeat("workspace-work", { ok: false, failed: 1 });
    return NextResponse.json({ error: "The work sweep could not be completed.", systems }, { status: 503 });
  }
}
