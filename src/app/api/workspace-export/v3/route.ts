import { after } from "next/server";
import { getSupabase } from "@/lib/db/client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { exportWorkspace } from "@/platform/workspace-exports/repository";
import { startWorkspaceExportV3, WorkspaceExportV3Error, type V3Rpc } from "@/platform/workspace-exports/v3";
import { deliverWorkspaceExportLink } from "@/platform/workspace-exports/v3-delivery";
import { alert } from "@/lib/monitoring";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Export schema 3. Off unless STRELVA_EXPORT_SCHEMA_3=1. The owner gets a
 *  small export inline; larger exports, and every export the Strelva operator
 *  starts for an owner, are built in the background and the link is emailed
 *  to the owner recipient only. */
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled() || process.env.STRELVA_EXPORT_SCHEMA_3 !== "1") {
    return workspaceJson({ error: "Workspace export is not available." }, 503);
  }
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  const actor = await workspaceHttpActor();
  if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to export this business." }, 401);
  const client = getSupabase() as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }> } | null;
  if (!client) return workspaceJson({ error: "Workspace export is unavailable." }, 503);
  const rpc: V3Rpc = (name, args) => client.rpc(name, args);
  try {
    const body = await readWorkspaceBody(request, 1_000) as { workspaceId?: unknown };
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
    const baseUrl = new URL(request.url).origin;
    const outcome = await startWorkspaceExportV3(actor, workspaceId, {
      rpc,
      snapshot: exportWorkspace,
      schedule: (task) => after(task),
      deliver: async (input) => { await deliverWorkspaceExportLink({ ...input, baseUrl }); },
      onFailure: ({ buildId, reason }) => { alert("workspace_export_build_failed", "high", { buildId, workspaceId, reason }); },
    });
    if (outcome.kind === "build") {
      return workspaceJson({ status: "building", buildId: outcome.buildId, deliverTo: outcome.deliverTo,
        message: "Your export is being prepared. A download link will be emailed when it's ready." }, 202);
    }
    return new Response(outcome.body, { status: 200, headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="business-export-${workspaceId.slice(0, 8)}.json"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    } });
  } catch (error) {
    if (error instanceof WorkspaceExportV3Error) {
      const status = error.code === "denied" ? 403 : error.code === "in_progress" ? 409 : error.code === "invalid" || error.code === "no_owner_recipient" ? 400 : 503;
      return workspaceJson({ error: error.message }, status);
    }
    return workspaceHttpFailure(error);
  }
}
