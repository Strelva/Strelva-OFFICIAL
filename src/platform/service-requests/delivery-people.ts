import type { DeliveryPeople } from "./delivery-people-contracts";
import { resolveOwnerBrand } from "@/platform/agency-brand/server";
import { actorPresentation } from "@/platform/presentation/actor";
import { personActor } from "@/platform/presentation/actor-server";
import { readVersionActor } from "@/platform/system-versions/supabase-store";
import type { ServiceRequest, ServiceRequestActor } from "./types";

/**
 * Who is who on a delivery, for the words on screen: the person who asked,
 * the person at the agency doing the work, the agency by its brand name, and
 * whether the viewer is a member of that agency (only they see repositories
 * and commits). Each part is read on its own and is null when it can't be
 * confirmed; nothing here grants or decides authority.
 */
export { deliveryPeopleSchema, type DeliveryPeople } from "./delivery-people-contracts";

export interface DeliveryPeopleDeps {
  personName(userId: string): Promise<string | null>;
  agencyName(agencyWorkspaceId: string): Promise<string | null>;
  agencyMember(actor: ServiceRequestActor, agencyWorkspaceId: string): Promise<boolean>;
}

const defaults: DeliveryPeopleDeps = {
  personName: async userId => actorPresentation(await personActor(userId)).name,
  agencyName: async agencyWorkspaceId => {
    const brand = await resolveOwnerBrand(agencyWorkspaceId);
    return brand.agencyId === agencyWorkspaceId ? brand.name : null;
  },
  // A seat on the business ("provider_seat") is not membership of the agency itself.
  agencyMember: async (actor, agencyWorkspaceId) => {
    const scope = await readVersionActor(actor);
    return scope.userId === actor.userId && scope.memberships.some(row => row.businessId === agencyWorkspaceId && row.via !== "provider_seat");
  },
};

export async function readDeliveryPeople(actor: ServiceRequestActor, request: ServiceRequest, deps: DeliveryPeopleDeps = defaults): Promise<DeliveryPeople> {
  const agencyId = request.provider?.kind === "agency" ? request.provider.agencyWorkspaceId : null;
  const operatorId = request.deliveryCommitment?.operatorId ?? null;
  const safe = <T,>(work: Promise<T>, fallback: T) => work.catch(() => fallback);
  const [askedBy, operator, agency, viewerIsAgencyOperator] = await Promise.all([
    request.createdBy ? safe(deps.personName(request.createdBy), null) : Promise.resolve(null),
    operatorId ? safe(deps.personName(operatorId), null) : Promise.resolve(null),
    agencyId ? safe(deps.agencyName(agencyId), null) : Promise.resolve(null),
    agencyId ? safe(deps.agencyMember(actor, agencyId), false) : Promise.resolve(false),
  ]);
  return { askedBy, operator, agency, viewerIsAgencyOperator };
}

/** The asking person's name for each Request in a list, read once per person. */
export async function readAskedByNames(requests: readonly ServiceRequest[], deps: Pick<DeliveryPeopleDeps, "personName"> = defaults): Promise<Record<string, string>> {
  const ids = [...new Set(requests.map(item => item.createdBy))].slice(0, 50);
  const names = new Map(await Promise.all(ids.map(async id => [id, await deps.personName(id).catch(() => null)] as const)));
  return Object.fromEntries(requests.flatMap(item => { const name = names.get(item.createdBy); return name ? [[item.id, name]] : []; }));
}
