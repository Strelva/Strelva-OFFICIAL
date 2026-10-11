import { workspaceJson } from "@/platform/workspaces/http";
import { prepareWebsiteDomainRequest, readWebsiteDomainRequest, readWebsiteRebuild } from "@/products/websites/index";
import { rebuildHttp } from "../../../rebuild-http";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ workId: string }> };
export const POST = (request: Request, context: Context) => rebuildHttp(request, context.params, true, async (actor, workId, raw) => {
  // rebuildHttp has already checked the work's workspace and release row.
  const { readWebsiteRebuild } = await import("@/products/websites/index");
  const record = await readWebsiteRebuild(actor, workId);
  return workspaceJson(await prepareWebsiteDomainRequest(actor, workId, { ...(raw && typeof raw === "object" ? raw : {}), workspaceId: record.workspaceId }));
});

/** Exact retained request observation only; never repeats provider preparation. */
export const GET = (request: Request, context: Context) => rebuildHttp(request, context.params, false, async (actor, workId) => {
  const record = await readWebsiteRebuild(actor, workId);
  const saved = await readWebsiteDomainRequest(actor, workId, { workspaceId: record.workspaceId, requestId: new URL(request.url).searchParams.get("requestId") });
  return workspaceJson({ request: saved });
});
