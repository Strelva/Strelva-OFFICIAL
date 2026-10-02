import { workspaceJson } from "@/platform/workspaces/http";
import { readWebsiteRebuild, retryWebsiteRebuild } from "@/products/websites/index";
import { rebuildHttp } from "../../rebuild-http";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Context = { params: Promise<{ workId: string }> };
export const GET = (request: Request,context: Context) => rebuildHttp(request,context.params,false,async(actor,id) => workspaceJson(await readWebsiteRebuild(actor,id)));
export const POST = (request: Request,context: Context) => rebuildHttp(request,context.params,true,async(actor,id,input) => workspaceJson(await retryWebsiteRebuild(actor,id,input)));
