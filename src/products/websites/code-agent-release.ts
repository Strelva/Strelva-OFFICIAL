import { oauthEnabled } from "@/platform/agent-channel/oauth";
import { sitesByCodeReleased } from "./sites-by-code-release";

/** The coding-agent deploy path is on only with the MCP sign-in and the business's sites_by_code row. The page and the route both ask this, so they never disagree. */
export async function codeAgentReleased(workspaceId: string, userId: string): Promise<boolean> {
  return oauthEnabled() && sitesByCodeReleased(workspaceId, { operator: false, tester: false, userId });
}
