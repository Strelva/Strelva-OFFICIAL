import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { exportWorkspaceIdSchema, readOwnerExportHistory } from "@/platform/workspace-exports/owner-access";
import { WorkspaceExportV3Error } from "@/platform/workspace-exports/v3";
import { workspaceHttpActor, workspaceJson } from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled() || process.env.STRELVA_EXPORT_SCHEMA_3 !== "1") return workspaceJson({ error: "Not available." }, 503);
  const actor = await workspaceHttpActor();
  if (!actor) return workspaceJson({ error: "Sign in as the confirmed business owner." }, 401);
  const id = exportWorkspaceIdSchema.safeParse(new URL(request.url).searchParams.get("workspaceId"));
  if (!id.success) return workspaceJson({ error: "This workspace is unavailable." }, 404);
  try { return workspaceJson({ exports: await readOwnerExportHistory(actor, id.data) }); }
  catch (error) {
    if (error instanceof WorkspaceExportV3Error && error.code === "denied") return workspaceJson({ error: "Exports are unavailable to this owner." }, 403);
    return workspaceJson({ error: "Export history could not be read. Try again." }, 503);
  }
}
