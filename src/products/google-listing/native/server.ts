import { assertActingProvider } from "@/platform/workspaces/acting-provider";
import { publishingEnabledForWorkspace } from "@/products/publishing/server";
import { createServerLiveMakeReal, makeRealChannelEnabled } from "@/platform/make-real/live-server";
import { readBusinessRecord } from "@/platform/business-record/service";
import { createSupabasePossibilityRepository } from "@/platform/possibilities/supabase-repository";
import { readGoogleBindingForTenant } from "@/platform/account-bindings/store";
import { workspacePublishingScope } from "@/platform/infra/publishing-scope";
import { getSupabase } from "@/platform/infra/db/client";
import { getRedis } from "@/platform/infra/redis";
import { decryptSecret } from "@/platform/infra/crypto/secrets";
import { revokeProviderAuthorization } from "@/platform/infra/provider-revocation";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";
import { googleMakeRealPorts } from "../make-real";
import { createGoogleListingAdapter } from "@/platform/make-real/google-adapter";
import { assertCurrentNativeGoogleGrant, assertNativeGooglePlan, nativeGoogleCommandSchema, type NativeGooglePlan } from "./contracts";
import { z } from "zod";
import { createHash } from "node:crypto";
const liveMakeReal = createServerLiveMakeReal(googleMakeRealPorts);
async function owner(actor: WorkspaceActor, workspaceId: string) {
  if ((await readBusinessRecord(actor, workspaceId)).access !== "owner") throw new WorkspaceAccessError("Only the current business owner can change Google.");
}
export async function nativeGooglePlan(actor: WorkspaceActor, plan: NativeGooglePlan) {
  await owner(actor, plan.workspaceId);
  if (!(await publishingEnabledForWorkspace(plan.workspaceId, actor)) || !(await makeRealChannelEnabled(plan.workspaceId, "google_listing"))) throw new WorkspaceConflictError("Native Google publishing is not enabled.");
  const [proposal, binding] = await Promise.all([createSupabasePossibilityRepository(actor).get(plan.workspaceId, plan.possibilityId), readGoogleBindingForTenant(workspacePublishingScope(plan.workspaceId))]);
  if (!proposal || !binding) throw new WorkspaceConflictError("The native Google plan or grant is unavailable.");
  if (binding.status === "revoked") throw new WorkspaceAccessError("This native Google grant was revoked.");
  assertNativeGooglePlan(plan, proposal, binding);
  await noLegacyGoogleGrant();
  await nativeGoogleLifecycle(actor, plan.workspaceId, "qualify", { bindingId: binding.id });
  return { proposal, binding, effect: proposal.effects.find(item => item.id === plan.effectId)! };
}
/** A legacy Redis grant cannot be inferred absent from native snapshots. Refuse
 * revocation if any legacy Google grant remains, or the bounded scan is unavailable. */
async function noLegacyGoogleGrant() {
  if (process.env.STRELVA_NATIVE_GOOGLE_ONLY !== "1") throw new WorkspaceConflictError("Native-only Google grant admission is not enabled; legacy grants keep their existing workflow.");
  const redis = getRedis(); if (!redis) throw new WorkspaceConflictError("Google grant isolation is unavailable.");
  let cursor: string = "0";
  for (let page = 0; page < 40; page += 1) {
    const scan: [string, string[]] = await redis.scan(cursor, { match: "connections:*:google", count: 250 });
    const next = scan[0], keys = scan[1];
    if (keys.length) throw new WorkspaceConflictError("Legacy Google grants require separate review before native revocation.");
    cursor = next; if (String(cursor) === "0") return;
  }
  throw new WorkspaceConflictError("Google grant isolation scan exceeded its bound.");
}
type Rpc = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
export async function nativeGoogleLifecycle(actor: WorkspaceActor, workspaceId: string, action: string, input: Record<string, unknown> = {}) {
  const db = getSupabase() as unknown as Rpc | null; if (!db) throw new Error("Native Google storage unavailable.");
  const result = await db.rpc("native_google_owner_lifecycle", { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_workspace_id: workspaceId, p_action: action, p_input: input });
  if (result.error) throw new WorkspaceConflictError("Native Google lifecycle could not be confirmed. Read its existing receipt before retrying.");
  return result.data;
}
export async function commandNativeGoogle(actor: WorkspaceActor, raw: unknown, makeReal: (plan: NativeGooglePlan) => Promise<unknown>) {
  const command = nativeGoogleCommandSchema.parse(raw);
  if (command.action === "proof_identity") {
    await owner(actor, command.workspaceId);
    const app = process.env.NEXT_PUBLIC_APP_URL || "", database = process.env.NEXT_PUBLIC_SUPABASE_URL || "", redisUrl = process.env.UPSTASH_REDIS_REST_URL || "";
    if (process.env.STRELVA_LOCAL_AUTH_PROOF !== "1" || process.env.STRELVA_NATIVE_GOOGLE_ONLY !== "1" || ![app, database, redisUrl].every(value => { try { return ["localhost", "127.0.0.1"].includes(new URL(value).hostname); } catch { return false; } })) throw new WorkspaceConflictError("Owned loopback native proof stores required.");
    const redis = getRedis(); if (!redis) throw new WorkspaceConflictError("Native proof Redis unavailable.");
    const namespace = await redis.get<string>("strelva:native-google:proof-namespace");
    if (typeof namespace !== "string" || !namespace || namespace.length > 500) throw new WorkspaceConflictError("Native proof namespace unavailable.");
    const identity = await nativeGoogleLifecycle(actor, command.workspaceId, "proof_identity");
    const hash = (value: string) => createHash("sha256").update(value).digest("hex");
    return { databaseIdentityDigest: hash(JSON.stringify((({ system, database, address, port }) => [system, database, address, port])(z.object({system:z.string(),database:z.string(),address:z.string(),port:z.number()}).parse(identity)))), supabaseUrlDigest: hash(database), redisUrlDigest: hash(redisUrl), redisNamespaceDigest: hash(namespace), nativeOnly: true };
  }
  if (command.action === "agency_authority") return { authorized: true, agencyWorkspaceId: await assertActingProvider(actor, command.workspaceId, { effect: "google", kind: "google_location", ref: command.locationId }) };
  if (command.action === "read_grant") {
    await owner(actor, command.workspaceId);
    const result=z.object({bindingId:z.string().uuid(),status:z.enum(["connected","revoked","needs_reauth","error"]),bindingCredentialsPurged:z.boolean(),credentialsPurged:z.boolean(),grantGeneration:z.string().regex(/^[a-f0-9]{64}$/),subjectDigest:z.string().regex(/^[a-f0-9]{64}$/).nullable(),locations:z.array(z.object({accountId:z.string(),locationId:z.string()}).strict())}).strict().parse(await nativeGoogleLifecycle(actor, command.workspaceId, "read_grant", {bindingId:command.bindingId}));
    if(result.bindingId!==command.bindingId)throw new WorkspaceConflictError("Exact native Google binding unavailable.");
    await owner(actor, command.workspaceId);return result;
  }
  if (command.action === "read_disconnect") { await owner(actor, command.workspaceId); return nativeGoogleLifecycle(actor, command.workspaceId, "read_disconnect", { commandId: command.commandId }); }
  if (command.action === "purge_expired_cache") { await owner(actor, command.workspaceId); return nativeGoogleLifecycle(actor, command.workspaceId, "purge"); }
  if (command.action === "end_mandate") {
    await owner(actor, command.workspaceId);
    const db = getSupabase() as unknown as Rpc | null; if (!db) throw new Error("Native Google storage unavailable.");
    const read = () => db.rpc("read_client_resource_mandates", { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_workspace_id: command.workspaceId });
    const mandates = await read();
    const target = z.array(z.object({ id: z.string(), customerWorkspaceId: z.string(), status: z.string(), effect: z.string(), resourceKind: z.string(), resourceRef: z.string() }).passthrough()).parse(mandates.data).find(item => item.id === command.mandateId);
    if (mandates.error || !target || !["active", "ended"].includes(target.status) || target.customerWorkspaceId !== command.workspaceId || target.effect !== "google" || target.resourceKind !== "google_location" || target.resourceRef !== command.locationId) throw new WorkspaceConflictError("Exact active Google place mandate required.");
    if (target.status === "ended") return { mandateId: command.mandateId, status: "ended", ownerGrantRevoked: false };
    const ended = await db.rpc("end_client_resource_mandate", { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_workspace_id: command.workspaceId, p_mandate_id: command.mandateId, p_reason: "Business owner ended this exact Google place mandate." });
    if (ended.error) throw new WorkspaceConflictError("Google mandate end is unconfirmed.");
    const after = await read();
    if (after.error || !Array.isArray(after.data) || !after.data.some(item => item && typeof item === "object" && item.id === command.mandateId && item.status === "ended")) throw new WorkspaceConflictError("Google mandate end readback is unconfirmed.");
    return { mandateId: command.mandateId, status: "ended", ownerGrantRevoked: false };
  }
  if (command.action === "disconnect") {
    const plan=command.plan;await owner(actor,plan.workspaceId);
    if(plan.request.tenantId!==`workspace-${plan.workspaceId}` || JSON.stringify(plan.request.nativeGrant)!==JSON.stringify(plan.grant))throw new WorkspaceConflictError("Exact native Google grant scope required.");
    await noLegacyGoogleGrant();
    const scope={commandId:command.commandId,bindingId:plan.grant.bindingId,accountId:plan.grant.accountId,locationId:plan.request.locationId,grantGeneration:plan.grant.grantGeneration};
    const existing=await nativeGoogleLifecycle(actor,plan.workspaceId,"find_disconnect",scope);
    let expectedUpdatedAt:string|undefined;
    if(existing===null){
      const binding=await assertCurrentNativeGoogleGrant(plan.workspaceId,plan.request.locationId,plan.grant);
      await nativeGoogleLifecycle(actor,plan.workspaceId,"qualify",{bindingId:binding.id});expectedUpdatedAt=binding.updatedAt;
    }
    const metadata=z.object({dispatch:z.literal(false),id:z.string().uuid(),bindingId:z.string().uuid(),status:z.enum(["claimed","settled"]),remoteOutcome:z.string(),remoteErrorCode:z.string().nullable(),credentialsPurged:z.boolean(),bindingCredentialsPurged:z.boolean(),remoteRevoked:z.boolean(),retryAvailable:z.boolean(),attempts:z.number().int().min(1).max(3)}).strict();
    const claim=z.discriminatedUnion("dispatch",[metadata,z.object({dispatch:z.literal(true),id:z.string().uuid(),leaseId:z.string().uuid(),revocationTokenCiphertext:z.string().min(1)}).strict()]).parse(await nativeGoogleLifecycle(actor,plan.workspaceId,"claim_disconnect",{...scope,...(expectedUpdatedAt?{expectedUpdatedAt}:{})}));
    if(!claim.dispatch){const {dispatch,...result}=claim;void dispatch;return result;}
    let revoked:Awaited<ReturnType<typeof revokeProviderAuthorization>>;
    try{revoked=await revokeProviderAuthorization("google",decryptSecret(claim.revocationTokenCiphertext));}
    catch{revoked={outcome:"failed",errorCode:"request_failed"};}
    return nativeGoogleLifecycle(actor,plan.workspaceId,"settle_disconnect",{commandId:claim.id,leaseId:claim.leaseId,outcome:revoked.outcome,errorCode:revoked.errorCode});
  }
  const plan = command.plan;
  const { proposal, binding, effect } = await nativeGooglePlan(actor, plan);
  if (command.action === "read") return { candidateRevision: proposal.candidateRevision, planFingerprint: plan.planFingerprint, grant: plan.grant, state: await googleMakeRealPorts.inspect(actor, plan.workspaceId, plan.request), ...(proposal.activationId ? { activation: await liveMakeReal.read(actor, plan.workspaceId, proposal.activationId) } : {}) };
  if (command.action === "make_real") {
    await noLegacyGoogleGrant();
    await nativeGoogleLifecycle(actor, plan.workspaceId, "qualify", { bindingId: binding.id });
    if (proposal.status !== "ready") throw new WorkspaceConflictError("The exact plan is no longer Ready.");
    await nativeGooglePlan(actor, plan); return makeReal(plan);
  }
  const activation = await liveMakeReal.read(actor, plan.workspaceId, command.activationId);
  if (activation.possibilityId !== plan.possibilityId || activation.candidateRevision !== plan.candidateRevision || activation.businessId !== plan.workspaceId) throw new WorkspaceConflictError("Activation does not belong to the exact plan.");
  if (command.action === "resume") {
    await nativeGooglePlan(actor,plan);
    if(activation.status==="made_real") {
      const completed=activation.steps.find(step=>step.kind==="effect"&&step.target===plan.effectId);
      if(!completed?.receipt?.providerRef)throw new WorkspaceConflictError("Exact native Google completion receipt required.");
      return {activation:await liveMakeReal.completeNativeGoogle(actor,plan.workspaceId,activation.id,{candidateRevision:plan.candidateRevision,planFingerprint:plan.planFingerprint,effectId:plan.effectId,providerRef:completed.receipt.providerRef})};
    }
    return {activation:await liveMakeReal.resume(actor,plan.workspaceId,activation.id,"Current owner resumed the exact recovered native Google plan.")};
  }
  const step = activation.steps.find(item => item.kind === "effect" && item.target === plan.effectId);
  if (!step) throw new WorkspaceConflictError("Exact Google effect step required.");
  const adapter = createGoogleListingAdapter(googleMakeRealPorts, { actor, enabled: async () => true });
  if (command.action === "recover_compensation") {
    if (step.kind !== "effect" || step.effect !== "accepted" || step.compensation?.status !== "unknown" || !step.receipt?.providerRef || !adapter.verifyCompensation || !(await adapter.verifyCompensation({ businessId: plan.workspaceId, providerRef: step.receipt.providerRef })).ok) throw new WorkspaceConflictError("Exact unknown compensation and confirmed inverse readback required. Nothing was repeated.");
    return { activation: await liveMakeReal.reconcile(actor, plan.workspaceId, activation.id, { stepId: step.id, resolution: "completed", target: "compensation", evidence: "Exact retained native Google compensating receipt and actual inverse readback confirmed undo." }) };
  }
  if (command.action === "recover") {
    if (step.status !== "unknown" || !["unknown","accepted"].includes(step.effect)) throw new WorkspaceConflictError("Exact unknown Google effect required.");
    const found = await adapter.find({ businessId: plan.workspaceId, effect, idempotencyKey: step.idempotencyKey });
    if (!found?.found || !(await adapter.readBack({ businessId: plan.workspaceId, providerRef: found.providerRef })).ok) throw new WorkspaceConflictError("Existing Google receipt and current matched readback are required. Nothing was repeated.");
    await nativeGooglePlan(actor, plan);
    const recovered = await liveMakeReal.reconcile(actor, plan.workspaceId, activation.id, { stepId: step.id, resolution: "completed", evidence: "Exact native Google adapter lookup and actual provider readback confirmed this accepted effect.", providerRef: found.providerRef });
    return { activation: recovered, providerRef: found.providerRef };
  }
  if (step.effect !== "accepted" || !step.receipt?.providerRef) throw new WorkspaceConflictError("Exact accepted Google effect receipt required.");
  if (command.action === "readback") return { activation, readback: await adapter.readBack({ businessId: plan.workspaceId, providerRef: step.receipt.providerRef }) };
  await nativeGooglePlan(actor, plan);
  return { activation: await liveMakeReal.rollbackNativeGoogle(actor, plan.workspaceId, activation.id, {candidateRevision:plan.candidateRevision,planFingerprint:plan.planFingerprint,effectId:plan.effectId,providerRef:step.receipt.providerRef}, "Business owner requested governed undo of this exact approved plan.") };
}
