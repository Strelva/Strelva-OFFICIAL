import { workspaceJson } from "@/platform/workspaces/http";
import { websiteRebuildDomain } from "@/products/websites/index";
import { rebuildHttp } from "../../rebuild-http";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ workId: string }> };
export const GET = (request: Request,context: Context) => rebuildHttp(request,context.params,false,async(actor,id) => workspaceJson(await websiteRebuildDomain(actor,id)));
export const POST = (request: Request,context: Context) => rebuildHttp(request,context.params,true,async(actor,id,input) => workspaceJson(await websiteRebuildDomain(actor,id,input)));
