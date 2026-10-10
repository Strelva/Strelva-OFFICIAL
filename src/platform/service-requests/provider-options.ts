import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { ServiceRequestAccessError, ServiceRequestConflictError, ServiceRequestStoreError, ServiceRequestValidationError, type ServiceRequestActor } from "./types";

type ProviderIdentityReadArgs = { p_user_id: string; p_verified_email: string; p_business_id: string };
interface ProviderIdentityReadPort {
  rpc(name: "read_service_request_providers" | "read_business_provider_identity", args: ProviderIdentityReadArgs): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

const optionsSchema = z.array(z.object({ agencyWorkspaceId: z.string().uuid(), name: z.string().min(1), providerOfRecord: z.boolean() }).strict());
export async function readServiceRequestProviders(actor: ServiceRequestActor, businessId: string) {
  if (!z.string().uuid().safeParse(businessId).success) throw new ServiceRequestValidationError("Choose a valid business workspace.");
  const db = getSupabase();
  if (!db) throw new ServiceRequestStoreError();
  const { data, error } = await (db as unknown as ProviderIdentityReadPort).rpc("read_service_request_providers", { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_business_id: businessId });
  if (error) {
    if (error.message.includes("service_request_access_denied")) throw new ServiceRequestAccessError();
    throw new ServiceRequestStoreError();
  }
  const parsed = optionsSchema.safeParse(data);
  if (!parsed.success) throw new ServiceRequestStoreError();
  return parsed.data;
}

/** Identity presentation only; no provider serving authority follows from it. */
export async function readBusinessProviderIdentity(actor: ServiceRequestActor, businessId: string) {
  const db = getSupabase();
  if (!db) throw new ServiceRequestStoreError();
  const { data, error } = await (db as unknown as ProviderIdentityReadPort).rpc("read_business_provider_identity", { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_business_id: businessId });
  if (error) throw new ServiceRequestStoreError();
  const parsed = z.object({ agencyWorkspaceId: z.string().uuid(), name: z.string().min(1) }).strict().nullable().safeParse(data);
  if (!parsed.success) throw new ServiceRequestStoreError();
  return parsed.data;
}

/** Choose only an unambiguous current owner-granted agency seat. The write RPC
 * rechecks that seat; identity presentation alone never grants serving access. */
export function siteChangeProviderFromOptions(options: Awaited<ReturnType<typeof readServiceRequestProviders>>) {
  const ofRecord = options.filter(option => option.providerOfRecord);
  const qualified = ofRecord.length ? ofRecord : options;
  if (qualified.length !== 1) throw new ServiceRequestConflictError(qualified.length ? "Choose one agency for this website Request before continuing." : "No agency has an active provider seat for this business.");
  const selected = qualified[0];
  if (!selected) throw new ServiceRequestConflictError("No agency has an active provider seat for this business.");
  return { kind: "agency" as const, agencyWorkspaceId: selected.agencyWorkspaceId };
}
export async function readSiteChangeProvider(actor: ServiceRequestActor, businessId: string) {
  return siteChangeProviderFromOptions(await readServiceRequestProviders(actor, businessId));
}
