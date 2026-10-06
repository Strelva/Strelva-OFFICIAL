import { isSuperAdmin } from "@/platform/infra/auth";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { WorkspaceAccessError, type WorkspaceActor } from "@/platform/workspaces/types";
import { needsYouReleaseEnabled } from "@/platform/needs-you/release";
import {
  PostgresPolicySettingsStore,
  buildPolicyView,
  type NotToldRow,
  type PolicyBusiness,
  type PolicySettingsStore,
  type PolicyView,
} from "@/platform/needs-you/policy";

export type OperatorLoad<T> =
  | { state: "off" }
  | { state: "denied" }
  | { state: "unavailable"; message: string }
  | { state: "ready"; value: T };

export interface OperatorDeps {
  isSuperAdmin(): Promise<boolean>;
  actor(): Promise<WorkspaceActor | null>;
  released(): boolean;
  store: PolicySettingsStore;
}

const defaults: OperatorDeps = { isSuperAdmin, actor: workspaceHttpActor, released: () => needsYouReleaseEnabled(), store: PostgresPolicySettingsStore };

/** Super admin is rechecked here and again in SQL; the /admin layout gate is not relied on. */
async function asOperator<T>(deps: OperatorDeps, read: (actor: WorkspaceActor) => Promise<T>, unavailable: string): Promise<OperatorLoad<T>> {
  if (!deps.released()) return { state: "off" };
  if (!(await deps.isSuperAdmin())) return { state: "denied" };
  const actor = await deps.actor();
  if (!actor) return { state: "denied" };
  try {
    return { state: "ready", value: await read(actor) };
  } catch (error) {
    if (error instanceof WorkspaceAccessError) return { state: "denied" };
    return { state: "unavailable", message: unavailable };
  }
}

/** Owner decisions whose owner was never told: suppressed, bounced or never sent. */
export function loadOwnerNotTold(deps: OperatorDeps = defaults): Promise<OperatorLoad<NotToldRow[]>> {
  return asOperator(deps, actor => deps.store.notTold(actor, 200), "The owner-not-told list could not be read. Nothing is hidden: try again.");
}

export interface BusinessPolicy {
  businesses: PolicyBusiness[];
  selected: { id: string; name: string; view: PolicyView } | null;
}

/** Every business, and the policy of the one selected. */
export function loadBusinessPolicy(workspaceId: string | null, deps: OperatorDeps = defaults): Promise<OperatorLoad<BusinessPolicy>> {
  return asOperator(deps, async actor => {
    const businesses = await deps.store.businesses(actor);
    const chosen = workspaceId ? businesses.find(business => business.id === workspaceId) ?? null : null;
    if (!chosen) return { businesses, selected: null };
    return { businesses, selected: { id: chosen.id, name: chosen.name, view: buildPolicyView(await deps.store.read(actor, chosen.id)) } };
  }, "The policy could not be read. Nothing changed: try again.");
}
