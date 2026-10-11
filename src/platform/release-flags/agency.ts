import { z } from "zod";
import { WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { callReleaseFlagsRpc, clearReleaseFlagCache, ReleaseFlagValidationError } from "./store";
import { isReleaseFlag, releaseFlagEnvMode, workspaceReleaseOn, RELEASE_FLAG_LABELS } from "./resolve";

import { agencyFlagCommandSchema, agencyFlagScopeSchema, operatorCeilingCommandSchema, agencyFlagsSchema, type AgencyFlags } from "./agency-contracts";
export { agencyFlagCommandSchema, agencyFlagScopeSchema, operatorCeilingCommandSchema } from "./agency-contracts";
export function agencyFlagView(value: AgencyFlags, scope: { workspaceId: string; agencyWorkspaceId: string }) {
  if (value.workspaceId !== scope.workspaceId || value.agencyWorkspaceId !== scope.agencyWorkspaceId) throw new WorkspaceStoreError("Availability came back for a different business. Nothing was confirmed.");
  return { ...value, flags: value.flags.map(row => ({ ...row, label: RELEASE_FLAG_LABELS[row.flag], environment: releaseFlagEnvMode(row.flag), workspaceReleased: workspaceReleaseOn() })) };
}
export async function readAgencyReleaseFlags(actor: WorkspaceActor, input: z.infer<typeof agencyFlagScopeSchema>) {
  return agencyFlagView(await callReleaseFlagsRpc("read_agency_release_flags", { p_agency_id: input.agencyWorkspaceId, p_workspace_id: input.workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail }, agencyFlagsSchema, "Client availability could not be read."), input);
}
export async function setAgencyReleaseFlag(actor: WorkspaceActor, input: z.infer<typeof agencyFlagCommandSchema>) {
  if (!isReleaseFlag(input.flag) || !workspaceReleaseOn() || releaseFlagEnvMode(input.flag) === "off") throw new ReleaseFlagValidationError("agency_release_flag_paused", "This capability is paused by the platform. Nothing changed.");
  const value = await callReleaseFlagsRpc("set_agency_workspace_release_flag", { p_agency_id: input.agencyWorkspaceId, p_workspace_id: input.workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_flag: input.flag, p_state: input.state, p_expected_revision: input.expectedRevision, p_ceiling_revision: input.ceilingRevision, p_reason: input.reason }, agencyFlagsSchema, "Client availability could not be changed.");
  clearReleaseFlagCache(input.workspaceId);
  return agencyFlagView(value, input);
}
export async function setAgencyReleaseFlagCeiling(actor: WorkspaceActor, input: z.infer<typeof operatorCeilingCommandSchema>) {
  const value = await callReleaseFlagsRpc("set_agency_release_flag_ceiling", { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_workspace_id: input.workspaceId, p_flag: input.flag, p_agency_id: input.agencyWorkspaceId, p_system_id: input.systemId, p_verification_effect: input.verificationEffect, p_max_state: input.maxState, p_expected_revision: input.expectedRevision, p_reason: input.reason }, agencyFlagsSchema, "The agency permission could not be changed.");
  clearReleaseFlagCache(input.workspaceId);
  return agencyFlagView(value, input);
}

export async function readOperatorAgencyReleaseFlags(actor: WorkspaceActor, agencyWorkspaceId: string, workspaceId: string) {
  const schema = agencyFlagsSchema.extend({ history: z.array(z.record(z.string(), z.unknown())) });
  const value = await callReleaseFlagsRpc("read_operator_agency_release_flags", { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_agency_id: agencyWorkspaceId, p_workspace_id: workspaceId }, schema, "Agency permissions could not be read.");
  return { ...agencyFlagView(value, { agencyWorkspaceId, workspaceId }), history: value.history };
}
