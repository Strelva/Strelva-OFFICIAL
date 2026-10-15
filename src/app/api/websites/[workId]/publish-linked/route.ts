import { workspaceJson } from "@/platform/workspaces/http";
import { publishWebsite } from "@/products/websites/server";
import { rebuildHttp } from "../../rebuild-http";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
/** Publish an approved rebuild onto a site this business already runs. Owner only (SQL decides). */
export const POST = (request: Request,context: { params: Promise<{ workId: string }> }) => rebuildHttp(request,context.params,true,async(actor,id,input) => workspaceJson((await publishWebsite({ via: "site_document", actor, workId: id, input })).detail));
