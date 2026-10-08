import {z} from "zod";
export const paymentRequestSchema=z.object({id:z.string().uuid(),workspaceId:z.string().uuid(),kind:z.enum(["quote","deposit"]),lines:z.array(z.object({name:z.string(),quantity:z.number(),unitCents:z.number()})),acceptedTerms:z.string().nullable().optional(),amountCents:z.number(),currency:z.string(),expiresAt:z.string(),paid:z.boolean(),status:z.enum(["paid","cancelled","expired","unpaid"])});
export type PaymentRequest=z.infer<typeof paymentRequestSchema>;
