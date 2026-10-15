import { z } from "zod";
import type { AgentEventsPort } from "@/platform/agent-channel/event-tools";
import { APP_EVENT_TYPES, appEventAgentReadSchema } from "./contracts";

const argsSchema = z.object({
  after: z.number().int().min(0).optional(),
  types: z.array(z.enum(APP_EVENT_TYPES)).max(10).optional(),
  limit: z.number().int().min(1).max(100).default(50),
}).strict();

/**
 * list_recent_events for a coding agent: events after a sequence, in order. The database
 * decides what this token may see (an agency's token only sees areas it holds).
 */
export function createAgentEventsAdapter(deps: {
  rpc: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  released: (workspaceId: string) => Promise<boolean>;
}): AgentEventsPort {
  return {
    async list(rawArgs, authority) {
      if (!(await deps.released(authority.workspaceId))) throw new Error("app_events_off");
      const args = argsSchema.parse(rawArgs);
      const data = await deps.rpc("agent_read_app_events", {
        p_token_hash: authority.tokenHash, p_resource: authority.resource, p_workspace_id: authority.workspaceId,
        p_after: args.after ?? 0, p_types: args.types ?? null, p_limit: args.limit,
      });
      return appEventAgentReadSchema.parse(data);
    },
  };
}
