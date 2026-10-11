import { z } from "zod";
const uuid = z.string().uuid();
export const agencyWebsiteContextSchema = z.object({
  bindingId: uuid, businessWorkspaceId: uuid, businessName: z.string().min(1),
  agencyWorkspaceId: uuid, agencyName: z.string().min(1), operatorUserId: uuid, personName: z.string().min(1),
  websiteName: z.string().min(1), expiresAt: z.string(), deliveryId: uuid,
}).strict();
export type AgencyWebsiteContext = z.infer<typeof agencyWebsiteContextSchema>;
