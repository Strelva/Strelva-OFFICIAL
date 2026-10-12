import type { WorkspaceActor } from "@/platform/workspaces/types";
import { WorkspaceConflictError } from "@/platform/workspaces/types";
import { reconnectAppOrigin, reconnectTargetSchema, reconnectUrl } from "@/products/publishing/server";
import { googleOwnerConnectEnabled } from "./flags";
import { readAgencyGoogleConnectLink } from "./store";

/**
 * "Send the owner a connect link": an agency that holds a business's Google
 * area copies a link and sends it itself. Strelva sends nothing. Google
 * consent is always the owner's:
 *  - first connect: the link opens the owner's own Connect Google, which needs
 *    the owner signed in and checks the Google account they choose;
 *  - a disconnected grant: the existing confirm-then-consent reconnect link
 *    (single use, 14 days, bound to the owner's recorded address).
 * SQL decides who may ask (agency_google_connect_link).
 */
export type AgencyConnectLink =
  | { kind: "first_connect" | "reconnect"; link: string; message: string }
  | { kind: "connected" | "owner_unknown"; message: string };

export async function agencyGoogleConnectLink(actor: WorkspaceActor, businessId: string, deps = { read: readAgencyGoogleConnectLink }): Promise<AgencyConnectLink> {
  if (!googleOwnerConnectEnabled()) throw new WorkspaceConflictError("Connect links aren't open yet.");
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
