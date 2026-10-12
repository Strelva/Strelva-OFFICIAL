import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "../../platform/business-record/tenant-import";
import { runTenantConversion, runTenantRollback, isLocalDatabaseUrl, type ConversionDeps, type ConversionOptions, type ConversionOutcome, type RollbackDeps, type RollbackOutcome } from "./engine";

export const conversionSelectionSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,119}$/),
  agencyWorkspaceId: z.string().uuid(),
  agencyStaffEmails: z.array(z.string().trim().email().transform(value => value.toLowerCase())).min(1).max(100).refine(value => new Set(value).size === value.length),
  agencySelectionBasis: z.enum(["existing_contract", "owner_choice"]),
  separateBusiness: z.boolean(),
}).strict();
export type ConversionSelection = z.infer<typeof conversionSelectionSchema>;
export interface ConversionIdentity { userId: string; email: string }
export interface ConversionAdmission {
  identity(): Promise<ConversionIdentity | null>;
  enabled(): boolean;
  databaseUrl(): string | undefined;
  productionApproved(): boolean;
}
export function conversionReleaseEnabled(): boolean { return process.env.STRELVA_TENANT_CONVERSION === "1"; }
export function conversionProductionApproved(): boolean { return process.env.STRELVA_TENANT_CONVERSION_PRODUCTION_APPROVED === "1"; }
export async function admitConversion(admission: ConversionAdmission, mutation = false): Promise<ConversionIdentity> {
  if (!admission.enabled()) throw new Error("Client conversion is not enabled.");
  const actor = await admission.identity();
  if (!actor) throw new Error("A verified super-admin session is required. Development bypass cannot convert clients.");
  if (mutation && !isLocalDatabaseUrl(admission.databaseUrl()) && !admission.productionApproved()) throw new Error("Production conversion is awaiting Jacob’s approval. The reviewed plan is read-only.");
  return actor;
}
function options(selection: ConversionSelection, actor: ConversionIdentity, admission: ConversionAdmission): ConversionOptions {
  return { ...conversionSelectionSchema.parse(selection), operatorEmail: actor.email, apply: false, jacobsYes: admission.productionApproved(), databaseUrl: admission.databaseUrl() };
}
export async function previewConversion(selection: ConversionSelection, admission: ConversionAdmission, deps: ConversionDeps) {
  const actor = await admitConversion(admission);
  return { actor, outcome: await runTenantConversion(options(selection, actor, admission), deps) };
}
/** Bind the reviewed payload, skipped-field report and target/link.
 * Changed import records or a concurrent conversion require a new review. */
export function conversionReviewDigest(outcome: ConversionOutcome): string {
  return createHash("sha256").update(canonicalJson({ plan: outcome.plan, link: outcome.link, targetWorkspaceId: outcome.targetWorkspaceId })).digest("hex");
}
export async function applyReviewedConversion(selection: ConversionSelection, reviewed: { actorId: string; digest: string }, admission: ConversionAdmission, deps: ConversionDeps) {
  const actor = await admitConversion(admission, true);
  if (actor.userId !== reviewed.actorId) throw new Error("The signed-in operator changed. Run a new dry run.");
  const current = await runTenantConversion(options(selection, actor, admission), deps);
  if (conversionReviewDigest(current) !== reviewed.digest) throw new Error("The source records or destination changed. Run a new dry run and review them again.");
  if (!current.plan.payload.tenantStableId) throw new Error("A durable tenant identity is required.");
  const stillActive = await admitConversion(admission, true);
  if (stillActive.userId !== actor.userId || stillActive.email !== actor.email) throw new Error("Operator access changed during the read. Run a new dry run.");
  // Write this exact reviewed payload once, rather than reading it again.
  const receipt = await deps.convert(actor.email, current.plan.payload, { commandId: current.plan.commandId, digest: current.plan.digest });
  return receipt;
}
export function rollbackReviewDigest(outcome: RollbackOutcome): string {
  return createHash("sha256").update(canonicalJson({ preview: outcome.preview, command: outcome.command })).digest("hex");
}
export async function previewRollback(slug: string, admission: ConversionAdmission, deps: RollbackDeps) {
  const actor = await admitConversion(admission);
  const outcome = await runTenantRollback({ slug, apply: false, operatorEmail: actor.email, jacobsYes: false, databaseUrl: admission.databaseUrl() }, deps);
  return { actor, outcome };
}
export async function applyReviewedRollback(slug: string, reviewed: { actorId: string; digest: string }, admission: ConversionAdmission, deps: RollbackDeps) {
  const actor = await admitConversion(admission, true);
  if (actor.userId !== reviewed.actorId) throw new Error("The signed-in operator changed. Review Undo again.");
  const { outcome } = await previewRollback(slug, admission, deps);
  if (rollbackReviewDigest(outcome) !== reviewed.digest) throw new Error("Rollback eligibility changed. Review Undo again.");
  if (!outcome.command) throw new Error("There is no conversion to undo.");
  const stillActive = await admitConversion(admission, true);
  if (stillActive.userId !== actor.userId || stillActive.email !== actor.email) throw new Error("Operator access changed during the read. Review Undo again.");
  return deps.unlink(actor.email, outcome.command);
}
