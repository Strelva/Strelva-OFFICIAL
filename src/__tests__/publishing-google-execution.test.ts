import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedEvent } from "@/platform/infra/event-contract";
import type { GoogleListingClient, GoogleLocationState } from "@/products/google-listing/client";
import { createMemoryReceiptStore } from "@/products/google-listing/receipts";

const m = vi.hoisted(() => ({
  rpc: vi.fn(), snapshot: vi.fn(), deps: vi.fn(), record: vi.fn(), add: vi.fn(), mark: vi.fn(), unconfirmed: vi.fn(), mirror: vi.fn(),
}));
vi.mock("@/products/google-listing/tenant-replies", () => ({ defaultTenantReplyDeps: m.deps }));
vi.mock("@/products/publishing/server", () => ({
  publishingEnabledForWorkspace: async () => true,
  authorizePublishingEvent: async () => ({ allowed: true, actor: null, viewer: { operator: false, tester: false } }),
  readPublishingSnapshot: m.snapshot,
}));
vi.mock("@/platform/business-record/service", () => ({ readBusinessRecord: m.record }));
vi.mock("@/platform/owner-entry/linked-sites", () => ({ readLinkedSite: async () => ({ tenantId: "fixture" }) }));
vi.mock("@/platform/infra/auth", () => ({ hasTenantPermission: async () => true }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: m.rpc }) }));
vi.mock("@/platform/infra/tenant-publishing", () => ({ tenantPublishingPorts: async () => ({ addEvent: m.add, markExecutionExternalAccepted: m.mark, markExecutionExternalUnconfirmed: m.unconfirmed, mirrorPublishedReviewReply: m.mirror }) }));
vi.mock("@/platform/account-bindings/store", () => ({ readGoogleBindingForTenant: async () => ({ workspaceId: "5e000000-0000-4000-8000-000000000010", locations: [{ accountId: "account", locationId: "location" }] }) }));
vi.mock("@/products/google-listing/controls", () => ({ readListingControl: async () => ({ paused: false }), noteListingAccess: async () => undefined, setListingPaused: vi.fn() }));
vi.mock("@/products/google-listing/pacing", () => ({ paceGoogleWrites: (client: GoogleListingClient) => client }));

import { changeWorkspaceGoogleReply, executeGoogleListingEvent, prepareGoogleListingDraft, undoWorkspaceGoogleChange } from "@/products/google-listing/workspace";
const originalSystemsRelease = process.env.STRELVA_SYSTEMS_RELEASE;
const originalWorkspaceRelease = process.env.STRELVA_WORKSPACE_RELEASE;
afterEach(() => { if (originalSystemsRelease === undefined) delete process.env.STRELVA_SYSTEMS_RELEASE; else process.env.STRELVA_SYSTEMS_RELEASE = originalSystemsRelease; if (originalWorkspaceRelease === undefined) delete process.env.STRELVA_WORKSPACE_RELEASE; else process.env.STRELVA_WORKSPACE_RELEASE = originalWorkspaceRelease; });
const workspaceId = "5e000000-0000-4000-8000-000000000010";
const actor = { userId: "5e000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const location = { accountId: "account", locationId: "location" };
const event: UnifiedEvent = { id: "google-approval", tenantId: "fixture", source: "google", type: "content_update", title: "Post", body: "Holiday hours", status: "pending", createdAt: "2026-10-07T14:00:00Z", metadata: { kind: "workspace_google_listing_draft", workspaceId, locationId: location.locationId, draft: { action: "post", post: { topicType: "STANDARD", summary: "Holiday hours" } } } };
let client: GoogleListingClient;
beforeEach(() => {
  vi.resetAllMocks();
  process.env.STRELVA_SYSTEMS_RELEASE = "1";
  process.env.STRELVA_WORKSPACE_RELEASE = "1";
  m.rpc.mockResolvedValue({ data: true, error: null });
  m.snapshot.mockResolvedValue({ bindings: [{ id: "5e000000-0000-4000-8000-000000000020", originTenantId: "fixture", locations: [{ locationId: "location" }] }] });
  let reply: string | null = null;
  client = {
    createPost: vi.fn(async () => ({ ok: true as const, data: { name: "accounts/account/locations/location/localPosts/post" } })),
    getPost: vi.fn(async () => ({ ok: true as const, data: { name: "accounts/account/locations/location/localPosts/post", summary: "Holiday hours", state: "LIVE" as const } })),
    getReview: vi.fn(async () => ({ ok: true as const, data: { reviewId: "review", ...(reply ? { reviewReply: { comment: reply } } : {}) } })),
    updateReply: vi.fn(async (_loc: unknown, _review: string, text: string) => { reply = text; return { ok: true as const, data: { comment: text } }; }),
    deleteReply: vi.fn(async () => { reply = null; return { ok: true as const, data: null }; }),
    getLocation: vi.fn(async () => ({ ok: true as const, data: {} as GoogleLocationState })),
    patchLocation: vi.fn(), listReviews: vi.fn(), deletePost: vi.fn(),
  };
  const receipts = createMemoryReceiptStore();
  m.deps.mockResolvedValue({ bindingTarget: async () => ({ workspaceId }), grant: async () => ({ status: "connected", bindingId: "5e000000-0000-4000-8000-000000000020" }), accessToken: async () => "fictional", client: () => client, receipts: () => receipts });
  m.record.mockResolvedValue({ access: "owner", revision: 2, facts: {} });
  m.add.mockImplementation(async value => ({ ...value, id: "draft", createdAt: "2026-10-07T14:00:00Z" }));
});
const execute = (attemptId: string) => executeGoogleListingEvent({ tenantId: "fixture", event, actorId: actor.userId, attemptId });

describe("Google approval recovery", () => {
  it("native Google authoring and execution reuse approval receipts, read-back and undo", async () => {
    const tenantId = `workspace-${workspaceId}`;
    m.snapshot.mockResolvedValue({ bindings: [{ originTenantId: null, locations: [{ locationId: "location" }] }] });
    const draft = await prepareGoogleListingDraft(actor, { workspaceId, tenantId, locationId: "location", kind: "post", post: { topicType: "STANDARD", summary: "Holiday hours" } });
    expect(client.createPost).not.toHaveBeenCalled();
    expect(draft).toMatchObject({ tenantId, status: "pending", metadata: { workspaceId } });
    const input = { tenantId, event: draft, actorId: actor.userId, attemptId: "native-attempt" };
    const result = await executeGoogleListingEvent(input);
    expect(result).toMatchObject({ accepted: true, verified: true });
    expect(await executeGoogleListingEvent({ ...input, attemptId: "retry" })).toMatchObject({ accepted: true });
    expect(client.createPost).toHaveBeenCalledOnce();
    vi.mocked(client.deletePost).mockResolvedValue({ ok: true, data: null });
    vi.mocked(client.getPost).mockResolvedValue({ ok: false, kind: "not_found", status: 404, detail: "Deleted" });
    expect(await undoWorkspaceGoogleChange(actor, { workspaceId, tenantId, locationId: "location", receiptId: result!.receiptId! })).toMatchObject({ status: "posted" });
    expect(client.deletePost).toHaveBeenCalledOnce();
  });
  it("native Google refuses another business scope and non-owner authoring", async () => {
    m.snapshot.mockResolvedValue({ bindings: [{ originTenantId: null, locations: [{ locationId: "location" }] }] });
    m.record.mockResolvedValue({ access: "admin", revision: 2, facts: {} });
    await expect(prepareGoogleListingDraft(actor, { workspaceId, tenantId: `workspace-${workspaceId}`, locationId: "location", kind: "post", post: { topicType: "STANDARD", summary: "Copy" } })).rejects.toThrow("authorized owner");
    m.record.mockResolvedValue({ access: "owner", revision: 2, facts: {} });
    await expect(prepareGoogleListingDraft(actor, { workspaceId, tenantId: "workspace-5e000000-0000-4000-8000-000000000099", locationId: "location", kind: "post", post: { topicType: "STANDARD", summary: "Copy" } })).rejects.toThrow("authorized owner");
    expect(m.add).not.toHaveBeenCalled();
  });
  it("never recreates a post on a new attempt after the acceptance marker fails", async () => {
    m.mark.mockRejectedValue(new Error("Marker store unavailable"));
    expect(await execute("first")).toMatchObject({ accepted: true, verified: false });
    expect(await execute("second")).toMatchObject({ accepted: false, reason: "google_write_unconfirmed" });
    expect(client.createPost).toHaveBeenCalledTimes(1);
  });
  it("never repeats an uncertain dispatch even when saving its uncertainty fails", async () => {
    vi.mocked(client.createPost).mockRejectedValue(new Error("Response lost"));
    m.unconfirmed.mockRejectedValue(new Error("Marker store unavailable"));
    await expect(execute("first")).rejects.toThrow("Marker store unavailable");
    expect(await execute("second")).toMatchObject({ accepted: false, reason: "google_write_unconfirmed" });
    expect(client.createPost).toHaveBeenCalledTimes(1);
  });
  it("replays an accepted post without sending again", async () => {
    expect(await execute("first")).toMatchObject({ accepted: true, verified: true });
    expect(await execute("second")).toMatchObject({ accepted: true, verified: true });
    expect(client.createPost).toHaveBeenCalledTimes(1);
  });
  it("retries a definitive rejection but never repeats its accepted retry", async () => {
    vi.mocked(client.createPost).mockResolvedValueOnce({ ok: false, kind: "auth", status: 403, detail: "Permission denied" });
    expect(await execute("first")).toMatchObject({ accepted: false });
    expect(await execute("second")).toMatchObject({ accepted: true });
    expect(await execute("third")).toMatchObject({ accepted: true });
    expect(client.createPost).toHaveBeenCalledTimes(2);
  });
  it("does not dispatch again when the accepted retry loses its marker", async () => {
    vi.mocked(client.createPost).mockResolvedValueOnce({ ok: false, kind: "auth", status: 403, detail: "Permission denied" });
    expect(await execute("first")).toMatchObject({ accepted: false });
    m.mark.mockRejectedValue(new Error("Marker store unavailable"));
    expect(await execute("second")).toMatchObject({ accepted: true, verified: false });
    expect(await execute("third")).toMatchObject({ accepted: false, reason: "google_write_unconfirmed" });
    expect(client.createPost).toHaveBeenCalledTimes(2);
  });
  it("prepares a revision-bound hours clear, while manual absent-hours preparation refuses", async () => {
    const draft = await prepareGoogleListingDraft(actor, { workspaceId, tenantId: "fixture", locationId: "location", kind: "hours", expectedRecordRevision: 2 });
    expect(draft.metadata?.draft).toEqual({ action: "hours", hours: null });
    await expect(prepareGoogleListingDraft(actor, { workspaceId, tenantId: "fixture", locationId: "location", kind: "hours" })).rejects.toThrow();
  });
  it("lets a new owner command restore the same reply after withdrawal", async () => {
    const input = { workspaceId, tenantId: "fixture", locationId: "location", reviewId: "review", text: "Thank you.", withdraw: false, commandId: "5e000000-0000-4000-8000-000000000011" };
    expect((await changeWorkspaceGoogleReply(actor, input)).status).toBe("posted");
    await changeWorkspaceGoogleReply(actor, { ...input, withdraw: true, commandId: "5e000000-0000-4000-8000-000000000012" });
    expect((await changeWorkspaceGoogleReply(actor, { ...input, commandId: "5e000000-0000-4000-8000-000000000013" })).status).toBe("posted");
    expect(client.updateReply).toHaveBeenCalledTimes(2);
    expect(client.deleteReply).toHaveBeenCalledTimes(1);
  });
});


describe("Google location Version approval dispatch", () => {
  async function versionEvent() {
    const { systemOriginId } = await import("@/platform/systems");
    const { canonicalJson, sha256 } = await import("@/platform/business-record/tenant-import");
    const definition = { kind: "google_listing", post: { topicType: "STANDARD", summary: "Holiday hours" } };
    const systemId = systemOriginId(workspaceId, { kind: "google_location", ref: "5e000000-0000-4000-8000-000000000020:location" });
    const lineage = { id: "5e000000-0000-4000-8000-000000000030", version: { businessId: workspaceId, systemId }, source: { businessId: workspaceId, systemId: "5e000000-0000-4000-8000-000000000040" }, context: { kind: "location", label: "Camillus" }, baseline: { revision: 2, definition }, overrides: [], bindings: [], localData: {}, releases: [], currentRelease: null, decisions: [], grants: [], rowRevision: 2, createdBy: actor.userId, createdAt: "2026-10-07", updatedAt: "2026-10-07" };
    m.rpc.mockImplementation(async name => ({ data: name === "read_system_version" ? lineage : name === "read_workspace_release_flags" ? { workspaceId, flags: {}, testers: [] } : true, error: null }));
    const approvedEvent = { ...event, metadata: { ...event.metadata, version: { versionId: lineage.id, systemId, bindingId: "5e000000-0000-4000-8000-000000000020", rowRevision: 2, definitionDigest: sha256(canonicalJson(definition)), preparedBy: actor } } };
    return { lineage, event: approvedEvent };
  }
  it("freezes per-location hours from the Version without changing the business record", async () => {
    const v = await versionEvent();
    const hours = { timezone: "America/New_York", weekly: [{ day: 1, opens: "10:00", closes: "18:00" }] };
    const { canonicalJson, sha256 } = await import("@/platform/business-record/tenant-import");
    const definition = { ...v.lineage.baseline.definition, hours };
    v.lineage.baseline.definition = definition;
    const pin = { ...v.event.metadata.version, definitionDigest: sha256(canonicalJson(definition)) };
    const prepared = await prepareGoogleListingDraft(actor, { workspaceId, tenantId: "fixture", locationId: "location", kind: "hours" }, { pin, hours });
    expect(prepared.metadata?.draft).toEqual({ action: "hours", hours });
    expect(prepared.metadata?.version).toEqual(pin);
    expect(client.patchLocation).not.toHaveBeenCalled();
  });
  it("dispatches a sessionless owner approval with its own receipt and read-back, once", async () => {
    const v = await versionEvent();
    const input = { tenantId: "fixture", event: v.event, actorId: "owner-link:owner@example.test", attemptId: "first" };
    expect(await executeGoogleListingEvent(input)).toMatchObject({ accepted: true, verified: true, receiptId: expect.any(String) });
    expect(await executeGoogleListingEvent({ ...input, attemptId: "second" })).toMatchObject({ accepted: true, verified: true });
    expect(client.createPost).toHaveBeenCalledTimes(1);
    expect(client.getPost).toHaveBeenCalledTimes(1);
  });
  it("refuses a changed Version before dispatch", async () => {
    const v = await versionEvent();
    v.lineage.rowRevision = 3;
    expect(await executeGoogleListingEvent({ tenantId: "fixture", event: v.event, actorId: actor.userId, attemptId: "first" })).toMatchObject({ accepted: false, reason: expect.stringContaining("Version changed") });
    expect(client.createPost).not.toHaveBeenCalled();
  });
  it("refuses when the Systems gate is off, even with a Google approval", async () => {
    const v = await versionEvent();
    process.env.STRELVA_SYSTEMS_RELEASE = "0";
    expect(await executeGoogleListingEvent({ tenantId: "fixture", event: v.event, actorId: actor.userId, attemptId: "first" })).toMatchObject({ accepted: false });
    expect(client.createPost).not.toHaveBeenCalled();
  });
  it("settles an accepted write with failed read-back without repeating the post", async () => {
    const v = await versionEvent();
    vi.mocked(client.getPost).mockRejectedValue(new Error("Read-back unavailable"));
    const input = { tenantId: "fixture", event: v.event, actorId: "owner-link:owner@example.test", attemptId: "first" };
    expect(await executeGoogleListingEvent(input)).toMatchObject({ accepted: true, verified: false });
    expect(await executeGoogleListingEvent({ ...input, attemptId: "second" })).toMatchObject({ accepted: true, verified: false });
    expect(client.createPost).toHaveBeenCalledTimes(1);
  });
});

it("refuses an old client when the authorized binding is replaced during pacing",async()=>{
 const {paceGoogleWrites}=await vi.importActual<typeof import("@/products/google-listing/pacing")>("@/products/google-listing/pacing");
 const bindingA="5e000000-0000-4000-8000-000000000020",bindingB="5e000000-0000-4000-8000-000000000021";
 let current=bindingA;
 const rawCreate=vi.fn(async()=>({ok:true as const,data:{name:"post"}}));
 const pacing={limited:vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false),wait:async()=>{current=bindingB;}};
 const receipts=createMemoryReceiptStore();
 const ctx={workspaceId,bindingId:bindingA,location,lifecycle:"live" as const,client:paceGoogleWrites({...client,createPost:rawCreate},workspaceId,location.locationId,pacing),receipts};
 const authorize=vi.fn(async()=>({allowed:true as const,bindingId:current,actor,viewer:{operator:false,tester:false}}));
 const result=await executeGoogleListingEvent({tenantId:"fixture",event,actorId:"make-real-service:session:decision",attemptId:"reconnect"},{authorize,context:async()=>ctx,maintenance:vi.fn(),events:async()=>({markExecutionExternalAccepted:m.mark,markExecutionExternalUnconfirmed:m.unconfirmed}) as never,noteAccess:vi.fn()});
 expect(result).toMatchObject({accepted:false});expect(rawCreate).not.toHaveBeenCalled();expect(receipts.all()[0]).toMatchObject({status:"failed",undo:null});
 expect(authorize).toHaveBeenCalledTimes(4);
});

it("rechecks maintenance inside pacing rather than bypassing it through a scoped client",async()=>{
 const {paceGoogleWrites}=await vi.importActual<typeof import("@/products/google-listing/pacing")>("@/products/google-listing/pacing");
 const previous=process.env.STRELVA_BUNDLE_MAINTENANCE_RELEASE;process.env.STRELVA_BUNDLE_MAINTENANCE_RELEASE="1";
 try {
  let valid=true;const rawUpdate=vi.fn(async()=>({ok:true as const,data:{comment:"Approved"}}));
  const pacing={limited:vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false),wait:async()=>{valid=false;}};
  const receipts=createMemoryReceiptStore();const bindingId="5e000000-0000-4000-8000-000000000020";
  const ctx={workspaceId,bindingId,location,lifecycle:"live" as const,client:paceGoogleWrites({...client,updateReply:rawUpdate},workspaceId,location.locationId,pacing),receipts};
  const maintenance=vi.fn(async()=>{if(!valid)throw new Error("maintenance withdrawn");});
  const approval={...event,metadata:{...event.metadata,draft:{action:"reply",reviewId:"review",text:"Approved"},maintenance:{preparationId:workspaceId,bindingId}}};
  const result=await executeGoogleListingEvent({tenantId:"fixture",event:approval,actorId:actor.userId,attemptId:"maintenance-wait"},{authorize:async()=>({allowed:true,actor,viewer:{operator:false,tester:false}}),context:async()=>ctx,maintenance,events:async()=>({markExecutionExternalAccepted:m.mark,markExecutionExternalUnconfirmed:m.unconfirmed}) as never,noteAccess:vi.fn()});
  expect(result).toMatchObject({accepted:false});expect(rawUpdate).not.toHaveBeenCalled();expect(receipts.all()[0]).toMatchObject({status:"failed"});
  expect(maintenance).toHaveBeenCalledTimes(5);
 } finally {if(previous===undefined)delete process.env.STRELVA_BUNDLE_MAINTENANCE_RELEASE;else process.env.STRELVA_BUNDLE_MAINTENANCE_RELEASE=previous;}
});
it.each(["marker","receipt"])("preserves scoped-client acceptance when %s persistence fails",async(failure)=>{
 const {paceGoogleWrites}=await vi.importActual<typeof import("@/products/google-listing/pacing")>("@/products/google-listing/pacing");
 const receipts=createMemoryReceiptStore();if(failure==="receipt")vi.spyOn(receipts,"settle").mockRejectedValue(new Error("receipt unavailable"));else m.mark.mockRejectedValue(new Error("marker unavailable"));
 const rawCreate=vi.fn(async()=>({ok:true as const,data:{name:"post"}}));
 const ctx={workspaceId,bindingId:"5e000000-0000-4000-8000-000000000020",location,lifecycle:"live" as const,client:paceGoogleWrites({...client,createPost:rawCreate},workspaceId,location.locationId,{limited:async()=>false,wait:async()=>undefined}),receipts};
 const deps={authorize:async()=>({allowed:true as const,actor,viewer:{operator:false,tester:false}}),context:async()=>ctx,maintenance:vi.fn(),events:async()=>({markExecutionExternalAccepted:m.mark,markExecutionExternalUnconfirmed:m.unconfirmed}) as never,noteAccess:vi.fn()};
 const input={tenantId:"fixture",event,actorId:actor.userId,attemptId:"accepted"};
 expect(await executeGoogleListingEvent(input,deps)).toMatchObject({accepted:true,verified:false});
 expect(await executeGoogleListingEvent({...input,attemptId:"retry"},deps)).toMatchObject({accepted:false,reason:"google_write_unconfirmed"});
 expect(rawCreate).toHaveBeenCalledTimes(1);
});
