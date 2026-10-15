import { z } from "zod";

const nullableCents = z.number().int().nullable();
export const agencyPayLinkSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  rail: z.enum(["platform_legacy", "connected_account"]),
  agencyWorkspaceId: z.string().uuid().nullable(),
  businessWorkspaceId: z.string().uuid().nullable(),
  clientName: z.string(),
  description: z.string().nullable(),
  door: z.enum(["build", "managed_start"]).nullable(),
  amountCents: nullableCents,
  minCents: nullableCents,
  maxCents: nullableCents,
  currency: z.string(),
  agencyDisplayName: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  revokedAt: z.string().nullable(),
  revokedBy: z.string().nullable(),
  checkoutGeneration: z.number().int(),
  legacyTenantId: z.string().nullable(),
  leadSlug: z.string().nullable(),
  returnUrl: z.string().nullable(),
  status: z.enum(["open", "paid", "expired"]),
  paidAt: z.string().nullable(),
  paidAmountCents: nullableCents,
  invoiceNumber: nullableCents,
  receiptNumber: nullableCents,
}).passthrough();
export type AgencyPayLink = z.infer<typeof agencyPayLinkSchema>;

export const moneyDocumentSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["invoice", "payment_receipt"]),
  number: z.number().int(),
  issuer_workspace_id: z.string().uuid(),
  source_id: z.string().uuid(),
  payment_id: z.string().uuid().nullable(),
  snapshot: z.record(z.string(), z.unknown()),
  issued_at: z.string(),
}).passthrough();
export type MoneyDocument = z.infer<typeof moneyDocumentSchema>;

export function formatDocumentNumber(kind: MoneyDocument["kind"], n: number): string {
  return `${kind === "invoice" ? "INV" : "RCT"}-${String(n).padStart(6, "0")}`;
}
