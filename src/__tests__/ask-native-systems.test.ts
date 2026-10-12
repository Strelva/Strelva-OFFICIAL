import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createApplicationService } from "@/products/applications/server";
import { memoryBoundedStore, owner } from "./fixtures/bounded-store";
import { createAskNativeSystemPort } from "@/app/api/workspace/ask/native-systems-server";
import { askNativeChangeSchema, AskNativePreparationIncompleteError } from "@/platform/ask/native-systems";
import { nativeAppItem } from "@/platform/needs-you/sources/application-release";
import { versionReleaseRevision } from "@/platform/needs-you/sources/version-release";
import type { OwnerDecision } from "@/platform/needs-you/contracts";
import type { BusinessSystems } from "@/platform/systems";
import { createInMemoryConnectionOwnership, createInMemoryVersionStore, createSystemVersions } from "@/platform/system-versions";

const workspaceId = "workspace-a", systemId = randomUUID(), versionId = randomUUID(), sourceSystemId = randomUUID();
async function harness() {
  const store = memoryBoundedStore(), service = createApplicationService(store);
  const app = await service.create(owner, workspaceId, { title: "Requests", maintenanceOwner: owner.userId,
    fields: [{ id: "problem", label: "Problem", type: "text", required: true }], components: [{ kind: "form", fields: ["problem"] }] });
  await service.rehearse(owner, app.id, { expectedDesignRevision: 0 });
  await service.publish(owner, app.id, { expectedCandidateRevision: 0, expectedReleaseVersion: null });
  await service.submit(owner, app.id, { expectedReleaseVersion: 1, expectedRecordsRevision: 0, record: { id: "saved-record", values: { problem: "Original accepted record" } } });
  const graph: BusinessSystems = { businessId: workspaceId, systems: [{ system: { id: systemId, businessId: workspaceId,
    name: "Requests", purpose: null, kind: "internal_app", lifecycle: "live", currentRevision: null,
    origin: { kind: "saved_work", ref: app.id }, changeNumber: 1, createdAt: app.createdAt, updatedAt: app.updatedAt },
    provenance: "stored", basis: null, references: { savedWorkId: app.id, tenantStableId: null, tenantId: null } }], connections: [] };
  const sync = vi.fn(async () => {}), revise = vi.fn(service.revise), rehearse = vi.fn(service.rehearse), read = vi.fn(service.read);
  const list = vi.fn(async (): Promise<OwnerDecision[]> => {
    const current = await service.read(owner, app.id);
    const item = nativeAppItem({ id: app.id, workspaceId, title: "Prepared", candidate: current.payload.candidate!, release: current.payload.release ?? null });
    if (!item) return [];
    return [{ ...item, id: randomUUID(), workspaceId, systemId: null, state: "open", detail: item.detail ?? null,
      outcome: null, outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null, deliveryState: "not_sent",
      operatorNote: null, signInRequired: false, adminMayDecide: item.adminMayDecide ?? false, openHref: item.openHref ?? null,
      openedAt: app.createdAt, expiresAt: app.createdAt, reminded1At: null, reminded2At: null, deliveries: [] }];
  });
  const deps = { decisions: { list }, sync, list: vi.fn(async () => graph), version: vi.fn(async () => null),
    read, revise, rehearse, released: vi.fn(async () => true), decisionsReleased: () => true };
  const port = createAskNativeSystemPort(deps);
  const current = await service.read(owner, app.id);
  const input = { workspaceId, systemId, workId: app.id, designRevision: current.payload.candidate!.designRevision,
    versionId: null, rowRevision: null, change: { kind: "field_label" as const, fieldId: "problem", value: "What needs fixing?" } };
  return { app, store, service, deps, port, input, graph };
}

describe("Ask native application canonical preparation", () => {
  it("reads definition/history without exposing records or maintenance identity", async () => {
    const h = await harness(), view = await h.port.read(owner, { workspaceId, systemId });
    expect(view).toMatchObject({ workId: h.app.id, systemId, versionId: null, sourceSystemId: null, currentRelease: 1 });
    expect(JSON.stringify(view)).not.toContain("Original accepted record");
    expect(view.candidate).not.toHaveProperty("maintenanceOwner");
    expect(view.releases).toHaveLength(1);
  });
  it("runs real revise/rehearse and opens only the exact owner decision; live output and records stay unchanged", async () => {
    const h = await harness(), before = await h.service.read(owner, h.app.id);
    const prepared = await h.port.prepare(owner, h.input);
    const after = await h.service.read(owner, h.app.id);
    expect(prepared.routing).toMatchObject({ route: "owner_decides" });
    expect(prepared.decisionSyncPending).toBe(false);
    expect(after.payload.candidate!.spec.fields[0]!.label).toBe("What needs fixing?");
    expect(after.payload.candidate!.rehearsal?.checks.every(check => check.passed)).toBe(true);
    expect(after.payload.release).toEqual(before.payload.release);
    expect(after.payload.records).toEqual(before.payload.records);
    expect(after.payload.candidate!.spec.maintenanceOwner).toBe(owner.userId);
    expect(h.deps.sync).toHaveBeenCalledOnce();
  });
  it.each(["work", "design", "version", "row"])("refuses stale or mismatched %s identity before any candidate writer", async mismatch => {
    const h = await harness();
    const input = { ...h.input, ...(mismatch === "work" ? { workId: randomUUID() } : mismatch === "design" ? { designRevision: 55 } : mismatch === "version" ? { versionId, rowRevision: 1 } : { rowRevision: 1 }) };
    await expect(h.port.prepare(owner, input)).rejects.toThrow();
    expect(h.deps.revise).not.toHaveBeenCalled(); expect(h.deps.rehearse).not.toHaveBeenCalled();
  });
  it("reports saved preparation as incomplete when sync fails, preserving the saved candidate and old release", async () => {
    const h = await harness(); h.deps.sync.mockRejectedValueOnce(new Error("response lost"));
    await expect(h.port.prepare(owner, h.input)).rejects.toBeInstanceOf(AskNativePreparationIncompleteError);
    const after = await h.service.read(owner, h.app.id);
    expect(after.payload.release!.spec.fields[0]!.label).toBe("Problem");
    expect(after.payload.candidate!.spec.fields[0]!.label).toBe("What needs fixing?");
    await expect(h.port.prepare(owner, h.input)).rejects.toThrow("changed");
    expect(h.deps.revise).toHaveBeenCalledOnce();
  });
  it("refuses missing exact owner decision rather than claiming approval readiness", async () => {
    const h = await harness(); h.deps.decisions.list.mockResolvedValueOnce([]);
    await expect(h.port.prepare(owner, h.input)).rejects.toBeInstanceOf(AskNativePreparationIncompleteError);
  });
  it("preserves the native maker gate after current authority is withdrawn", async () => {
    const h = await harness(); h.store.makeSystems = async () => "member";
    await expect(h.port.prepare(owner, h.input)).rejects.toThrow();
    expect((await h.service.read(owner, h.app.id)).payload.candidate!.spec.fields[0]!.label).toBe("Problem");
  });
  it("refuses current foreign System/work scope and release withdrawal", async () => {
    const h = await harness(); h.graph.systems[0]!.system.businessId = "another-workspace";
    await expect(h.port.read(owner, { workspaceId, systemId })).rejects.toThrow();
    expect(h.deps.read).not.toHaveBeenCalled();
    h.deps.released.mockResolvedValueOnce(false);
    await expect(h.port.prepare(owner, h.input)).rejects.toThrow();
    expect(h.deps.revise).not.toHaveBeenCalled();
  });
  it("prepares a Version override through its own exact release authority, without a native candidate bypass", async () => {
    const h = await harness(), app = await h.service.read(owner, h.app.id);
    const version = { versionId, rowRevision: 4, sourceSystemId, workId: app.id, designRevision: app.payload.candidate!.designRevision,
      currentRelease: 1, definition: { kind: "internal_app", title: "Requests", fields: app.payload.candidate!.spec.fields, components: app.payload.candidate!.spec.components }, canManage: true };
    const decisionId = randomUUID();
    h.deps.decisions.list.mockImplementationOnce(async () => [{ id: decisionId, workspaceId, systemId, kind: "system.change_live", route: "owner_decides", title: "Put live", detail: null, approveEffect: "Release", notYetEffect: "Wait", sourceLifecycle: "version_release", sourceId: versionId, revisionHash: versionReleaseRevision(versionId, 5), urgent: false, state: "open", outcome: null, outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null, deliveryState: "not_sent", operatorNote: null, signInRequired: false, adminMayDecide: false, openHref: null, openedAt: app.createdAt, expiresAt: app.createdAt, reminded1At: null, reminded2At: null, deliveries: [] }]);
    const manageVersion = vi.fn(async (_actor: typeof owner, input: { action: string }) => input.action === "override"
      ? { outcome: "saved" as const, rowRevision: 5, receipt: null }
      : { outcome: "prepared" as const, rowRevision: 5, receipt: { receiptId: randomUUID(), decisionId, workspaceId, versionId, rowRevision: 5 } });
    const port = createAskNativeSystemPort({ ...h.deps, version: async () => version, manageVersion });
    expect(await port.read(owner, { workspaceId, systemId })).toMatchObject({ sourceSystemId, versionId, workId: app.id, rowRevision: 4 });
    const result = await port.prepare(owner, { ...h.input, versionId, rowRevision: 4 });
    expect(result).toMatchObject({ versionId, rowRevision: 5, routing: { route: "owner_decides" } });
    expect(manageVersion.mock.calls[0]![1]).toMatchObject({ action: "override", systemId, versionId, rowRevision: 4, path: "fields", value: [expect.objectContaining({ id: "problem", label: "What needs fixing?", type: "text", required: true })] });
    expect(manageVersion.mock.calls[1]![1]).toMatchObject({ action: "prepare_release", rowRevision: 5 });
    expect(h.deps.revise).not.toHaveBeenCalled(); expect(h.deps.rehearse).not.toHaveBeenCalled();
  });
  it("rejects records, executable code, maintenance and account changes at the tool boundary", () => {
    const input = { workId: randomUUID(), designRevision: 0, versionId: null, rowRevision: null, change: { kind: "title", value: "New title" } };
    for (const key of ["records", "script", "maintenanceOwner", "accounts"]) expect(askNativeChangeSchema.safeParse({ ...input, [key]: {} }).success).toBe(false);
    expect(askNativeChangeSchema.safeParse({ ...input, change: { kind: "field_type", value: "number" } }).success).toBe(false);
  });
  it("executes the actual Version array override and preserves the immutable source definition", async () => {
    const h = await harness(), app = await h.service.read(owner, h.app.id);
    const store = createInMemoryVersionStore(), versions = createSystemVersions({ store, connections: createInMemoryConnectionOwnership({}) });
    const actor = { userId: owner.userId, memberships: [{ businessId: workspaceId, role: "owner" as const }] };
    const definition = { kind: "internal_app", title: "Requests", fields: app.payload.candidate!.spec.fields, components: app.payload.candidate!.spec.components };
    const source = await versions.publishSourceRevision(actor, { source: { businessId: workspaceId, systemId: sourceSystemId }, definition, summary: "Native requests", requires: { bindingKinds: [] } });
    const lineage = await versions.createVersion(actor, { source: source.source, version: { businessId: workspaceId, systemId }, context: { kind: "location", label: "Buffalo" } });
    const fields = structuredClone(app.payload.candidate!.spec.fields); fields[0]!.label = "What needs fixing?";
    const changed = await versions.setOverride(actor, lineage.id, { path: "fields", value: fields, expectedRowRevision: lineage.rowRevision });
    const view = await versions.readVersion(actor, changed.id);
    expect(view.workingDefinition.fields).toEqual(fields);
    expect((await store.getRevision(actor, source.source, 1))!.definition.fields).toEqual(definition.fields);
    expect(changed.version.systemId).toBe(systemId); expect(changed.source.systemId).toBe(sourceSystemId);
  });
});

describe("independent exact candidate post-writer read admission",()=>{
 it("refuses another candidate returned by revise's separate post-RPC read",async()=>{
  const h=await harness();
  h.deps.revise.mockImplementationOnce(async(actor,id,input)=>{
   const saved=await h.service.revise(actor,id,input);
   const spec=structuredClone(saved.payload.candidate!.spec);
   spec.fields.push({id:"other_actor_field",label:"Another concurrent edit",type:"text",required:false});
   await h.service.revise(actor,id,{expectedDesignRevision:saved.payload.candidate!.designRevision,spec});
   return h.service.read(actor,id);
  });
  await expect(h.port.prepare(owner,h.input)).rejects.toBeInstanceOf(AskNativePreparationIncompleteError);
  expect(h.deps.rehearse).not.toHaveBeenCalled();
  expect(h.deps.sync).not.toHaveBeenCalled();
  expect(h.deps.decisions.list).not.toHaveBeenCalled();
  const current=await h.service.read(owner,h.app.id);
  expect(current.payload.candidate!.spec.fields.some(field=>field.id==="other_actor_field")).toBe(true);
  expect(current.payload.release!.spec.fields).toHaveLength(1);
  expect(current.payload.records[0]!.values.problem).toBe("Original accepted record");
 });
 it("refuses another rehearsed candidate returned by rehearsal's separate post-RPC read",async()=>{
  const h=await harness();
  h.deps.rehearse.mockImplementationOnce(async(actor,id,input)=>{
   const own=await h.service.rehearse(actor,id,input);
   const spec=structuredClone(own.payload.candidate!.spec);
   spec.fields.push({id:"other_actor_field",label:"Another concurrent edit",type:"text",required:false});
   const newer=await h.service.revise(actor,id,{expectedDesignRevision:own.payload.candidate!.designRevision,spec});
   await h.service.rehearse(actor,id,{expectedDesignRevision:newer.payload.candidate!.designRevision});
   return h.service.read(actor,id);
  });
  await expect(h.port.prepare(owner,h.input)).rejects.toBeInstanceOf(AskNativePreparationIncompleteError);
  expect(h.deps.sync).not.toHaveBeenCalled();
 });
});
