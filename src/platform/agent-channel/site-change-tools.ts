/** Platform-owned port for coding agents working website Requests. The website
 * product supplies the operations at the HTTP composition boundary; this layer
 * retains the bearer and current-authority checks, like website-tools.ts. */
export const AGENT_SITE_CHANGE_TOOLS = ["list_site_requests", "read_site_request", "report_site_preview", "report_site_deploy", "report_site_release"] as const;
export type AgentSiteChangeToolName = (typeof AGENT_SITE_CHANGE_TOOLS)[number];
export function isAgentSiteChangeToolName(name: string): name is AgentSiteChangeToolName {
  return AGENT_SITE_CHANGE_TOOLS.some(tool => tool === name);
}
export interface AgentSiteChangeAuthority {
  tokenHash: string; resource: string; workspaceId: string; userId: string; verifiedEmail: string; agencyId: string | null;
}
export interface AgentSiteChangePort {
  call(name: AgentSiteChangeToolName, args: Record<string, unknown>, authority: AgentSiteChangeAuthority): Promise<unknown>;
}
