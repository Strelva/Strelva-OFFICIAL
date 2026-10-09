import { z } from 'zod';
import { sameRecordedMoneyInstant, governedPriceSchema } from './governed-money-contract';
const id = z.uuid(), text = z.string().trim().min(1).max(200), timestamp = z.string().datetime({ offset: true }).refine(value => (/\.(\d+)/.exec(value)?.[1]?.length ?? 0) <= 6);
function micros(value: string) { const fraction = /\.(\d+)(?=Z$|[+-]\d{2}:\d{2}$)/.exec(value)?.[1] ?? ''; return BigInt(Math.floor(Date.parse(value) / 1000)) * BigInt(1000000) + BigInt(fraction.padEnd(6, '0')); }
const dates = { effectiveFrom: timestamp, effectiveUntil: timestamp.nullable() };
export const neutralCreatorMoneyCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('record_creator_agreement'), sourceRevisionId: id, version: text, rateReference: text, rateBps: z.number().int().min(0).max(10000), ...dates }).strict(),
  z.object({ action: z.literal('record_source_price'), sourceRevisionId: id, version: text, amountCents: z.number().int().positive().max(100000000), currency: z.string().regex(/^[a-z]{3}$/), ...dates }).strict(),
]).refine(value => !value.effectiveUntil || micros(value.effectiveUntil) > micros(value.effectiveFrom), 'Written terms must end after they start.');
export const neutralCreatorListingCommandSchema = z.object({ workspaceId: id, sourceRevisionId: id, agreementVersion: text, rateReference: text }).strict();
export const neutralVersionCollectionCommandSchema = z.object({ workspaceId: id, versionId: id, releaseNumber: z.number().int().positive(), lineId: id, priceVersion: text, amountCents: z.number().int().positive().max(100000000), currency: z.string().regex(/^[a-z]{3}$/), periodStart: timestamp, periodEnd: timestamp }).strict().refine(value => micros(value.periodEnd) > micros(value.periodStart), 'Choose an explicit positive paid period.');
export const neutralPaidVersionReceiptSchema = z.object({
  line_id: text, business_workspace_id: id, version_id: id, release_number: z.number().int().positive(), source_system_id: id, source_revision_id: id, listing_id: id, creator_workspace_id: id,
  price_version: text, period_start: timestamp, period_end: timestamp, maintainer_state: z.enum(['creator','takeover','tapered']), agreement_version: text.nullable(), rate_reference: text.nullable(), rate_bps: z.number().int().min(0).max(10000).nullable(), payer_kind: z.enum(['business','agency']), payer_workspace_id: id, accepted_by: id, accepted_at: timestamp,
  amountCents: z.number().int().positive().max(100000000), currency: z.string().regex(/^[a-z]{3}$/), collectionDispatch: z.literal('not_configured'),
}).strict().refine(item=>item.maintainer_state==='takeover' ? item.agreement_version===null&&item.rate_reference===null&&item.rate_bps===null : item.agreement_version!==null&&item.rate_reference!==null&&item.rate_bps!==null,'Retained maintenance terms must match their written state.');
export type NeutralPaidVersionReceipt = z.infer<typeof neutralPaidVersionReceiptSchema>;
export const neutralCreatorSourcesSchema = z.object({ workspaceId: id, canRegister: z.boolean(), sources: z.array(z.object({ sourceSystemId: id, sourceRevisionId: id, creatorWorkspaceId: id, definitionId: text, name: text, revision: z.number().int().positive(), qualified: z.boolean(), listingId: id.nullable(), listingAgreementVersion: text.nullable(), listingRateReference: text.nullable() }).strict()), agreements: z.array(z.object({ version: text, rateReference: text, rateBps: z.number().int().min(0).max(10000), ...dates }).strict()) }).strict();
export const neutralVersionMoneyGraphSchema = z.object({ workspaceId: id, canPrepare: z.boolean(), customerConfigured: z.boolean(), payerKind:z.enum(['business','agency']),payerWorkspaceId:id, installations: z.array(z.object({ versionId: id, releaseNumber: z.number().int().positive().nullable(), name: text, sourceSystemId: id, sourceRevisionId: id, creatorWorkspaceId: id, definitionId: text, listingId: id, qualified: z.boolean(), released: z.boolean() }).strict()), prices: z.array(governedPriceSchema), history: z.array(neutralPaidVersionReceiptSchema), collectionDispatch: z.literal('not_configured') }).strict();
export function neutralReceiptMatches(receipt: NeutralPaidVersionReceipt, command: z.infer<typeof neutralVersionCollectionCommandSchema>, actorId: string) {
  return receipt.line_id === command.lineId && receipt.business_workspace_id === command.workspaceId && receipt.version_id === command.versionId && receipt.release_number === command.releaseNumber && receipt.price_version === command.priceVersion && receipt.amountCents === command.amountCents && receipt.currency === command.currency && receipt.accepted_by === actorId && sameRecordedMoneyInstant(receipt.period_start, command.periodStart) && sameRecordedMoneyInstant(receipt.period_end, command.periodEnd);
}

export type NeutralVersionMoneyGraph = z.infer<typeof neutralVersionMoneyGraphSchema>;
export type NeutralCreatorSources = z.infer<typeof neutralCreatorSourcesSchema>;
export type NeutralVersionCollectionCommand = z.infer<typeof neutralVersionCollectionCommandSchema>;
export type NeutralReviewedVersion = NeutralVersionMoneyGraph['installations'][number];
export function neutralReviewedReceiptMatches(receipt: NeutralPaidVersionReceipt, command: NeutralVersionCollectionCommand, actorId: string, reviewed: NeutralReviewedVersion) {
  return neutralReceiptMatches(receipt,command,actorId) && receipt.version_id === reviewed.versionId && receipt.release_number === reviewed.releaseNumber && receipt.source_system_id === reviewed.sourceSystemId && receipt.source_revision_id === reviewed.sourceRevisionId && receipt.creator_workspace_id === reviewed.creatorWorkspaceId && receipt.listing_id === reviewed.listingId && reviewed.definitionId === `system-source:${receipt.source_system_id}`;
}
/** Check an unknown-response receipt before adopting any newly returned graph. */
export function reconcileNeutralVersionMoney(next: NeutralVersionMoneyGraph, workspaceId: string, actorId: string, pending: {command: NeutralVersionCollectionCommand; reviewed: NeutralReviewedVersion} | null) {
 if(next.workspaceId !== workspaceId || next.history.some(item=>item.business_workspace_id !== workspaceId)) throw Error('Paid Version history belongs to another business.');
 if (!pending) return null;
 const receipt=next.history.find(item=>item.line_id===pending.command.lineId);
 if(receipt && !neutralReviewedReceiptMatches(receipt,pending.command,actorId,pending.reviewed)) throw Error('The recorded paid Version facts changed. Keep the original request and ask for review.');
 return receipt ?? null;
}
