import { workspaceJson } from "@/platform/workspaces/http";
import { publishWebsiteRebuildOntoLinkedSite } from "@/products/websites/index";
import { rebuildHttp } from "../../rebuild-http";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
/** Publish an approved rebuild onto a site this business already runs. Owner only (SQL decides). */
export const POST = (request: Request,context: { params: Promise<{ workId: string }> }) => rebuildHttp(request,context.params,true,async(actor,id,input) => workspaceJson(await publishWebsiteRebuildOntoLinkedSite(actor,id,input)));
