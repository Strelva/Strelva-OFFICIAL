import { readProviderAccess } from "@/platform/connections/access";
import { assertGoogleConnectionEligible } from "../connection-policy";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { WorkspaceConflictError } from "@/platform/workspaces/types";
import { reconnectAppOrigin, reconnectTargetSchema, reconnectUrl } from "@/products/publishing/server";
import { googleOwnerConnectEnabled } from "./flags";
import { readAgencyGoogleConnectLink } from "./store";

/** Through an agency's access, connect its own account in this client's context.
 * Through platform access, retain the owner link. Neither path contacts anyone. */
export type AgencyConnectLink =
  | { kind: "first_connect" | "reconnect" | "agency_connect"; link: string; message: string }
  | { kind: "connected" | "owner_unknown"; message: string };

export async function agencyGoogleConnectLink(actor: WorkspaceActor, businessId: string, deps = { read: readAgencyGoogleConnectLink }): Promise<AgencyConnectLink> {
  if (!googleOwnerConnectEnabled()) throw new WorkspaceConflictError("Connect links aren't open yet.");
  await assertGoogleConnectionEligible(actor, businessId);
  const access = readProviderAccess("google_business_profile");
  if (access.through.kind === "agency") return {kind:"agency_connect", link:`${reconnectAppOrigin()}/api/oauth/google/agency?${new URLSearchParams({workspaceId:businessId})}`, message:"Connect your agency's own Google account for this business. No message is sent to the owner."};
  const result = await deps.read(actor, businessId);
  if (result.kind === "connected") return { kind: "connected", message: "Google is already connected for this business. Nothing to send." };
  if (result.kind === "owner_unknown") return { kind: "owner_unknown", message: "This business has no owner address on record yet, so a reconnect link can't be made. Ask the owner to sign in and reconnect Google from their workspace." };
  if (result.kind === "reconnect") {
    const link = reconnectUrl(reconnectTargetSchema.parse(result.target));
    return { kind: "reconnect", link, message: `Google disconnected for your business. Reconnect it here: ${link} It opens a page that asks before anything happens; sign in with the Google account that runs your Business Profile. Your drafts stay saved and nothing is posted.` };
  }
  const link = `${reconnectAppOrigin()}/workspace/google?${new URLSearchParams({ workspaceId: businessId, connect: "start" })}`;
  return { kind: "first_connect", link, message: `Connect your Google listing to Strelva: ${link} Sign in to Strelva, then with the Google account that runs your Business Profile. Strelva reads your listing; nothing changes on Google until you approve it.` };
}
