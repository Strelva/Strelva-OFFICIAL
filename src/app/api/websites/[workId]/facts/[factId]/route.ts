import { z } from "zod";
import { workspaceJson } from "@/platform/workspaces/http";
import { resolveWebsiteRebuildFact } from "@/products/websites/index";
import { rebuildHttp } from "../../../rebuild-http";
export const POST = (request: Request,context: { params: Promise<{ workId: string; factId: string }> }) => rebuildHttp(request,context.params,true,async(actor,id,input) => workspaceJson(await resolveWebsiteRebuildFact(actor,id,z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,119}$/).parse((await context.params).factId),input)));
