import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InquiryEngine } from "@/products/inquiries/inquiry-engine";
import { InMemoryInquiryRepository } from "@/products/inquiries/repository";
import { composeAskInquiryFollowUp, approveAskInquiryFollowUp, followUpTryView } from "@/products/inquiries/ask-follow-up";
import { prepareAskInquiryFollowUp } from "@/app/api/workspace/ask/inquiry-follow-up-possibility-server";
import { executeInquiryPublication } from "@/products/inquiries/publication";
import { createInquiryFormAdapter, type InquiryFormPorts } from "@/platform/make-real/live-adapters";
import type { SystemStore } from "@/platform/systems/store";
import type { BusinessSystems } from "@/platform/systems/from-existing";
import type { AskPossibilityInput } from "@/platform/ask/ports";

const workspaceId = "60000000-0000-4000-8000-000000000001";
const systemId = "60000000-0000-4000-8000-000000000002";
const stableId = "60000000-0000-4000-8000-000000000003";
const originId = "60000000-0000-4000-8000-000000000004";
const revisionId = "60000000-0000-4000-8000-000000000005";
const seed = "60000000-0000-4000-8000-000000000006";
const actor = { userId: "60000000-0000-4000-8000-000000000007", verifiedEmail: "owner@example.invalid" };
const at = "2026-10-07T16:00:00.000Z";
const rule = { kind: "inquiry-follow-up-rule" as const, afterMinutes: 2880, maxAttempts: 2, messageTemplate: "Hi {name}, this is Strelva. Would you like more help with your request?" };
async function fixture() {
  const repository = new InMemoryInquiryRepository();
  const engine = new InquiryEngine({ businessId: workspaceId, now: () => at, livePublisher: { publish: async () => ({ status: "accepted", acceptanceId: "fixture-native-live", acceptedAt: at }) } });
  const work = engine.start({ actorId: actor.userId, intent: "Handle incoming requests and follow up after a day", destination: "team@example.invalid", emailConnection: { status: "connected", consent: "explicit", lastCheckedAt: at } });
  engine.acceptShape(work.id, { actorId: actor.userId });
  engine.runRehearsal(work.id);
  engine.approvePublish(work.id, { actorId: actor.userId });
  await engine.publish(work.id, { actorId: actor.userId, version: engine.getWork(work.id).draft!.version, explicit: true });
  engine.recordPublishVerification(work.id, { actorId: actor.userId, version: engine.getWork(work.id).draft!.version, verified: true, evidence: ["Fictional exact native configuration"] });
  await repository.compareAndSwap({ tenantId: "fixture-site", businessId: workspaceId, expectedRevision: null, state: engine.snapshot() });
  const originalRead = repository.getSnapshot.bind(repository);
  vi.spyOn(repository, "getSnapshot").mockImplementation(async (tenant, business) => { const snapshot = await originalRead(tenant,business); return snapshot ? { ...snapshot, tenantStableId: stableId } : null; });
  const snapshot = (await repository.getSnapshot("fixture-site", workspaceId))!;
  const baseline = { businessId: workspaceId, systemId, revisionId, number: 1 };
  const inquiry = { system: { id: systemId, businessId: workspaceId, name: "Inquiries", kind: "inquiry", lifecycle: "live", currentRevision: baseline, origin: { kind: "inquiry_workspace", ref: originId } }, provenance: "stored", references: { tenantStableId: stableId, tenantId: null, savedWorkId: null } };
  const listing = { businessId: workspaceId, systems: [inquiry, { system: { kind: "website" }, references: { tenantStableId: stableId, tenantId: "fixture-site" } }], connections: [] } as unknown as BusinessSystems;
  const store = { readSystem: vi.fn(async () => ({ system: inquiry.system, revisions: [{ id: revisionId, implementation: { kind: "inquiry_config", ref: `${originId}@${snapshot.revision}` } }] })) } as unknown as SystemStore;
  const input: AskPossibilityInput = { workspaceId, systemId, title: "A gentler follow-up rule", intent: "Compare a two-day follow-up", introduces: null, check: "Review full timing and wording", candidate: rule };
  const deps = { mayBeOn: () => true, enabled: vi.fn(async () => true), store, list: vi.fn(async () => listing), repository, now: () => at };
  const prepare = () => prepareAskInquiryFollowUp(actor,input,seed,deps);
  return { repository,snapshot,work,input,deps,prepare };
}

describe("Ask's native Inquiry follow-up alternative", () => {
  beforeEach(() => { vi.stubEnv("STRELVA_INQUIRIES_RELEASE", "1"); vi.stubEnv("STRELVA_WORKSPACES_RELEASE", "0"); });
  afterEach(() => vi.unstubAllEnvs());
  it("persists a genuine exact candidate and real isolated rehearsal without touching native/live state", async () => {
    const f = await fixture(); const save = vi.spyOn(f.repository,"compareAndSwap");
    const before = structuredClone(f.snapshot);
    const prepared = await f.prepare(); const content = prepared.content;
    expect(content.rehearsal.externalWritesBlocked).toBe(true); expect(content.rehearsal.nothingLive).toBe(true); expect(content.rehearsal.passed).toBe(true);
    expect(content.draft!.form).toEqual(before.state.capabilities[0]!.live!.form);
    expect(content.draft!.routing).toEqual(before.state.capabilities[0]!.live!.routing);
    expect(content.draft!.connections).toEqual(before.state.capabilities[0]!.live!.connections);
    expect(content.draft!.followUp).toMatchObject({ afterMinutes: rule.afterMinutes, maxAttempts: rule.maxAttempts, messageTemplate: rule.messageTemplate });
    expect(await f.repository.getSnapshot("fixture-site",workspaceId)).toEqual(before); expect(save).not.toHaveBeenCalled();
    expect(prepared.changes[0]!.baseline.revisionId).toBe(revisionId); expect(prepared.effects[0]!.channel).toBe("inquiry_form");
    expect(followUpTryView(content.selection,content.draft,content.rehearsal)?.messageTemplate).toBe(rule.messageTemplate);
    const bad = structuredClone(content.rehearsal); bad.externalWritesBlocked = false;
    expect(followUpTryView(content.selection,content.draft,bad)).toBeNull();
  });
  it.each(["global", "row"])("%s flag off stops before native lookup/authority/write", async mode => {
    const f = await fixture(); f.repository.getSnapshot = vi.fn(); const list = vi.fn();
    await expect(prepareAskInquiryFollowUp(actor,f.input,seed,{ ...f.deps, list, mayBeOn: () => mode !== "global", enabled: async () => false })).rejects.toThrow("not enabled");
    expect(list).not.toHaveBeenCalled(); expect(f.repository.getSnapshot).not.toHaveBeenCalled();
    const authorize = vi.fn(); const save = vi.fn();
    await expect(approveAskInquiryFollowUp(actor,{}, { repository:f.repository,authorize,save, mayBeOn: () => false })).rejects.toThrow("not enabled");
    expect(authorize).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  });
  it("refuses derived legacy, another tenant, stale native revision and missing source/consent", async () => {
    const f = await fixture(); const listing = await f.deps.list();
    const legacy = structuredClone(listing); legacy.systems[0]!.provenance = "existing";
    await expect(prepareAskInquiryFollowUp(actor,f.input,seed,{...f.deps,list:async()=>legacy})).rejects.toThrow("persisted native");
    const foreign = structuredClone(listing); foreign.systems[0]!.references.tenantStableId = "60000000-0000-4000-8000-000000000009";
    await expect(prepareAskInquiryFollowUp(actor,f.input,seed,{...f.deps,list:async()=>foreign})).rejects.toThrow("persisted native");
    const read = f.deps.store.readSystem; vi.mocked(read).mockRejectedValueOnce(new Error("authority revoked")); await expect(f.prepare()).rejects.toThrow("authority revoked");
    const stale = structuredClone(f.snapshot); stale.revision++;
    await expect(prepareAskInquiryFollowUp(actor,f.input,seed,{...f.deps,repository:{...f.repository,getSnapshot:async()=>stale} as unknown as InMemoryInquiryRepository})).rejects.toThrow("native configuration");
    const noSource = structuredClone(f.snapshot); noSource.state.requests = [];
    expect(()=>composeAskInquiryFollowUp(noSource,{rule,actorId:actor.userId,seed,at})).toThrow("source draft");
    const noConsent = structuredClone(f.snapshot); noConsent.state.capabilities[0]!.live!.connections[0]!.consent = "missing";
    expect(()=>composeAskInquiryFollowUp(noConsent,{rule,actorId:actor.userId,seed,at})).toThrow("consented");
  });
  it("only owner-reviewed MakeReal saves native exact approval, then real internal publication applies the rule once", async () => {
    const f=await fixture(); const prepared=await f.prepare(); const selection=prepared.content.selection;
    const save=vi.spyOn(f.repository,"compareAndSwap"); const authorize=vi.fn(async()=>{});
    await approveAskInquiryFollowUp(actor,selection,{repository:f.repository,authorize,save: input => f.repository.compareAndSwap(input),mayBeOn:()=>true,enabled:async()=>true});
    const saved=(await f.repository.getSnapshot("fixture-site",workspaceId))!;
    expect(saved.state.capabilities[0]!.live).toEqual(f.snapshot.state.capabilities[0]!.live);
    expect(saved.state.requests[0]!.publishApproval).toMatchObject({version:selection.version,actorId:actor.userId,explicit:true});
    const claimed=await f.repository.claimPublication({...prepared.effects[0]!.request,tenantId:"fixture-site",businessId:workspaceId,requestId:selection.requestId,capabilityId:selection.capabilityId,changeId:selection.changeId,version:selection.version,action:"make_live",actorId:actor.userId,idempotencyKey:"approved-follow-up"});
    if(!claimed.acquired) throw Error("Fixture claim missing");
    await f.repository.linkPublicationEvent({tenantId:"fixture-site",claimId:claimed.claim.id,claimToken:claimed.claimToken,governanceEventId:"approved-event"});
    expect(await executeInquiryPublication({tenantId:"fixture-site",eventId:"approved-event",claimId:claimed.claim.id,repository:f.repository,actorId:actor.userId,authorizeActor:async()=>({allowed:true})})).toEqual({accepted:true,verified:true});
    const final=(await f.repository.getSnapshot("fixture-site",workspaceId))!;
    expect(final.state.capabilities[0]!.live).toEqual(prepared.content.draft);
    expect(final.state.responsibilities).toEqual(f.snapshot.state.responsibilities);
    save.mockClear(); await approveAskInquiryFollowUp(actor,selection,{repository:f.repository,authorize,save: input => f.repository.compareAndSwap(input),mayBeOn:()=>true,enabled:async()=>true}); expect(save).not.toHaveBeenCalled();
  });
  it("refuses changed live rule/source, a foreign tenant, stale candidate and CAS conflicts before publication", async () => {
    const f=await fixture();const selection=(await f.prepare()).content.selection;const authorize=vi.fn(async()=>{});const save=vi.fn();
    const altered=structuredClone(f.snapshot);altered.state.capabilities[0]!.live!.followUp!.afterMinutes++;
    const repository={getSnapshot:vi.fn(async()=>altered)} as unknown as InMemoryInquiryRepository;
    const deps={repository,authorize,save,mayBeOn:()=>true,enabled:async()=>true};
    await expect(approveAskInquiryFollowUp(actor,selection,deps)).rejects.toThrow("live inquiry rule changed");expect(save).not.toHaveBeenCalled();
    altered.state.capabilities=f.snapshot.state.capabilities;altered.state.requests[0]!.intent="A later source edit";
    await expect(approveAskInquiryFollowUp(actor,selection,deps)).rejects.toThrow("source inquiry work changed");
    vi.mocked(repository.getSnapshot).mockResolvedValue({...f.snapshot,tenantStableId:"60000000-0000-4000-8000-000000000099"});
    await expect(approveAskInquiryFollowUp(actor,selection,deps)).rejects.toThrow("tenant baseline changed");
    vi.mocked(repository.getSnapshot).mockResolvedValue(f.snapshot);
    await expect(approveAskInquiryFollowUp(actor,{...selection,draftHash:"0".repeat(64)},deps)).rejects.toThrow("candidate changed");
    save.mockResolvedValue({changed:false,reason:"conflict",current:f.snapshot});await expect(approveAskInquiryFollowUp(actor,selection,deps)).rejects.toThrow("workspace changed");
  });
  it("fails the live adapter closed when native preparation is absent, and strips alternative payload before queue",async()=>{
    const f=await fixture(); const effect=(await f.prepare()).effects[0]!;
    const queue=vi.fn<InquiryFormPorts["queue"]>(async()=>({claim:{id:"claim",status:"accepted",tenantId:"fixture-site",businessId:workspaceId,requestId:"request",capabilityId:"cap",changeId:"change",version:1},acquired:false,eventId:null}));
    const ports={queue,execute:vi.fn(),claim:vi.fn()};const ctx={actor,enabled:async()=>true};
    const missing=createInquiryFormAdapter(ports,ctx);
    expect((await missing.perform({effect,idempotencyKey:"key",businessId:workspaceId})).status).toBe("rejected");expect(queue).not.toHaveBeenCalled();
    const prepareFollowUp=vi.fn(async()=>{});const wired=createInquiryFormAdapter({...ports,prepareFollowUp},ctx);
    expect((await wired.perform({effect,idempotencyKey:"key",businessId:workspaceId})).status).toBe("accepted");
    expect(queue.mock.calls[0]![0]).not.toHaveProperty("followUpAlternative");expect(prepareFollowUp).toHaveBeenCalledOnce();
  });
});

it("opens a durable same-System Possibility, reaches Ready only for a current exact real rehearsal, and signs complete Try", async () => {
  const f = await fixture();
  const [{ createPossibilityAdapter }, { createInMemoryPossibilityRepository }, { syncAskInquiryFollowUpPossibilities }, { possibilityTryState }, { signPossibilityPreviewToken }] = await Promise.all([
    import("@/platform/ask/ports"), import("@/platform/possibilities/repository"), import("@/experience/systems/stored-possibilities"), import("@/experience/systems/try-state"), import("@/platform/possibilities/preview-link"),
  ]);
  const repository = createInMemoryPossibilityRepository();
  const port = createPossibilityAdapter(repository,{durable:true,newId:()=>seed,now:()=>at,prepare:()=>f.prepare()});
  const opened = await port.open(actor,f.input);
  const p = (await repository.get(workspaceId,opened.id))!;
  expect(p.introduces).toEqual([]);expect(p.changes[0]!.baseline.revisionId).toBe(revisionId);expect(p.status).toBe("exploring");
  const live = { current: async () => ({revisionId,number:1,content:{native:{kind:"inquiry_config",ref:`${originId}@${f.snapshot.revision}`}}}) };
  const deps={repo:repository as unknown as Parameters<typeof syncAskInquiryFollowUpPossibilities>[0]["repo"],live,actorId:actor.userId,at,stored:[{possibility:p,sourceRef:null,lastActivityAt:p.updatedAt}],canWrite:true,current:async()=>true};
  const rows=await syncAskInquiryFollowUpPossibilities(deps);expect(rows[0]!.possibility.status).toBe("ready");
  vi.stubEnv("APPROVE_LINK_SECRET","fictional-test-secret-for-signed-preview-123456789");
  const token=signPossibilityPreviewToken({workspaceId,possibilityId:p.id,candidateRevision:p.candidateRevision},Date.parse(at));
  const state=await possibilityTryState(token,{enabled:async()=>true,read:async()=>rows[0]!.possibility},Date.parse(at));
  expect(state?.kind).toBe("ready");if(state?.kind!=="ready")throw Error("Missing exact signed Try");
  expect(state.view.inquiryFollowUp?.messageTemplate).toBe(rule.messageTemplate);expect(state.view.takesSubmissions).toBe(false);
  const stale=await syncAskInquiryFollowUpPossibilities({...deps,stored:rows,current:async()=>false});expect(stale[0]!.possibility.status).toBe("exploring");
  vi.unstubAllEnvs();
});
