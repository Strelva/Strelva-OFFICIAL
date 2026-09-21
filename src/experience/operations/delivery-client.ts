import { z } from "zod";
import { serviceRequestSchema } from "@/platform/service-requests/types";
import { deliveryCommitmentCommandSchema } from "@/platform/service-requests/delivery-commitment";

export const deliveryInspectionSchema = z.object({
  actorId: z.string().uuid(),
  request: serviceRequestSchema,
  permissions: z.object({
    canManage: z.boolean(), canOperate: z.boolean(), stopped: z.boolean(),
    websiteBindings: z.array(z.object({ id: z.string().uuid(), name: z.string().nullable(), tenantId: z.string() })),
  }),
});
export type DeliveryInspection = z.infer<typeof deliveryInspectionSchema>;
export type DeliveryChange = z.infer<typeof deliveryCommitmentCommandSchema>["change"];
export type DeliveryCommand = z.infer<typeof deliveryCommitmentCommandSchema>;

export function deliveryActions(value: DeliveryInspection): readonly DeliveryChange["kind"][] {
  const { request, permissions } = value;
  const commitment = request.deliveryCommitment;
  if (request.status !== "requested" || request.providerAcceptance.status !== "accepted") return [];
  const status = commitment?.status;
  if (status === "accepted" || status === "cancelled") return [];
  const actions: DeliveryChange["kind"][] = [];
  if (!permissions.stopped) {
    if (permissions.canOperate) {
      if (!commitment || status === "proposed") actions.push("propose");
      if (status === "running" || status === "changes_requested") {
        actions.push("blocker");
        if (permissions.websiteBindings.length) actions.push("submit");
      }
    }
    if (permissions.canManage && status === "proposed") actions.push("agree");
    if (permissions.canManage && status === "submitted") actions.push("accept_result", "request_changes");
  }
  if (permissions.canManage && commitment) actions.push("cancel");
  return actions;
}

export function deliveryCommandKey(actorId: string, requestId: string): string {
  return `strelva:delivery-command:${actorId}:${requestId}`;
}
export function retainedDeliveryCommand(value: string | null, requestId: string): DeliveryCommand | null {
  if (!value || value.length > 20000) return null;
  try {
    const parsed = deliveryCommitmentCommandSchema.safeParse(JSON.parse(value));
    return parsed.success && parsed.data.requestId === requestId ? parsed.data : null;
  } catch { return null; }
}
