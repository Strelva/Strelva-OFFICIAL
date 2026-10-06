import { describe, expect, it } from "vitest";
import { WorkspaceAccessError, type WorkspaceActor } from "@/platform/workspaces/types";
import { createMemorySystemStore, type SystemAccess, type SystemStore } from "@/platform/systems";

/** The contract every SystemStore meets. Runs here on the in-memory store;
 * the same rules run on Postgres in tests/systems-schema.sql. */

const JUNIPER = "5e000000-0000-4000-8000-000000000010";
const OTHER = "5e000000-0000-4000-8000-000000000011";
const CATERING = "5e000000-0000-4000-8000-000000000014";
const EXITED = "5e000000-0000-4000-8000-000000000013";
const owner: WorkspaceActor = { userId: "5e000000-0000-4000-8000-000000000001", verifiedEmail: "sy-owner@example.test" } as WorkspaceActor;
const member: WorkspaceActor = { userId: "5e000000-0000-4000-8000-000000000002", verifiedEmail: "sy-member@example.test" } as WorkspaceActor;
const otherOwner: WorkspaceActor = { userId: "5e000000-0000-4000-8000-000000000004", verifiedEmail: "sy-other@example.test" } as WorkspaceActor;

const ROLES: Record<string, Record<string, SystemAccess>> = {
  [JUNIPER]: { [owner.userId]: "owner", [member.userId]: "member" },
  [CATERING]: { [owner.userId]: "owner" },
  [EXITED]: { [owner.userId]: "owner" },
  [OTHER]: { [otherOwner.userId]: "owner" },
};

let commandSeq = 0;
const command = () => `5e000000-0000-4000-8000-${String(++commandSeq).padStart(12, "0")}`;

function makeStore(): SystemStore {
  const stopped = new Set<string>();
  const store = createMemorySystemStore({
    access: (actor, businessId) => ROLES[businessId]?.[actor.userId] ?? null,
    stopped: (businessId) => stopped.has(businessId),
  });
  (store as SystemStore & { stop: (id: string) => void }).stop = (id) => stopped.add(id);
  return store;
}

async function liveProposal(store: SystemStore) {
  const created = await store.createSystem(owner, JUNIPER, { name: "Catering proposal", kind: "proposal" }, command());
  const ref = { businessId: JUNIPER, systemId: created.id };
  const { system } = await store.recordRevision(owner, ref, 1, { implementation: { kind: "proposal_document", ref: "doc:2026" } }, command());
  return { ref, system: await store.transitionLifecycle(owner, ref, system.changeNumber, "live") };
}

describe("SystemStore contract (memory)", () => {
  it("lets members read and only owners/admins/agency write", async () => {
    const store = makeStore();
    await expect(store.readGraph(member, JUNIPER)).resolves.toMatchObject({ systems: [], connections: [] });
    await expect(store.createSystem(member, JUNIPER, { name: "Quote", kind: "proposal" }, command())).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(store.readGraph(otherOwner, JUNIPER)).rejects.toBeInstanceOf(WorkspaceAccessError);
  });

  it("hides a System from another business even by id", async () => {
    const store = makeStore();
    const { ref } = await liveProposal(store);
    await expect(store.readSystem(otherOwner, { businessId: OTHER, systemId: ref.systemId })).rejects.toBeInstanceOf(WorkspaceAccessError);
  });

  it("replays a command and refuses a reused id with a different body", async () => {
    const store = makeStore();
    const id = command();
    const first = await store.createSystem(owner, JUNIPER, { name: "Pricing", kind: "pricing" }, id);
    const again = await store.createSystem(owner, JUNIPER, { name: "Pricing", kind: "pricing" }, id);
    expect(again.id).toBe(first.id);
    await expect(store.createSystem(owner, JUNIPER, { name: "Prices", kind: "pricing" }, id))
      .rejects.toMatchObject({ code: "system_command_conflict" });
    expect((await store.readGraph(owner, JUNIPER)).systems).toHaveLength(1);
  });

  it("guards changes with the change number", async () => {
    const store = makeStore();
    const { ref, system } = await liveProposal(store);
    await expect(store.updateSystem(owner, ref, system.changeNumber - 1, { name: "Stale" })).rejects.toMatchObject({ code: "system_change_conflict" });
    const portal = await store.updateSystem(owner, ref, system.changeNumber, { kind: "portal" });
    expect(portal).toMatchObject({ id: ref.systemId, businessId: JUNIPER, kind: "portal", lifecycle: "live" });
  });

  it("keeps issued and accepted outputs on the revision that produced them", async () => {
    const store = makeStore();
    const { ref, system } = await liveProposal(store);
    const output = await store.issueOutput(owner, ref, { kind: "proposal", title: "Smith wedding", snapshotHash: "a".repeat(64) }, command());
    const { system: moved } = await store.recordRevision(owner, ref, system.changeNumber, { implementation: { kind: "proposal_document", ref: "doc:2027" } }, command());
    const accepted = await store.acceptOutput(owner, ref, output.id);
    expect(moved.currentRevision?.number).toBe(2);
    expect(accepted.revision.number).toBe(1);
    const detail = await store.readSystem(member, ref);
    expect(detail.revisions.map((item) => item.implementation.ref)).toEqual(["doc:2026", "doc:2027"]);
    expect(detail.outputs[0]).toMatchObject({ status: "accepted", revision: { number: 1 } });
  });

  it("stages a revision without moving the pointer, then activates and restores by compare-and-set", async () => {
    const store = makeStore();
    const { ref, system } = await liveProposal(store);
    const output = await store.issueOutput(owner, ref, { kind: "proposal", title: "Smith wedding", snapshotHash: "a".repeat(64) }, command());
    const before = system.currentRevision!.revisionId;
    const { system: unchanged, revision: staged } = await store.recordRevision(owner, ref, null,
      { implementation: { kind: "proposal_document", ref: "doc:candidate" } }, command(), { activate: false });
    expect(staged.number).toBe(2);
    expect(unchanged).toMatchObject({ changeNumber: system.changeNumber, currentRevision: { revisionId: before } });
    await expect(store.setCurrentRevision(owner, ref, staged.id, staged.id)).rejects.toMatchObject({ code: "system_baseline_moved" });
    const activated = await store.setCurrentRevision(owner, ref, staged.id, before);
    expect(activated.currentRevision?.revisionId).toBe(staged.id);
    const restored = await store.setCurrentRevision(owner, ref, before, staged.id);
    expect(restored).toMatchObject({ id: ref.systemId, currentRevision: { revisionId: before, number: 1 } });
    expect((await store.readSystem(owner, ref)).outputs.find((item) => item.id === output.id)?.revision.number).toBe(1);
    await expect(store.setCurrentRevision(member, ref, staged.id, before)).rejects.toBeInstanceOf(WorkspaceAccessError);
  });

  it("enforces lifecycle rules", async () => {
    const store = makeStore();
    const created = await store.createSystem(owner, JUNIPER, { name: "Report", kind: "report" }, command());
    const ref = { businessId: JUNIPER, systemId: created.id };
    await expect(store.transitionLifecycle(owner, ref, 1, "live")).rejects.toMatchObject({ code: "system_revision_required" });
    await expect(store.transitionLifecycle(owner, ref, 1, "paused")).rejects.toMatchObject({ code: "system_lifecycle_invalid" });
    const { system } = await liveProposal(store);
    const paused = await store.transitionLifecycle(owner, { businessId: JUNIPER, systemId: system.id }, system.changeNumber, "paused");
    await expect(store.transitionLifecycle(owner, { businessId: JUNIPER, systemId: system.id }, paused.changeNumber, "draft"))
      .rejects.toMatchObject({ code: "system_lifecycle_invalid" });
  });

  it("connects pricing to a proposal and a website, with loop and boundary rules", async () => {
    const store = makeStore();
    const { ref: proposal, system } = await liveProposal(store);
    const pricing = { businessId: JUNIPER, systemId: (await store.createSystem(owner, JUNIPER, { name: "Pricing", kind: "pricing" }, command())).id };
    const website = { businessId: JUNIPER, systemId: (await store.createSystem(owner, JUNIPER, { name: "Website", kind: "website" }, command())).id };
    const foreign = { businessId: OTHER, systemId: (await store.createSystem(otherOwner, OTHER, { name: "Their site", kind: "website" }, command())).id };
    const catering = { businessId: CATERING, systemId: (await store.createSystem(owner, CATERING, { name: "Menu", kind: "pricing" }, command())).id };

    const depends = await store.connect(owner, { source: proposal, kind: "depend", target: { type: "system", system: pricing } }, command());
    expect(depends).toMatchObject({ state: "connected", propagation: "pin_on_issue" });
    await store.connect(owner, { source: website, kind: "read", target: { type: "system", system: pricing } }, command());
    const trigger = await store.connect(owner, { source: website, kind: "trigger", target: { type: "system", system: proposal } }, command());
    expect(trigger.propagation).toBe("manual_review");

    await expect(store.connect(owner, { source: pricing, kind: "depend", target: { type: "system", system: proposal } }, command()))
      .rejects.toMatchObject({ code: "system_connection_cycle" });
    await expect(store.connect(owner, { source: website, kind: "read", target: { type: "system", system: foreign } }, command()))
      .rejects.toMatchObject({ code: "system_connection_cross_business" });
    await expect(store.connect(owner, { source: website, kind: "share", target: { type: "system", system: foreign } }, command()))
      .rejects.toBeInstanceOf(WorkspaceAccessError);
    await store.connect(owner, { source: pricing, kind: "share", target: { type: "system", system: catering } }, command());
    expect((await store.readGraph(owner, CATERING)).connections).toHaveLength(1);
    expect((await store.readGraph(otherOwner, OTHER)).connections).toHaveLength(0);

    // A new proposal revision makes the manual_review trigger stale, not the pinned dependency.
    await store.recordRevision(owner, proposal, system.changeNumber, { implementation: { kind: "proposal_document", ref: "doc:2028" } }, command());
    const graph = await store.readGraph(owner, JUNIPER);
    expect(graph.connections.find((item) => item.id === trigger.id)?.state).toBe("stale");
    expect(graph.connections.find((item) => item.id === depends.id)?.state).toBe("connected");

    // Disconnect to break a would-be loop; reconnecting rechecks it.
    const pricingToWebsite = await store.connect(owner, { source: pricing, kind: "depend", target: { type: "system", system: website } }, command());
    await store.setConnectionState(owner, JUNIPER, pricingToWebsite.id, "disconnected");
    await store.connect(owner, { source: website, kind: "depend", target: { type: "system", system: proposal } }, command());
    await expect(store.setConnectionState(owner, JUNIPER, pricingToWebsite.id, "connected")).rejects.toMatchObject({ code: "system_connection_cycle" });
  });

  it("stores an adopted System under its origin id, once", async () => {
    const store = makeStore();
    const origin = { kind: "saved_work" as const, ref: "5e000000-0000-4000-8000-0000000000a1" };
    const adopted = await store.createSystem(owner, JUNIPER, { name: "Adopted", kind: "website", origin }, command());
    expect(adopted.id).toBe("f155e662-163a-42f3-a0ea-e12c754a9a96");
    await expect(store.createSystem(owner, JUNIPER, { name: "Again", kind: "website", origin }, command()))
      .rejects.toMatchObject({ code: "system_origin_conflict" });
  });

  it("stops writes after exit and keeps reads", async () => {
    const store = makeStore() as SystemStore & { stop: (id: string) => void };
    await store.createSystem(owner, EXITED, { name: "Before exit", kind: "report" }, command());
    store.stop(EXITED);
    await expect(store.createSystem(owner, EXITED, { name: "After exit", kind: "report" }, command()))
      .rejects.toMatchObject({ code: "system_business_stopped" });
    expect((await store.readGraph(owner, EXITED)).systems).toHaveLength(1);
  });

  it("rechecks both businesses before a share reconnects, and never blocks revoking it", async () => {
    const roles: Record<string, Record<string, SystemAccess>> = structuredClone(ROLES);
    roles[CATERING]![otherOwner.userId] = "owner";
    const store = createMemorySystemStore({ access: (actor, businessId) => roles[businessId]?.[actor.userId] ?? null });
    const pricing = { businessId: JUNIPER, systemId: (await store.createSystem(owner, JUNIPER, { name: "Pricing", kind: "pricing" }, command())).id };
    const menu = { businessId: CATERING, systemId: (await store.createSystem(owner, CATERING, { name: "Menu", kind: "pricing" }, command())).id };
    const share = await store.connect(owner, { source: pricing, kind: "share", target: { type: "system", system: menu } }, command());
    await store.setConnectionState(owner, JUNIPER, share.id, "disconnected");

    // The owner is removed from the target business; the share stays off.
    delete roles[CATERING]![owner.userId];
    await expect(store.setConnectionState(owner, JUNIPER, share.id, "connected")).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(store.setConnectionState(owner, JUNIPER, share.id, "stale")).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect((await store.readGraph(owner, JUNIPER)).connections.find((item) => item.id === share.id)?.state).toBe("disconnected");

    // Restored access reconnects; the target business can revoke it; a source-only writer can still turn it off.
    roles[CATERING]![owner.userId] = "owner";
    await store.setConnectionState(owner, JUNIPER, share.id, "connected");
    await expect(store.setConnectionState(otherOwner, CATERING, share.id, "connected")).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(await store.setConnectionState(otherOwner, CATERING, share.id, "disconnected")).toMatchObject({ state: "disconnected" });
    roles[CATERING]![owner.userId] = "owner";
    await store.setConnectionState(owner, JUNIPER, share.id, "connected");
    delete roles[CATERING]![owner.userId];
    expect(await store.setConnectionState(owner, JUNIPER, share.id, "disconnected")).toMatchObject({ state: "disconnected" });
  });
});
