/** Platform-owned port. The website product supplies validation and candidate operations
 * at the HTTP composition boundary; this layer retains bearer/current-authority checks. */
export const AGENT_WEBSITE_TOOLS = ["list_websites", "list_website_proposals", "read_website", "propose_website_change"] as const;
export type AgentWebsiteToolName = (typeof AGENT_WEBSITE_TOOLS)[number];
export function isAgentWebsiteToolName(name: string): name is AgentWebsiteToolName {
  return AGENT_WEBSITE_TOOLS.some(tool => tool === name);
}
export interface AgentWebsiteAuthority { tokenHash: string; resource: string; workspaceId: string; userId: string }
export type WebsiteToolRpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
export interface AgentWebsitePort {
  call(name: AgentWebsiteToolName, args: Record<string, unknown>, authority: AgentWebsiteAuthority): Promise<unknown>;
}
