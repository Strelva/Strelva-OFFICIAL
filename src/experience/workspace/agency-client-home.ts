import { recordedActorSchema } from "@/platform/presentation/actor";
import { z } from "zod";
import { serviceRequestAgencySchema } from "@/platform/service-requests/types";
import type { BusinessDeliveryItem } from "./business-delivery-summary";

export const agencyClientHomeSchema = z.object({
  workspaceId: z.string().uuid(),
  decisions: z.array(z.object({ id: z.string().uuid(), title: z.string(), systemId: z.string().uuid().nullable(), since: z.string(), state: z.enum(["open", "approved", "declined", "expired", "withdrawn", "superseded"]) }).strict()),
  changes: z.array(z.object({ id: z.string().uuid(), systemId: z.string().uuid(), title: z.string(), at: z.string(), actor: recordedActorSchema.nullable().optional().catch(null) }).strict()),
  deliveryChecks: z.array(z.object({ key: z.string().regex(/^(listing|outside|website|site):[0-9a-f-]{36}$/), title: z.string(), systemId: z.string().uuid().nullable(), status: z.enum(["failed", "differs", "not_confirmed", "not_checked"]), at: z.string() }).strict()),
  deliveries: z.array(z.object({ id: z.string().uuid(), title: z.string(), stage: z.enum(["asked", "needs_you", "in_progress", "ready_for_review", "done", "closed"]), provider: serviceRequestAgencySchema, servingAgencyName: z.string().nullable(), dueAt: z.string().nullable(), updatedAt: z.string() }).strict()),
}).strict();
export type AgencyClientHome = z.infer<typeof agencyClientHomeSchema>;
export function agencyClientDeliveries(projection: AgencyClientHome): BusinessDeliveryItem[] {
  return projection.deliveries.map(item => ({ ...item, href: `/workspace/delivery/${item.id}`, detail: "", attention: item.stage === "needs_you" || item.stage === "ready_for_review", handling: item.stage === "in_progress" }));
}
