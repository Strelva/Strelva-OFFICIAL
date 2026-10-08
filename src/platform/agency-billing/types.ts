import { z } from "zod";
export const agencyInvoiceSchema = z.object({
 id:z.string().uuid(),agency_workspace_id:z.string().uuid(),business_workspace_id:z.string().uuid(),kind:z.enum(["rebill","pay_link"]),amount_cents:z.number().int().positive(),currency:z.string(),description:z.string(),status:z.enum(["proposed","accepted","declined","revoked","awaiting_payment","active","paid","cancelled"]),
 can_accept:z.boolean().optional(),can_manage:z.boolean().optional(),accepted_email:z.string().email().nullable().optional(),provider_object_id:z.string().nullable(),provider_account_id:z.string().nullable(),checkout_url:z.string().url().nullable(),
 payment_receipt_state:z.enum(["unconfirmed","matched","review"]).optional(),provider_customer_id:z.string().nullable().optional(),provider_price_id:z.string().nullable().optional(),
}).passthrough();
export type AgencyInvoice=z.infer<typeof agencyInvoiceSchema>;
