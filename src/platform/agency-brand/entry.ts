/** Entry identity comes from a verified invitation/claim, never branding in a URL. */
import { inspectWorkspaceInvitation } from "@/platform/workspaces/invitations";
import { readOwnerClaim } from "@/products/agency-clients/server";
import { resolveOwnerBrand } from "./server";
import type { OwnerBrand } from "@/platform/infra/agency-brand";

export type InvitationEntryIdentity = { businessName: string; brand: OwnerBrand | string };
export async function invitationEntryIdentity(target: string | null): Promise<InvitationEntryIdentity | null> {
  const match = target?.match(/^\/workspace\/(invitations\/accept|claim)\/([A-Za-z0-9_-]{43})$/);
  if (!match) return null;
  try {
    if (match[1] === "claim") {
      const claim = await readOwnerClaim(match[2]!);
      return { businessName: claim.workspaceName, brand: claim.agencyName || "Agency identity unavailable" };
    }
    const invitation = await inspectWorkspaceInvitation(match[2]!);
    return { businessName: invitation.workspaceName, brand: await resolveOwnerBrand(invitation.workspaceId) };
  } catch { return null; }
}
