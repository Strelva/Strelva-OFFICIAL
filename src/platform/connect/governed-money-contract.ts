import { z } from "zod";
// Browser-safe recorded-money DTOs. No provider, credential or database imports.
const id = z.uuid(), text = z.string().trim().min(1).max(200), timestamp = z.string().datetime({ offset: true }).refine(value => (/\.(\d+)/.exec(value)?.[1]?.length ?? 0) <= 6, "Recorded timestamps support PostgreSQL microsecond precision.");
const amount = z.number().int().positive().max(100000000), currency = z.string().regex(/^[a-z]{3}$/);
const dates = { effectiveFrom: timestamp, effectiveUntil: timestamp.nullable() };
function micros(value: string) {
  const seconds = Math.floor(Date.parse(value) / 1000);
  const fraction = /\.(\d+)(?=Z$|[+-]\d{2}:\d{2}$)/.exec(value)?.[1] ?? "";
  return BigInt(seconds) * BigInt(1000000) + BigInt(fraction.padEnd(6, "0"));
}
/** Exact PostgreSQL microsecond instants, preserving equivalent offsets. */
export function sameRecordedMoneyInstant(left: string | null, right: string | null) {
  if (left === null || right === null) return left === right;
  if (!timestamp.safeParse(left).success || !timestamp.safeParse(right).success) return false;
  return micros(left) === micros(right);
}
/** Human-supplied recorded terms only. No prices, rates or mandate defaults. */
export const operatorMoneyCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("record_agreement"), workspaceId: id, kind: z.enum(["agency", "creator"]), version: text, rateReference: text, rateBps: z.number().int().min(0).max(10000), ...dates }).strict(),
  z.object({ action: z.literal("record_price"), version: text, amountCents: amount, currency, definitionId: text.nullable(), ...dates }).strict(),
  z.object({ action: z.literal("authorize_payout"), payoutId: id, profileVersion: text }).strict(),
]).superRefine((value, context) => {
  if (value.action !== "authorize_payout" && value.effectiveUntil && micros(value.effectiveUntil) <= micros(value.effectiveFrom)) context.addIssue({ code: "custom", path: ["effectiveUntil"], message: "The written agreement must end after it starts." });
});
export const collectionPreparationSchema = z.object({ workspaceId: id, lineId: id, priceVersion: text, amountCents: amount, currency, installationId: id.nullable(), periodStart: timestamp, periodEnd: timestamp }).strict().refine(value => micros(value.periodEnd) > micros(value.periodStart), "The collection period must end after it starts.");
export const creatorListingCommandSchema = z.object({ workspaceId: id, sourceRevisionId: id, agreementVersion: text, rateReference: text }).strict();
export const governedPayoutCommandSchema = z.object({ payoutId: id, profileVersion: text }).strict();

export const governedPriceSchema = z.object({ version: text, amountCents: amount, currency, definitionId: text.nullable(), effectiveFrom: timestamp, effectiveUntil: timestamp.nullable() }).strict();
export const governedCollectionReceiptSchema = z.object({ lineId: text, workspaceId: id, priceVersion: text, amountCents: amount, currency, installationId: id.nullable(), acceptedBy: id, acceptedAt: timestamp, periodStart: timestamp.nullable(), periodEnd: timestamp.nullable() }).strict();
export const governedMoneyGraphSchema = z.object({ workspaceId: id, canPrepare: z.boolean(), payer: z.object({ kind: z.enum(["business", "agency"]), workspaceId: id, customerConfigured: z.boolean() }).strict().nullable(), prices: z.array(governedPriceSchema), terms: z.array(governedCollectionReceiptSchema), installations: z.array(z.object({ id, definitionId: text }).strict()), collectionDispatch: z.literal("not_configured") }).strict();
export type GovernedMoneyGraph = z.infer<typeof governedMoneyGraphSchema>;
export const governedOperatorGraphSchema = z.object({ workspaceId: id, agreements: z.array(z.object({ kind: z.enum(["agency", "creator"]), version: text, rateReference: text, rateBps: z.number().int().min(0).max(10000), ...dates, recordedBy: id }).strict()), prices: z.array(governedPriceSchema), payouts: z.array(z.object({ id, amountCents: amount, currency, sourceAccountId: z.literal("platform"), sourceTransaction: z.string(), recipientAccountId: z.string(), agreementVersion: text, profileVersion: text.nullable(), recipientProfileVersion: text.nullable(), authorizationProfileVersion: text.nullable(), authorizedBy: id.nullable(), transferId: z.string().regex(/^tr_[A-Za-z0-9]+$/).nullable() }).strict()) }).strict();
export type GovernedOperatorGraph = z.infer<typeof governedOperatorGraphSchema>;
