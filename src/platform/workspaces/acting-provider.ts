/**
 * The acting agency (agency 1.0 #255; 20261014100000): who may do an outside
 * effect for a business as its agency. One SQL rule, the same for every
 * agency, Strelva's own included: an active provider seat, the person's
 * current agency membership and staff row, the agency's verification for the
 * effect (agency_effect_allowed), and the owner's mandate for the named
 * resource. Owners act as owners and never go through here.
 *
 * SQL gates raise acting_provider_not_staffed | _unverified | _no_mandate;
 * actingAgencyRefusal turns those into the words an agency sees. The app
 * calls assertActingAgency itself only before an outside call it makes
 * directly (a Google write); the database gates recheck on their own. The
 * email half lives with the one email path (infra/email/provider-gate.ts).
 */
import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceStoreError, type WorkspaceActor } from "./types";

export const ACTING_AGENCY_EFFECTS = ["publish", "google", "email", "payments"] as const;
export type ActingAgencyEffect = (typeof ACTING_AGENCY_EFFECTS)[number];

/** The resource a mandate names, per effect. */
export type ClientResource =
  | { effect: "publish"; kind: "website"; ref: string }
  | { effect: "publish"; kind: "domain"; ref: string }
  | { effect: "google"; kind: "google_location"; ref: string }
  | { effect: "email"; kind: "sender"; ref: string }
  | { effect: "payments"; kind: "payment_account"; ref: string };

const REFUSALS: Record<string, string> = {
  acting_provider_not_staffed: "You're not on this business for its agency.",
  acting_provider_unverified: "Your agency isn't verified for this yet. Nothing was changed.",
  acting_provider_no_mandate: "The owner hasn't given your agency permission for this yet. Nothing was changed.",
};

/** The agency-facing refusal for an acting-provider error, or null. */
export function actingAgencyRefusal(detail: string | null | undefined): string | null {
  const code = /acting_provider_(not_staffed|unverified|no_mandate)/.exec(detail ?? "")?.[0];
  return code ? REFUSALS[code]! : null;
}

type DbError = { message?: string; code?: string } | null;
export type ActingAgencyDb = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError }> };

function db(override?: ActingAgencyDb): ActingAgencyDb {
  if (override) return override;
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Agency authority is unavailable.");
  return client as unknown as ActingAgencyDb;
}

/**
 * Throws WorkspaceAccessError unless this person is the business's acting
 * agency for the effect and resource. Returns the agency workspace id.
 * Call it at the moment of the effect, not once per session.
 */
export async function assertActingAgency(actor: WorkspaceActor, workspaceId: string, resource: ClientResource, client?: ActingAgencyDb): Promise<string> {
  const { data, error } = await db(client).rpc("assert_acting_provider", {
    p_workspace_id: z.string().uuid().parse(workspaceId),
    p_user_id: z.string().uuid().parse(actor.userId),
    p_verified_email: actor.verifiedEmail,
    p_effect: resource.effect,
    p_resource_kind: resource.kind,
    p_resource_ref: resource.ref,
  });
  if (error) {
    const refusal = actingAgencyRefusal(`${error.code ?? ""} ${error.message ?? ""}`);
    if (refusal) throw new WorkspaceAccessError(refusal);
    throw new WorkspaceStoreError("Agency authority could not be confirmed.");
  }
  const agency = z.string().uuid().safeParse(Array.isArray(data) ? data[0] : data);
  if (!agency.success) throw new WorkspaceStoreError("Agency authority could not be confirmed.");
  return agency.data;
}

/** @deprecated Use ACTING_AGENCY_EFFECTS. */
export const ACTING_PROVIDER_EFFECTS = ACTING_AGENCY_EFFECTS;
/** @deprecated Use ActingAgencyEffect. */
export type ActingProviderEffect = ActingAgencyEffect;
/** @deprecated Use ActingAgencyDb. */
export type ActingProviderDb = ActingAgencyDb;
/** @deprecated Use actingAgencyRefusal. */
export const actingProviderRefusal = actingAgencyRefusal;
/** @deprecated Use assertActingAgency. */
export const assertActingProvider = assertActingAgency;
