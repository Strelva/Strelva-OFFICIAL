import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { connectDb, connectProfile, type RpcDb, type ConnectDependencies } from "./index";
import { executeApprovedPayout } from "./transfers";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";

const id = z.uuid(), text = z.string().trim().min(1).max(200), timestamp = z.string().datetime({ offset: true }).refine(value => (/\.(\d+)/.exec(value)?.[1]?.length ?? 0) <= 6, "Recorded timestamps support PostgreSQL microsecond precision.");
const amount = z.number().int().positive().max(100000000), currency = z.string().regex(/^[a-z]{3}$/);
const dates = { effectiveFrom: timestamp, effectiveUntil: timestamp.nullable() };
function micros(value: string) {
  const seconds = Math.floor(Date.parse(value) / 1000);
  const fraction = /\.(\d+)(?=Z$|[+-]\d{2}:\d{2}$)/.exec(value)?.[1] ?? "";
  return BigInt(seconds) * BigInt(1000000) + BigInt(fraction.padEnd(6, "0"));
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

const priceSchema = z.object({ version: text, amountCents: amount, currency, definitionId: text.nullable(), effectiveFrom: timestamp, effectiveUntil: timestamp.nullable() }).strict();
const termsSchema = z.object({ lineId: text, workspaceId: id, priceVersion: text, amountCents: amount, currency, installationId: id.nullable(), acceptedBy: id, acceptedAt: timestamp, periodStart: timestamp.nullable(), periodEnd: timestamp.nullable() }).strict();
function instant(value: string | null) {
  if (!value) return null;
  const millis = Date.parse(value);
  const fraction = /\.(\d+)(?=Z$|[+-]\d{2}:\d{2}$)/.exec(value)?.[1] ?? "";
  return `${Math.floor(millis / 1000)}:${fraction.padEnd(6, "0")}`;
}
export const governedMoneyGraphSchema = z.object({ workspaceId: id, canPrepare: z.boolean(), payer: z.object({ kind: z.enum(["business", "agency"]), workspaceId: id, customerConfigured: z.boolean() }).strict().nullable(), prices: z.array(priceSchema), terms: z.array(termsSchema), installations: z.array(z.object({ id, definitionId: text }).strict()), collectionDispatch: z.literal("not_configured") }).strict();
export type GovernedMoneyGraph = z.infer<typeof governedMoneyGraphSchema>;
async function call(name: string, actor: WorkspaceActor, args: Record<string, unknown>, db: RpcDb | null) {
  if (!db) throw new WorkspaceStoreError("Recorded money terms are unavailable.");
  const result = await db.rpc(name, { ...args, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail });
  if (result.error) {
    const message = result.error.message || "";
    if (/denied|owner_required|future_work_blocked/.test(message)) throw new WorkspaceAccessError();
    if (/conflict|changed|not_configured|agreement_required|price_required|unqualified|source_required/.test(message)) throw new WorkspaceConflictError("The current recorded terms, payer or qualified source could not be confirmed. Reload before continuing.");
    throw new WorkspaceStoreError("The money operation could not be confirmed.");
  }
  return result.data;
}
export async function readGovernedMoney(actor: WorkspaceActor, workspaceId: string, db: RpcDb | null = connectDb()) {
  const parsed = governedMoneyGraphSchema.safeParse(await call("read_governed_money_preparation", actor, { p_workspace_id: id.parse(workspaceId) }, db));
  if (!parsed.success || parsed.data.workspaceId !== workspaceId || parsed.data.terms.some(term => term.workspaceId !== workspaceId)) throw new WorkspaceStoreError("Money terms do not match this workspace.");
  return parsed.data;
}
/** Records acceptance and the exact period atomically; sends nothing to Stripe. */
export async function prepareGovernedCollection(actor: WorkspaceActor, raw: unknown, db: RpcDb | null = connectDb()) {
  const input = collectionPreparationSchema.parse(raw);
  const parsed = termsSchema.safeParse(await call("prepare_governed_collection_terms", actor, { p_command: input }, db));
  if (!parsed.success) throw new WorkspaceStoreError("The accepted collection terms are invalid.");
  const receipt = parsed.data;
  if (receipt.lineId !== input.lineId || receipt.workspaceId !== input.workspaceId || receipt.acceptedBy !== actor.userId || receipt.priceVersion !== input.priceVersion || receipt.amountCents !== input.amountCents || receipt.currency !== input.currency || receipt.installationId !== input.installationId || instant(receipt.periodStart) !== instant(input.periodStart) || instant(receipt.periodEnd) !== instant(input.periodEnd)) throw new WorkspaceStoreError("The accepted terms do not match this command.");
  return { receipt, collectionDispatch: "not_configured" as const };
}
export async function recordOperatorMoneyConfiguration(actor: WorkspaceActor, raw: unknown, db: RpcDb | null = connectDb()) {
  const command = operatorMoneyCommandSchema.parse(raw);
  const parsed = z.object({ action: z.literal(command.action), recordedBy: z.literal(actor.userId), replayed: z.boolean(), command: operatorMoneyCommandSchema }).strict().safeParse(await call("record_governed_money_configuration", actor, { p_command: command }, db));
  if (!parsed.success || JSON.stringify(parsed.data.command) !== JSON.stringify(command)) {
    // SQL JSONB key ordering is immaterial. Compare structured keys instead.
    if (!parsed.success || JSON.stringify(Object.entries(parsed.data.command as Record<string, unknown>).sort()) !== JSON.stringify(Object.entries(command).sort())) throw new WorkspaceStoreError("The configuration receipt does not match this command.");
  }
  return parsed.data;
}
export async function readOperatorMoneyConfiguration(actor: WorkspaceActor, workspaceId: string, db: RpcDb | null = connectDb()) {
  const schema = z.object({ workspaceId: z.literal(workspaceId), agreements: z.array(z.object({ kind: z.enum(["agency", "creator"]), version: text, rateReference: text, rateBps: z.number().int().min(0).max(10000), ...dates, recordedBy: id }).strict()), prices: z.array(priceSchema), payouts: z.array(z.object({ id, amountCents: amount, currency, sourceAccountId: z.literal("platform"), sourceTransaction: z.string(), recipientAccountId: z.string(), agreementVersion: text, profileVersion: text.nullable(), authorizedBy: id.nullable(), transferId: z.string().nullable() }).strict()) }).strict();
  const parsed = schema.safeParse(await call("read_governed_money_configuration", actor, { p_workspace_id: id.parse(workspaceId) }, db));
  if (!parsed.success) throw new WorkspaceStoreError("The operator money configuration is invalid.");
  return parsed.data;
}
export async function registerGovernedCreatorListing(actor: WorkspaceActor, raw: unknown, db: RpcDb | null = connectDb()) {
  const input = creatorListingCommandSchema.parse(raw);
  const schema = z.object({ id, creatorWorkspaceId: z.literal(input.workspaceId), sourceRevisionId: z.literal(input.sourceRevisionId), definitionId: text, agreementVersion: z.literal(input.agreementVersion), rateReference: z.literal(input.rateReference) }).strict();
  const parsed = schema.safeParse(await call("register_governed_creator_listing", actor, { p_command: input }, db));
  if (!parsed.success) throw new WorkspaceStoreError("The creator listing receipt is invalid.");
  return parsed.data;
}
export async function executeGovernedPayout(actor: WorkspaceActor, raw: unknown, deps: ConnectDependencies = {}) {
  const input = governedPayoutCommandSchema.parse(raw);
  if (connectProfile().version !== input.profileVersion) throw new WorkspaceConflictError("The approved Connect profile changed. Reload before continuing.");
  return executeApprovedPayout(input.payoutId, { ...deps, payoutAuthority: { actor, profileVersion: input.profileVersion }, beforeProviderMutation: async () => {
    await deps.beforeProviderMutation?.();
    if (!workspaceReleaseEnabled() || process.env.STRELVA_REVENUE_SPLITS !== "1" || process.env.STRELVA_CONNECT !== "1" || process.env.STRELVA_SPLIT_PAYOUT_EXECUTION !== "1") throw new WorkspaceStoreError("Payout execution is not enabled.");
    if (connectProfile().version !== input.profileVersion) throw new WorkspaceConflictError("The approved Connect profile changed. Reload before continuing.");
  } });
}
