import { getSessionUser } from "@/lib/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { listAgentAccess, manageAgentAccess } from "@/platform/agent-access";
import { agentAccessFailure, boundedJson, privateJson } from "@/platform/agent-access/http";
import { z } from "zod";

export const dynamic = "force-dynamic";
async function actor() {
  const user = await getSessionUser();
  return user?.email && user.email_confirmed_at ? { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() } : null;
}
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return privateJson({ error: "Workspaces are not enabled." }, 503);
  try {
    const current = await actor();
    if (!current) return privateJson({ error: "Sign in to manage integrations." }, 401);
    return privateJson(await listAgentAccess(current, z.string().uuid().parse(new URL(request.url).searchParams.get("workId"))));
  } catch (error) { return agentAccessFailure(error); }
}
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return privateJson({ error: "Workspaces are not enabled." }, 503);
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") return privateJson({ error: "Open Strelva directly to manage integrations." }, 403);
  try {
    const current = await actor();
    if (!current) return privateJson({ error: "Sign in to manage integrations." }, 401);
    return privateJson(await manageAgentAccess(current, await boundedJson(request)));
  } catch (error) { return agentAccessFailure(error); }
}
