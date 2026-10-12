import { requireCronRequest } from "@/lib/cron-auth";
import { recordHeartbeat } from "@/platform/infra/heartbeat";
import { exportRecoveryEnabled, runExportRecovery } from "@/platform/workspace-exports/recovery";
import { exportRecoveryDependencies } from "@/server/workspace-export-recovery";

export const maxDuration = 300;
export async function GET(request: Request) {
  const denied = requireCronRequest(request); if (denied) return denied;
  if (!exportRecoveryEnabled()) return Response.json({ enabled: false, processed: 0 });
  try {
    const result = await runExportRecovery(exportRecoveryDependencies(process.env.NEXT_PUBLIC_APP_URL || "https://app.strelva.com"));
    await recordHeartbeat("workspace-export-recovery", { ok: result.failed === 0, processed: result.processed, failed: result.failed });
    return Response.json(result);
  } catch {
    await recordHeartbeat("workspace-export-recovery", { ok: false, processed: 0, failed: 1 });
    return Response.json({ error: "Export recovery failed." }, { status: 503 });
  }
}
