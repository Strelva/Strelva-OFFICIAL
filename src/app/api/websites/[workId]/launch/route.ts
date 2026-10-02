import { workspaceJson } from "@/platform/workspaces/http";
import { launchWebsiteRebuild } from "@/products/websites/index";
import { rebuildHttp } from "../../rebuild-http";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const POST = (request: Request,context: { params: Promise<{ workId: string }> }) => rebuildHttp(request,context.params,true,async(actor,id,input) => workspaceJson(await launchWebsiteRebuild(actor,id,input)));
