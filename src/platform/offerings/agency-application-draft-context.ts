import { resolveOwnerBrand } from "@/platform/agency-brand/server";
import { personActor } from "@/platform/presentation/actor-server";
import { actorPresentation } from "@/platform/presentation/actor";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { createAgencyApplicationDraftAccessService } from "./agency-draft-access";

/**
 * Who an internal tool draft is for and who is preparing it, for the agency's
 * shell and sentences: the client's name, the owner who opened the draft, the
 * agency's brand name and the signed-in person. Every read is identity
 * checked; a part that can't be read stays null and the page says less, never
 * "Strelva" in an agency's place.
 */
export interface AgencyApplicationDraftContext {
  businessWorkspaceId: string;
  businessName: string;
  agencyWorkspaceId: string;
  agencyName: string;
  personName: string | null;
  ownerName: string | null;
  applicationTitle: string;
}

export async function readAgencyApplicationDraftContext(actor: WorkspaceActor, workId: string, service = createAgencyApplicationDraftAccessService()): Promise<AgencyApplicationDraftContext | null> {
  const grant = await service.read(actor, workId);
  if (!grant) return null;
  const [works, brand, person, owner] = await Promise.all([
    service.list(actor, grant.agencyWorkspaceId),
    resolveOwnerBrand(grant.agencyWorkspaceId),
    personActor(actor.userId),
    personActor(grant.grantedBy),
  ]);
  const work = works.find(item => item.applicationWorkId === workId);
  if (!work || brand.agencyId !== grant.agencyWorkspaceId) return null;
  return {
    businessWorkspaceId: work.customerWorkspaceId, businessName: work.customerWorkspaceName,
    agencyWorkspaceId: grant.agencyWorkspaceId, agencyName: brand.name,
    personName: actorPresentation(person).name, ownerName: actorPresentation(owner).name,
    applicationTitle: work.applicationTitle,
  };
}
