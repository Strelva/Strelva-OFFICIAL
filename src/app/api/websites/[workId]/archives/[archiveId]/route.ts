import { z } from "zod";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson } from "@/platform/workspaces/http";
import { legacyArchiveStore, legacyArchiveExportFiles, createWebsiteArchive } from "@/products/websites/index";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ workId: string; archiveId: string }> }) {
  const actor = await workspaceHttpActor();
  if (!actor) return workspaceJson({ error: "Sign in to open this retained website." },401);
  try {
    const params = await context.params;
    const query = new URL(request.url).searchParams;
    const key = { workspaceId: z.string().uuid().parse(query.get("workspaceId")), workId: z.string().uuid().parse(params.workId) };
    const archive = await legacyArchiveStore.read(actor,key,params.archiveId);
    if (query.get("download") === "1") {
      const bytes = createWebsiteArchive(legacyArchiveExportFiles(archive));
      return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/x-tar", "Content-Disposition": `attachment; filename="website-legacy-${archive.archiveId}.tar"`, "Cache-Control": "private, no-store" } });
    }
    return workspaceJson({ archive });
  } catch (error) { return workspaceHttpFailure(error); }
}
