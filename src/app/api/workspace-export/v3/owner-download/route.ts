import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { exportBuildIdSchema, readOwnerExportBody } from "@/platform/workspace-exports/owner-access";
import { workspaceHttpActor, workspaceJson } from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled() || process.env.STRELVA_EXPORT_SCHEMA_3 !== "1") return workspaceJson({ error: "Not available." }, 503);
  const actor = await workspaceHttpActor();
  if (!actor) return workspaceJson({ error: "Sign in as the confirmed business owner." }, 401);
  const id = exportBuildIdSchema.safeParse(new URL(request.url).searchParams.get("build"));
  if (!id.success) return workspaceJson({ error: "This export is unavailable." }, 404);
  try {
    const body = await readOwnerExportBody(actor, id.data);
    return new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="business-export-${id.data.slice(0, 8)}.json"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
  } catch { return workspaceJson({ error: "This export is unavailable to this owner." }, 404); }
}
