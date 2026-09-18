import { postgresWorkAuthority } from "@/platform/work-context/repository";
import { inspectWorkParticipation, readContributionTarget, changeWorkParticipation } from "@/platform/work-participation";
import { postgresAgentAccessStore } from "./repository";
import { createAgentAccessService } from "./service";

const service = createAgentAccessService({ authority: postgresWorkAuthority, participation: { inspect: inspectWorkParticipation, readTarget: readContributionTarget, change: changeWorkParticipation }, store: postgresAgentAccessStore });
export const manageAgentAccess = service.manage;
export const listAgentAccess = service.list;
export const readWithAgentAccess = service.read;
export const proposeWithAgentAccess = service.propose;
export { agentAccessCommandSchema, agentAccessScopeSchema, agentProposalSchema } from "./types";
export { createAgentAccessService, hashAgentAccessToken } from "./service";
export type { AgentAccessRecord, AgentAccessScope, AgentAccessStore } from "./types";
