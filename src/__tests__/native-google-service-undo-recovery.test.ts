import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListingReceipt } from "@/products/google-listing/contracts";

const mocks = vi.hoisted(() => ({
  access: vi.fn(), grant: vi.fn(), snapshot: vi.fn(), context: vi.fn(),
  event: vi.fn(), rpc: vi.fn(), settle: vi.fn(), get: vi.fn(),
  getPost: vi.fn(), getReview: vi.fn(), getLocation: vi.fn(), write: vi.fn(),
}));
vi.mock("@/platform/business-record/service", () => ({ readBusinessRecord: mocks.access }));
vi.mock("@/products/google-listing/native/contracts", () => ({ assertCurrentNativeGoogleGrant: mocks.grant }));
vi.mock("@/products/publishing/server", () => ({ readPublishingSnapshot: mocks.snapshot }));
vi.mock("@/platform/infra/tenant-publishing", () => ({ tenantPublishingPorts: async () => ({ getEventRaw: mocks.event, resolveEventAction: mocks.write }) }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/products/google-listing/workspace", () => ({ googleTargetAllowed: async () => true, tenantListingContext: mocks.context, undoWorkspaceGoogleChange: mocks.write }));
vi.mock("@/products/google-listing/controls", () => ({ readListingControl: async () => ({ paused: false, accessPending: false }) }));
import { googleMakeRealDraftDigest, googleMakeRealPorts } from "@/products/google-listing/make-real";
import { googleReceiptIntentDigest } from "@/products/google-listing/receipts";

const workspaceId = "b3000000-0000-4000-8000-000000000001";
const bindingId = "b3000000-0000-4000-8000-000000000002";
const originalId = "b3000000-0000-4000-8000-000000000003";
const inverseId = "b3000000-0000-4000-8000-000000000004";
const actor = { userId: "b3000000-0000-4000-8000-000000000005", verifiedEmail: "owner@example.test" };
const nativeGrant = { bindingId, accountId: "accounts/exact", grantGeneration: "a".repeat(64) };
const postName = "accounts/exact/locations/exact/localPosts/approved";
const metadata = { kind: "workspace_google_listing_draft", workspaceId, locationId: "exact", draft: { action: "post", post: { summary: "Approved exact post" } }, nativeGrant };
const request = { tenantId: `workspace-${workspaceId}`, eventId: "exact-event", locationId: "exact", draftDigest: googleMakeRealDraftDigest(metadata), nativeGrant };
const at = "2026-10-09T00:00:00.000Z";
let original: ListingReceipt;
let inverse: ListingReceipt;
let durableLink = true;

function originalReceipt(): ListingReceipt {
  const receipt: ListingReceipt = { id: originalId, workspaceId, bindingId, locationId: "exact", action: "post_create", targetRef: "exact", status: "undone", authority: { kind: "owner_approval", actor: actor.userId, approvalRef: request.eventId }, before: null, after: { summary: "Approved exact post" }, readback: "matched", providerRef: postName, undo: { kind: "delete_post", postName }, undoesReceiptId: null, undoneByReceiptId: inverseId, idempotencyKey: `google-draft:${request.eventId}`, providerPayloadExpired: false, error: null, createdAt: at, updatedAt: at, completedAt: at };
  receipt.intentDigest = googleReceiptIntentDigest(receipt);
  return receipt;
}
function inverseReceipt(): ListingReceipt {
  const receipt: ListingReceipt = { ...originalReceipt(), id: inverseId, action: "post_delete", status: "posted_unverified", authority: { kind: "owner_undo", actor: actor.userId }, before: { summary: "Approved exact post" }, after: null, readback: "failed", undo: null, undoesReceiptId: originalId, undoneByReceiptId: null, idempotencyKey: `undo:${originalId}` };
  receipt.intentDigest = googleReceiptIntentDigest(receipt);
  return receipt;
}

function noProviderWrite() { expect(mocks.write).not.toHaveBeenCalled(); }

beforeEach(() => {
  vi.resetAllMocks(); original = originalReceipt(); inverse = inverseReceipt(); durableLink = true;
  mocks.access.mockResolvedValue({ access: "owner" }); mocks.grant.mockResolvedValue({ id: bindingId });
  mocks.snapshot.mockResolvedValue({ bindings: [{ id: bindingId, status: "connected", originTenantId: null, locations: [{ locationId: "exact", accountId: nativeGrant.accountId }] }] });
  mocks.event.mockResolvedValue({ id: request.eventId, tenantId: request.tenantId, status: "approved", metadata });
  mocks.rpc.mockImplementation(async (name: string, args: Record<string,unknown>) => name==="verify_native_google_inverse_intent" ? {data:args.p_workspace_id===workspaceId && args.p_original_id===original.id && args.p_inverse_id===inverse.id && inverse.intentDigest===googleReceiptIntentDigest({workspaceId,bindingId,locationId:"exact",action:"post_delete",targetRef:original.targetRef,authority:inverse.authority,before:original.after,after:null,undoesReceiptId:original.id,idempotencyKey:`undo:${original.id}`}),error:null} : ({ data: args.p_workspace_id !== workspaceId ? null : args.p_idempotency_key === original.idempotencyKey ? structuredClone(original) : args.p_idempotency_key === inverse.idempotencyKey ? structuredClone(inverse) : null, error: null }));
  mocks.get.mockImplementation(async (id: string, scope: string) => scope !== workspaceId ? null : id === originalId ? structuredClone(original) : id === inverseId ? structuredClone(inverse) : null);
  mocks.settle.mockImplementation(async (id: string, scope: string, result: { status: ListingReceipt["status"]; readback: ListingReceipt["readback"] }) => {
    if (id !== inverseId || scope !== workspaceId) throw new Error("Fixture refused foreign settlement");
    inverse = { ...inverse, ...result };
    if (durableLink) original = { ...original, status: "undone", undoneByReceiptId: inverseId };
    return structuredClone(inverse);
  });
  mocks.getPost.mockResolvedValue({ ok: false, kind: "not_found" });
  mocks.context.mockResolvedValue({ workspaceId, bindingId, location: { accountId: nativeGrant.accountId, locationId: "exact" }, receipts: { get: mocks.get, settle: mocks.settle }, client: { getPost: mocks.getPost, getReview: mocks.getReview, getLocation: mocks.getLocation, deletePost: mocks.write, patchLocation: mocks.write, updateReply: mocks.write, deleteReply: mocks.write } });
});

const service = {
  session: { kind: "strelva_system" as const, label: "Strelva (system)" as const, sessionId: "b3000000-0000-4000-8000-000000000006", workspaceId, purpose: "make_real_resume" as const, onBehalf: { role: "admin" as const }, actor },
  approvalId: "b3000000-0000-4000-8000-000000000007", possibilityId: "b3000000-0000-4000-8000-000000000008", activationId: "exact-activation",
};
const encodedActor = `make-real-service:${service.session.sessionId}:${service.approvalId}`;
const recover = () => googleMakeRealPorts.forService!(service).verifyUndo!(actor, workspaceId, request, originalId);
function preparedServiceUndo() {
  original.authority = { kind: "owner_approval", actor: encodedActor, approvalRef: request.eventId }; original.intentDigest = googleReceiptIntentDigest(original);
  inverse.authority = { kind: "owner_undo", actor: encodedActor }; inverse.intentDigest = googleReceiptIntentDigest(inverse);
  const receiptRpc = mocks.rpc.getMockImplementation()!;
  mocks.rpc.mockImplementation(async (name, args) => name === "check_google_make_real_service_authority" ? { data: { ...actor, bindingId, possibilityId: service.possibilityId }, error: null } : receiptRpc(name, args));
}
describe("native Google owner recovery of retained service inverse", () => {
  const ownerRecover=()=>googleMakeRealPorts.verifyUndo!(actor,workspaceId,request,originalId);
  it("reconstructs the exact retained service actor through current authority for owner HTTP recovery", async () => {
    preparedServiceUndo(); expect(await ownerRecover()).toMatchObject({ok:true});
    expect(mocks.rpc).toHaveBeenCalledWith("check_google_make_real_service_authority",{p_workspace_id:workspaceId,p_session_id:service.session.sessionId,p_decision_id:service.approvalId,p_request:request,p_mode:"undo",p_possibility_id:null,p_activation_id:null});
    expect(mocks.getPost).toHaveBeenCalledTimes(1);expect(mocks.settle).toHaveBeenCalledTimes(1);noProviderWrite();
  });
  it.each(["expired_session","foreign_session","foreign_approval","expired_on_behalf_identity","foreign_binding"])("refuses %s retained service recovery before provider dispatch",async drift=>{
    preparedServiceUndo();
    if(drift==="foreign_session" || drift==="foreign_approval") { inverse.authority={kind:"owner_undo",actor:encodedActor.replace(drift==="foreign_session"?service.session.sessionId:service.approvalId,"b3000000-0000-4000-8000-000000000009")};inverse.intentDigest=googleReceiptIntentDigest(inverse); }
    const currentRpc=mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation(async(name,args)=>name==="check_google_make_real_service_authority"?drift==="foreign_binding"?{data:{...actor,userId:actor.userId,bindingId:drift==="foreign_binding"?"b3000000-0000-4000-8000-000000000009":bindingId,possibilityId:service.possibilityId},error:null}:{data:null,error:{message:"retained service session or approval denied"}}:currentRpc(name,args));
    await expect(ownerRecover()).rejects.toThrow(/authority/);expect(mocks.getPost).not.toHaveBeenCalled();expect(mocks.settle).not.toHaveBeenCalled();noProviderWrite();
  });
});
describe("native Google distinct owner and service operator",()=>{
 const operator={userId:"b3000000-0000-4000-8000-000000000009",verifiedEmail:"operator@example.test"};
 function operatorService(){preparedServiceUndo();const rpc=mocks.rpc.getMockImplementation()!;mocks.rpc.mockImplementation(async(name,args)=>name==="check_google_make_real_service_authority"?{data:{...operator,bindingId,possibilityId:service.possibilityId},error:null}:rpc(name,args));}
 it("lets a current owner recover a genuine logged operator inverse without taking that operator identity",async()=>{
  operatorService();expect(await googleMakeRealPorts.verifyUndo!(actor,workspaceId,request,originalId)).toMatchObject({ok:true});
  expect(mocks.rpc).toHaveBeenCalledWith("verify_native_google_inverse_intent",{p_workspace_id:workspaceId,p_user_id:actor.userId,p_verified_email:actor.verifiedEmail,p_request:request,p_original_id:originalId,p_inverse_id:inverseId,p_service_actor:null});noProviderWrite();
 });
 it("admits a genuine operator service context only with its exact encoded authority",async()=>{
  operatorService();const context={...service,session:{...service.session,actor:operator}};
  expect(await googleMakeRealPorts.forService!(context).verifyUndo!(operator,workspaceId,request,originalId)).toMatchObject({ok:true});
  expect(mocks.rpc).toHaveBeenCalledWith("verify_native_google_inverse_intent",{p_workspace_id:workspaceId,p_user_id:operator.userId,p_verified_email:operator.verifiedEmail,p_request:request,p_original_id:originalId,p_inverse_id:inverseId,p_service_actor:encodedActor});noProviderWrite();
 });
 it("refuses owner membership loss after inspection while recovering an operator inverse",async()=>{
  operatorService();mocks.access.mockResolvedValueOnce({access:"owner"}).mockResolvedValue({access:"provider_read"});
  await expect(googleMakeRealPorts.verifyUndo!(actor,workspaceId,request,originalId)).rejects.toThrow(/owner authority/);expect(mocks.getPost).not.toHaveBeenCalled();expect(mocks.settle).not.toHaveBeenCalled();noProviderWrite();
 });
});
describe("native Google service inverse recovery identity", () => {
  it("confirms genuine encoded service undo only through the exact current session and approval", async () => {
    preparedServiceUndo();
    expect(await recover()).toMatchObject({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("check_google_make_real_service_authority", { p_workspace_id: workspaceId, p_session_id: service.session.sessionId, p_decision_id: service.approvalId, p_request: request, p_mode: "undo", p_possibility_id: service.possibilityId, p_activation_id: service.activationId });
    expect(mocks.getPost).toHaveBeenCalledWith(postName); expect(mocks.settle).toHaveBeenCalledTimes(1); noProviderWrite();
  });
  it.each(["foreign_session", "foreign_approval", "raw_owner"])("refuses %s inverse actor before readback", async drift => {
    preparedServiceUndo();
    inverse.authority = { kind: "owner_undo", actor: drift === "raw_owner" ? actor.userId : drift === "foreign_session" ? encodedActor.replace(service.session.sessionId, "b3000000-0000-4000-8000-000000000009") : encodedActor.replace(service.approvalId!, "b3000000-0000-4000-8000-000000000009") };
    inverse.intentDigest = googleReceiptIntentDigest(inverse);
    expect(await recover()).toMatchObject({ ok: false }); expect(mocks.getPost).not.toHaveBeenCalled(); expect(mocks.settle).not.toHaveBeenCalled(); noProviderWrite();
  });
  it("refuses expired undo authority even while read inspection remains available", async () => {
    preparedServiceUndo(); const rpc = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation(async (name, args) => name === "check_google_make_real_service_authority" && args.p_mode === "undo" ? { data: null, error: { message: "expired" } } : rpc(name, args));
    await expect(recover()).rejects.toThrow(/authority/); expect(mocks.getPost).not.toHaveBeenCalled(); expect(mocks.settle).not.toHaveBeenCalled(); noProviderWrite();
  });
  it.each(["binding", "identity"])("refuses a changed current service %s before provider dispatch", async drift => {
    preparedServiceUndo(); const rpc = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation(async (name, args) => name === "check_google_make_real_service_authority" && args.p_mode === "undo" ? { data: { ...actor, bindingId: drift === "binding" ? "b3000000-0000-4000-8000-000000000009" : bindingId, userId: drift === "identity" ? "b3000000-0000-4000-8000-000000000009" : actor.userId, possibilityId: service.possibilityId }, error: null } : rpc(name, args));
    await expect(recover()).rejects.toThrow(/authority|identity/); expect(mocks.getPost).not.toHaveBeenCalled(); expect(mocks.settle).not.toHaveBeenCalled(); noProviderWrite();
  });
  it("does not settle recovery if service authority ends during provider readback", async () => {
    preparedServiceUndo();
    mocks.getPost.mockImplementationOnce(async () => {
      const rpc = mocks.rpc.getMockImplementation()!;
      mocks.rpc.mockImplementation(async (name, args) => name === "check_google_make_real_service_authority" && args.p_mode === "undo" ? { data: null, error: { message: "expired" } } : rpc(name, args));
      return { ok: false, kind: "not_found" };
    });
    await expect(recover()).rejects.toThrow(/authority/); expect(mocks.getPost).toHaveBeenCalledTimes(1); expect(mocks.settle).not.toHaveBeenCalled(); noProviderWrite();
  });
  it("rechecks undo authority after paused receipt reads before provider dispatch", async () => {
    preparedServiceUndo(); let release!: () => void; let entered!: () => void;
    const paused = new Promise<void>(resolve => { release = resolve; }); const ready = new Promise<void>(resolve => { entered = resolve; });
    const get = mocks.get.getMockImplementation()!;
    mocks.get.mockImplementationOnce(async (...args) => { entered(); await paused; return get(...args); });
    const pending = recover(); await ready;
    const rpc = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation(async (name, args) => name === "check_google_make_real_service_authority" && args.p_mode === "undo" ? { data: null, error: { message: "expired" } } : rpc(name, args));
    release(); await expect(pending).rejects.toThrow(/authority/); expect(mocks.getPost).not.toHaveBeenCalled(); expect(mocks.settle).not.toHaveBeenCalled(); noProviderWrite();
  });
});
