import { z } from "zod";
import { WorkspaceConflictError } from "@/platform/workspaces/types";
import { googleMakeRealRequestSchema, nativeGoogleGrantPinSchema } from "@/platform/make-real/google-provider-reference";
import { planFingerprint } from "@/platform/make-real/approvals";
import type { Possibility } from "@/platform/possibilities/contracts";
import type { AccountBindingWithSecrets } from "@/platform/account-bindings/contracts";
import { createHash } from "node:crypto";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export { nativeGoogleGrantPinSchema };
export const nativeGooglePlanSchema = z.object({ workspaceId: z.string().uuid(), possibilityId: z.string().min(1).max(120), candidateRevision: z.number().int().positive(), planFingerprint: digest, effectId: z.string().min(1).max(60), request: googleMakeRealRequestSchema, grant: nativeGoogleGrantPinSchema }).strict();
export type NativeGooglePlan = z.infer<typeof nativeGooglePlanSchema>;
export function nativeGoogleGrantGeneration(binding: Pick<AccountBindingWithSecrets, "id" | "subject" | "refreshTokenCiphertext" | "createdAt">) {
  return createHash("sha256").update(JSON.stringify([binding.id, binding.subject, binding.refreshTokenCiphertext, binding.createdAt])).digest("hex");
}
export function assertNativeGooglePlan(scope: NativeGooglePlan, proposal: Possibility, binding: AccountBindingWithSecrets) {
  if (proposal.businessId !== scope.workspaceId || proposal.id !== scope.possibilityId || proposal.candidateRevision !== scope.candidateRevision || planFingerprint(proposal) !== scope.planFingerprint) throw new WorkspaceConflictError("The complete Google plan changed. Review it again.");
  const effect = proposal.effects.find(item => item.id === scope.effectId);
  if (!effect || effect.channel !== "google_listing" || effect.kind !== "publish" || proposal.effects.length !== 1 || JSON.stringify(googleMakeRealRequestSchema.parse(effect.request)) !== JSON.stringify(scope.request)) throw new WorkspaceConflictError("The exact Google effect changed.");
  if (JSON.stringify(scope.request.nativeGrant) !== JSON.stringify(scope.grant) || scope.request.tenantId !== `workspace-${scope.workspaceId}` || binding.originTenantId !== null || binding.originTenantStableId !== null || binding.workspaceId !== scope.workspaceId || binding.id !== scope.grant.bindingId || binding.status !== "connected" || !binding.subject || !binding.refreshTokenCiphertext || !binding.scopes?.includes("https://www.googleapis.com/auth/business.manage") || nativeGoogleGrantGeneration(binding) !== scope.grant.grantGeneration || !binding.locations.some(item => item.accountId === scope.grant.accountId && item.locationId === scope.request.locationId)) throw new WorkspaceConflictError("The exact native Google account, place or grant changed. Review again.");
}
export const nativeGoogleCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("proof_identity"), workspaceId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("read"), plan: nativeGooglePlanSchema }).strict(),
  z.object({ action: z.literal("make_real"), plan: nativeGooglePlanSchema }).strict(),
  z.object({ action: z.enum(["recover", "recover_compensation", "resume", "readback", "undo"]), plan: nativeGooglePlanSchema, activationId: z.string().min(1).max(120) }).strict(),
  z.object({ action: z.literal("disconnect"), plan: nativeGooglePlanSchema, commandId: z.string().uuid(), confirmGrantRevocation: z.literal(true) }).strict(),
  z.object({ action: z.literal("end_mandate"), workspaceId: z.string().uuid(), locationId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), mandateId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("agency_authority"), workspaceId: z.string().uuid(), locationId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }).strict(),
  z.object({ action: z.literal("read_grant"), workspaceId: z.string().uuid(), bindingId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("read_disconnect"), workspaceId: z.string().uuid(), commandId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("purge_expired_cache"), workspaceId: z.string().uuid() }).strict(),
]);

export async function assertCurrentNativeGoogleGrant(workspaceId: string, locationId: string, pin: z.infer<typeof nativeGoogleGrantPinSchema>) {
  const { readGoogleBindingForTenant, googleBindingsEnabled } = await import("@/platform/account-bindings/store");
  if (!googleBindingsEnabled()) throw new WorkspaceConflictError("Native Google grants are not enabled.");
  const binding = await readGoogleBindingForTenant(`workspace-${workspaceId}`);
  if (!binding || binding.id !== pin.bindingId || binding.workspaceId !== workspaceId || binding.originTenantId !== null || binding.originTenantStableId !== null || binding.status !== "connected" || !binding.subject || !binding.scopes?.includes("https://www.googleapis.com/auth/business.manage") || nativeGoogleGrantGeneration(binding) !== pin.grantGeneration || !binding.locations.some(item => item.accountId === pin.accountId && item.locationId === locationId)) throw new WorkspaceConflictError("The approved native Google account/place/grant generation changed.");
  return binding;
}
