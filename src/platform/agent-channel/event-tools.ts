/** Platform-owned port for coding agents reading what happened at a business. The
 * Events module supplies the operation at the HTTP composition boundary; this layer
 * retains the bearer and current-authority checks, like site-change-tools.ts. */
export const AGENT_EVENT_TOOLS = ["list_recent_events"] as const;
export type AgentEventToolName = (typeof AGENT_EVENT_TOOLS)[number];
export function isAgentEventToolName(name: string): name is AgentEventToolName {
  return AGENT_EVENT_TOOLS.some((tool) => tool === name);
}
export interface AgentEventAuthority {
  tokenHash: string; resource: string; workspaceId: string; agencyId: string | null;
}
export interface AgentEventsPort {
  list(args: { after?: number; types?: string[]; limit?: number }, authority: AgentEventAuthority): Promise<unknown>;
}
