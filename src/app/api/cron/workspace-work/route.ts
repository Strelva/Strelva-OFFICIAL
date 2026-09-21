import { NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { recordHeartbeat } from "@/lib/heartbeat";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { listDueWork, sweepDueWork } from "@/products/operations/server";
export const maxDuration = 60;
export async function GET(request: Request) {
  const denied = requireCronRequest(request); if (denied) return denied;
  // New standing work is opt-in independently of the read/create workspace release.
  if (!workspaceReleaseEnabled() || process.env.STRELVA_BACKGROUND_WORK_RELEASE !== "1") {
    await recordHeartbeat("workspace-work", { ok: true, processed: 0 });
    return NextResponse.json({ status: "disabled" });
  }
  try {
    const result = await sweepDueWork(await listDueWork());
    await recordHeartbeat("workspace-work", { ok: result.failed === 0, processed: result.processed, failed: result.failed });
    return NextResponse.json(result);
  } catch {
    await recordHeartbeat("workspace-work", { ok: false, failed: 1 });
    return NextResponse.json({ error: "The work sweep could not be completed." }, { status: 503 });
  }
}
