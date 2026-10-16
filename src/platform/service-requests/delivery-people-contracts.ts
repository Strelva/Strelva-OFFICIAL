import { z } from "zod";

/** Names on a delivery, as the delivery API returns them (see delivery-people.ts). Browser-safe. */
export const deliveryPeopleSchema = z.object({
  askedBy: z.string().min(1).max(160).nullable(),
  operator: z.string().min(1).max(160).nullable(),
  agency: z.string().min(1).max(160).nullable(),
  viewerIsAgencyOperator: z.boolean(),
}).strict();
export type DeliveryPeople = z.infer<typeof deliveryPeopleSchema>;

