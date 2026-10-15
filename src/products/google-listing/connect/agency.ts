import type { WorkspaceActor } from "@/platform/workspaces/types";
import { WorkspaceConflictError } from "@/platform/workspaces/types";
import { readProviderAccess } from "@/platform/connections/access";
import { assertGoogleConnectionEligible } from "../connection-policy";
import { googleOwnerConnectEnabled } from "./flags";
import { bindingEncryptionReady, googleBindingsEnabled } from "@/platform/account-bindings/store";
import { publishingEnabledForWorkspace } from "@/products/publishing/server";
export const AGENCY_GOOGLE_CHOICES_COOKIE = "strelva_agency_google_choices";
export const AGENCY_DISCOVER_CALLBACK = "/api/oauth/google/agency/callback";
/** Deliberate agency action in the client's context. No owner contact or grant. */
export async function admitAgencyGoogleConnect(actor: WorkspaceActor, workspaceId: string): Promise<string> {
  await assertGoogleConnectionEligible(actor, workspaceId);
  const access = readProviderAccess("google_business_profile");
  if (access.through.kind !== "agency" || !googleOwnerConnectEnabled() || !googleBindingsEnabled() || !bindingEncryptionReady() || !(await publishingEnabledForWorkspace(workspaceId, actor))) throw new WorkspaceConflictError("Google Business Profile is coming soon.");
  return access.through.workspaceId;
}
