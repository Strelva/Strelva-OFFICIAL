import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { proposeWithAgentAccess, readWithAgentAccess } from "@/platform/agent-access";
import { agentAccessFailure, bearerToken, boundedJson, privateJson } from "@/platform/agent-access/http";
import { z } from "zod";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ workId: string }> };
export async function GET(request: Request, context: Context) {
  if (!workspaceReleaseEnabled()) return privateJson({ error: "Workspaces are not enabled." }, 503);
  try {
    const workId = z.string().uuid().parse((await context.params).workId);
    return privateJson(await readWithAgentAccess(bearerToken(request), workId));
  } catch (error) { return agentAccessFailure(error); }
}
export async function POST(request: Request, context: Context) {
  if (!workspaceReleaseEnabled()) return privateJson({ error: "Workspaces are not enabled." }, 503);
  try {
    const workId = z.string().uuid().parse((await context.params).workId);
    return privateJson(await proposeWithAgentAccess(bearerToken(request), workId, await boundedJson(request)));
  } catch (error) { return agentAccessFailure(error); }
}
