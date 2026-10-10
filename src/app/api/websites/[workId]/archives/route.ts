import { z } from "zod";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson } from "@/platform/workspaces/http";
import { legacyArchiveStore } from "@/products/websites/index";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ workId: string }> }) {
  const actor = await workspaceHttpActor();
  if (!actor) return workspaceJson({ error: "Sign in to open retained website Versions." },401);
  try {
    const query = new URL(request.url).searchParams;
    const key = { workspaceId: z.string().uuid().parse(query.get("workspaceId")), workId: z.string().uuid().parse((await context.params).workId) };
    return workspaceJson(await legacyArchiveStore.list(actor,key,query.get("afterArchiveId") ?? undefined));
  } catch (error) { return workspaceHttpFailure(error); }
}
