import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import type { ServiceRequestActor, ServiceRequest } from "./types";
const namesSchema = z.array(z.object({ requestId: z.string().uuid(), displayName: z.string().min(1).max(120).nullable() }).strict());
type Db = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
/** Rechecks each Request before projecting only its serving agency's display name. */
export async function servingAgencyNames(actor: ServiceRequestActor, requests: readonly ServiceRequest[], db: Db | null = getSupabase() as unknown as Db | null) {
  const missing = requests.map(request => ({ requestId: request.id, displayName: null as string | null }));
  if (!db || !requests.length) return missing;
  try {
    const { data, error } = await db.rpc("read_service_request_agency_names", { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_request_ids: requests.map(request => request.id) });
    const parsed = namesSchema.safeParse(data);
    if (error || !parsed.success) return missing;
    const allowed = new Set(requests.map(request => request.id));
    if (parsed.data.some(item => !allowed.has(item.requestId))) return missing;
    const names = new Map(parsed.data.map(item => [item.requestId, item.displayName]));
    return missing.map(item => ({ ...item, displayName: names.get(item.requestId) ?? null }));
  } catch { return missing; }
}
