import { describe, expect, it, vi } from "vitest";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { Possibility } from "@/platform/possibilities";
import { planApprovalSubject, planFingerprint, type ActivationRepository, type EffectAdapter } from "@/platform/make-real";
import { createHostedWebsiteAdapter } from "@/platform/make-real/live-adapters";
import { createLiveMakeRealService } from "@/platform/make-real/live";
import { AT, BIZ, HASH, OWNER, ctx, hostedEffect, hostedPorts, readyPossibility, service } from "./helpers/make-real-live-fixtures";

describe("completed native Google governed undo", () => {
 async function completedNativeFixture(native = true, loseInitialCompletion = false) {
  const grant = { bindingId: "b1000000-0000-4000-8000-0000000000b1", accountId: "accounts/exact", grantGeneration: HASH };
  const request = { tenantId: `workspace-${BIZ}`, locationId: "exact", eventId: "exact", draftDigest: HASH, ...(native ? { nativeGrant: grant } : {}) };
  const providerRef = JSON.stringify({ businessId: BIZ, request, receiptId: "b1000000-0000-4000-8000-000000000099" });
  const effect = { ...hostedEffect("google"), channel: "google_listing" as const, request };
  const { p, live, site } = await readyPossibility({
   effects: [effect],
   introduces: [{ key: "listing", name: "Google listing system", purpose: "Own the exact Google listing", candidate: { summary: "Listing state", content: { place: "exact" } } }],
   connections: [{ id: "listing-appears", from: { introducedKey: "listing" }, to: { systemId: "b1000000-0000-4000-8000-0000000000e1" }, kind: "appear", purpose: "Show the listing alongside the website" }],
  });
  const baseline = (await live.port.current(site))!.revisionId;
  let providerState = "accepted";
  const perform = vi.fn(async () => { providerState = "accepted"; return { status: "accepted" as const, providerRef }; });
  const compensate = vi.fn(async () => { providerState = "undone"; return { ok: true, detail: "Actual inverse fixture confirmed." }; });
  const verifyCompensation = vi.fn(async () => ({ ok: providerState === "undone", detail: "Exact inverse fixture readback." }));
  const adapter: EffectAdapter = { kind: "publish", channel: "google_listing", mode: "live", idempotentByKey: false,
   reversibility: () => "compensable", ready: async () => ({ ok: true }), rehearse: async () => ({ ok: false, detail: "Isolated rehearsal only." }),
   perform, find: async () => ({ found: true, providerRef }), readBack: async () => ({ ok: true, detail: "Exact Google current state." }), compensate, verifyCompensation,
  };
  const setup = service({ p, live, adapters: [adapter] });
  const nativeGoogleUndoOwner = vi.fn(async (actor: WorkspaceActor, workspaceId: string) => actor.userId === OWNER.userId && actor.verifiedEmail === OWNER.verifiedEmail && workspaceId === BIZ);
  const svc = createLiveMakeRealService({ possibilities: () => setup.possibilities, activations: () => setup.activations,
   live: () => live.port, adapters: () => [adapter], approvals: setup.approvals, nativeGoogleUndoOwner,
   clock: () => new Date(setup.clock.now).toISOString() });
  await setup.possibilities.create(p);
  if (loseInitialCompletion) {
   const save = setup.possibilities.save;
   let lose = true;
   vi.spyOn(setup.possibilities, "save").mockImplementation(async (...args) => {
    if (args[0].status === "made_real" && lose) { lose = false; throw new Error("Initial proposal completion checkpoint lost."); }
    return save(...args);
   });
  }
  setup.approvals.record({ id: "completed-native-plan", businessId: BIZ, subject: planApprovalSubject(p), status: "approved" });
  const start = svc.startApproved({ actor: OWNER, workspaceId: BIZ, possibilityId: p.id, approvalId: "completed-native-plan" });
  if (loseInitialCompletion) await expect(start).rejects.toThrow("Initial proposal completion checkpoint lost.");
  const activation = loseInitialCompletion ? (await setup.activations.get(BIZ, (await setup.possibilities.get(BIZ, p.id))!.activationId!))! : await start;
  expect(activation.status).toBe("made_real");
  expect(activation.steps.every(step => step.status === "completed")).toBe(true);
  const frame = { candidateRevision: p.candidateRevision, planFingerprint: planFingerprint(p), effectId: "google", providerRef };
  return { ...setup, svc, p, live, site, baseline, activation, frame, perform, compensate, verifyCompensation, nativeGoogleUndoOwner };
 }

 it("closes a ready attached native proposal after the durable activation completed but its first proposal save was lost", async () => {
  const { svc, activation, frame, possibilities, activations, p, live, perform, compensate } = await completedNativeFixture(true, true);
  const retained = (await possibilities.get(BIZ, p.id))!;
  expect(retained.status).toBe("ready"); expect(retained.activationId).toBe(activation.id);
  expect((await activations.get(BIZ, activation.id))!.status).toBe("made_real");
  const writes = structuredClone(live.writes), connections = structuredClone(live.connections(BIZ));
  const checkpoints = vi.spyOn(activations, "save"), proposalSave = vi.mocked(possibilities.save);
  const callsBefore = proposalSave.mock.calls.length;
  const completed = await svc.completeNativeGoogle(OWNER, BIZ, activation.id, frame);
  expect(completed).toEqual(activation);
  const closed = (await possibilities.get(BIZ, p.id))!;
  expect(closed.status).toBe("made_real"); expect(closed.activationId).toBe(activation.id);
  expect(closed.revision).toBe(retained.revision + 1); expect(completed.approvals[0]!.consumedAt).toBe(activation.approvals[0]!.consumedAt);
  expect(proposalSave.mock.calls.length).toBe(callsBefore + 1);
  expect(checkpoints).not.toHaveBeenCalled(); expect(live.writes).toEqual(writes); expect(live.connections(BIZ)).toEqual(connections);
  expect(perform).toHaveBeenCalledOnce(); expect(compensate).not.toHaveBeenCalled();
  expect(await svc.completeNativeGoogle(OWNER, BIZ, activation.id, frame)).toEqual(activation);
  expect(proposalSave.mock.calls.length).toBe(callsBefore + 1); expect((await possibilities.get(BIZ, p.id))!.revision).toBe(closed.revision);
  expect(perform).toHaveBeenCalledOnce(); expect(live.writes).toEqual(writes);
 });

 it.each(["candidate", "fingerprint", "effect", "reference", "owner"])("refuses %s completion recovery before changing either durable document", async invalid => {
  const { svc, activation, frame, possibilities, activations, p, live, perform, compensate, nativeGoogleUndoOwner } = await completedNativeFixture(true, true);
  const retained = (await possibilities.get(BIZ, p.id))!, writes = structuredClone(live.writes);
  if (invalid === "candidate") frame.candidateRevision++;
  if (invalid === "fingerprint") frame.planFingerprint = "f".repeat(64);
  if (invalid === "effect") frame.effectId = "foreign-google";
  if (invalid === "reference") frame.providerRef = JSON.stringify({ ...JSON.parse(frame.providerRef), businessId: "b1000000-0000-4000-8000-000000000088" });
  if (invalid === "owner") nativeGoogleUndoOwner.mockResolvedValue(false);
  await expect(svc.completeNativeGoogle(OWNER, BIZ, activation.id, frame)).rejects.toThrow();
  expect(await possibilities.get(BIZ, p.id)).toEqual(retained); expect(await activations.get(BIZ, activation.id)).toEqual(activation);
  expect(live.writes).toEqual(writes); expect(perform).toHaveBeenCalledOnce(); expect(compensate).not.toHaveBeenCalled();
 });

 it("routes lost native completion through the optional exact completion finalizer once", async () => {
  const { svc, activation, frame, possibilities, activations, p, live, perform, compensate } = await completedNativeFixture(true, true);
  const retained = (await possibilities.get(BIZ, p.id))!, writes = structuredClone(live.writes);
  const save = vi.mocked(possibilities.save).getMockImplementation()!;
  const finalize = vi.fn(async (value: Possibility, expected: number, exactActivationId: string) => {
   expect(exactActivationId).toBe(activation.id); return save(value, expected);
  });
  Object.assign(possibilities, { finalizeNativeGoogleCompletion: finalize });
  const generic = vi.spyOn(possibilities, "save"), checkpoint = vi.spyOn(activations, "save");
  generic.mockClear();
  expect(await svc.completeNativeGoogle(OWNER, BIZ, activation.id, frame)).toEqual(activation);
  expect(finalize).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: p.id, businessId: BIZ, status: "made_real", activationId: activation.id, revision: retained.revision + 1 }), retained.revision, activation.id);
  expect(generic).not.toHaveBeenCalled(); expect(checkpoint).not.toHaveBeenCalled();
  expect((await possibilities.get(BIZ, p.id))!.status).toBe("made_real");
  expect(await svc.completeNativeGoogle(OWNER, BIZ, activation.id, frame)).toEqual(activation);
  expect(finalize).toHaveBeenCalledOnce(); expect(live.writes).toEqual(writes); expect(perform).toHaveBeenCalledOnce(); expect(compensate).not.toHaveBeenCalled();
 });

 it("keeps generic resume closed in the split native completion crash window", async () => {
  const { svc, activation, possibilities, p, perform, compensate, live } = await completedNativeFixture(true, true);
  const retained = (await possibilities.get(BIZ, p.id))!, writes = structuredClone(live.writes);
  await expect(svc.resume(OWNER, BIZ, activation.id)).rejects.toThrow(/already real|closed/i);
  expect(await possibilities.get(BIZ, p.id)).toEqual(retained); expect(live.writes).toEqual(writes);
  expect(perform).toHaveBeenCalledOnce(); expect(compensate).not.toHaveBeenCalled();
 });

 it.each(["non_native", "unfinished_step", "failed_check", "rollback_started", "foreign_attachment", "withdrawn", "approval_changed"])("refuses %s local completion evidence before any replay or proposal close", async invalid => {
  const { svc, activation, frame, possibilities, activations, approvals, p, live, perform, compensate } = await completedNativeFixture(invalid !== "non_native", true);
  if (["unfinished_step", "failed_check", "rollback_started"].includes(invalid)) {
   const changed = structuredClone(activation);
   if (invalid === "unfinished_step") changed.steps[0]!.status = "failed";
   if (invalid === "failed_check") changed.checks[0]!.status = "failed";
   if (invalid === "rollback_started") changed.rollbackStartedAt = AT;
   await activations.save({ ...changed, revision: changed.revision + 1 }, changed.revision);
  }
  if (["foreign_attachment", "withdrawn"].includes(invalid)) {
   const changed = (await possibilities.get(BIZ, p.id))!;
   if (invalid === "foreign_attachment") changed.activationId = "another-activation";
   if (invalid === "withdrawn") changed.status = "withdrawn";
   await possibilities.save({ ...changed, revision: changed.revision + 1 }, changed.revision);
  }
  if (invalid === "approval_changed") approvals.setStatus("completed-native-plan", "dismissed");
  const retainedProposal = await possibilities.get(BIZ, p.id), retainedActivation = await activations.get(BIZ, activation.id), writes = structuredClone(live.writes);
  await expect(svc.completeNativeGoogle(OWNER, BIZ, activation.id, frame)).rejects.toThrow();
  expect(await possibilities.get(BIZ, p.id)).toEqual(retainedProposal); expect(await activations.get(BIZ, activation.id)).toEqual(retainedActivation);
  expect(live.writes).toEqual(writes); expect(perform).toHaveBeenCalledOnce(); expect(compensate).not.toHaveBeenCalled();
 });

 it("undoes a completed exact native frame once and restores pointers, introduced lifecycle and connections", async () => {
  const { svc, activation, frame, p, possibilities, live, site, baseline, perform, compensate } = await completedNativeFixture();
  expect((await live.port.current(site))!.revisionId).not.toBe(baseline);
  expect(live.connections(BIZ).every(connection => connection.active)).toBe(true);
  const undone = await svc.rollbackNativeGoogle(OWNER, BIZ, activation.id, frame, "Owner requested exact completed native inverse.");
  expect(undone.status).toBe("rolled_back");
  expect(undone.steps.filter(step => ["stage", "introduce", "activate", "connect"].includes(step.kind)).every(step => step.status === "restored")).toBe(true);
  expect((await live.port.current(site))!.revisionId).toBe(baseline);
  expect((await live.port.current(site))!.content).toEqual({ pages: 3 });
  expect(live.system({ businessId: BIZ, systemId: undone.introduced[0]!.systemId! })!.lifecycle).toBe("paused");
  expect(live.connections(BIZ).every(connection => !connection.active)).toBe(true);
  expect(live.writes.restore).toBe(2); expect(live.writes.disconnect).toBe(1);
  const withdrawn = (await possibilities.get(BIZ, p.id))!;
  expect(withdrawn.status).toBe("withdrawn");
  expect(withdrawn.consumedApprovalIds).toContain("completed-native-plan");
  expect(undone.approvals[0]!.consumedAt).toBeTruthy();
  expect(perform).toHaveBeenCalledOnce(); expect(compensate).toHaveBeenCalledOnce();
  expect(compensate).toHaveBeenCalledWith(expect.objectContaining({ businessId: BIZ, providerRef: frame.providerRef }));
 });

 it("keeps generic rollback closed for a completed plan", async () => {
  const { svc, activation, compensate, live } = await completedNativeFixture();
  await expect(svc.rollback(OWNER, BIZ, activation.id)).rejects.toThrow(/already real/i);
  expect(compensate).not.toHaveBeenCalled(); expect(live.writes.restore).toBe(0); expect(live.writes.disconnect).toBe(0);
 });

 it("routes every completed native reverse checkpoint and terminal withdrawal through specialized ports", async () => {
  const { svc, activation, frame, activations, possibilities, p, perform, compensate } = await completedNativeFixture();
  const saveActivation = activations.save;
  const reverse = vi.fn<NonNullable<ActivationRepository["saveNativeGoogleUndo"]>>(async (value, expected) => saveActivation(value, expected));
  activations.saveNativeGoogleUndo = reverse;
  const genericActivation = vi.spyOn(activations, "save").mockImplementation(async (value, expected) => {
   const prior = (await activations.get(BIZ, value.id))!;
   if (prior.status === "made_real" || prior.status === "rolled_back") throw new Error("Generic activation checkpoint is closed.");
   return saveActivation(value, expected);
  });
  const saveProposal = possibilities.save;
  const finalize = vi.fn(async (value: Possibility, expected: number, exactActivationId: string) => {
   expect(exactActivationId).toBe(activation.id); return saveProposal(value, expected);
  });
  Object.assign(possibilities, { finalizeNativeGoogleUndo: finalize });
  const genericProposal = vi.spyOn(possibilities, "save").mockImplementation(async (value, expected) => {
   const prior = (await possibilities.get(BIZ, value.id))!;
   if (prior.status === "made_real" || prior.status === "withdrawn") throw new Error("Generic proposal save is closed.");
   return saveProposal(value, expected);
  });
  const priorProposal = (await possibilities.get(BIZ, p.id))!;
  const undone = await svc.rollbackNativeGoogle(OWNER, BIZ, activation.id, frame);
  expect(undone.status).toBe("rolled_back"); expect(reverse.mock.calls.length).toBeGreaterThan(3);
  expect(reverse.mock.calls[0]![0].history.at(-1)?.kind).toBe("rollback_started");
  expect(reverse.mock.calls.some(([value]) => value.history.at(-1)?.kind === "rollback_compensation_claim")).toBe(true);
  expect(reverse.mock.calls.at(-1)![0].history.at(-1)?.kind).toBe("rollback");
  reverse.mock.calls.forEach(([value, expected], index) => {
   expect(value.id).toBe(activation.id); expect(value.possibilityId).toBe(p.id); expect(value.businessId).toBe(BIZ);
   expect(expected).toBe(activation.revision + index); expect(value.revision).toBe(expected + 1);
  });
  expect(genericActivation).not.toHaveBeenCalled(); expect(genericProposal).not.toHaveBeenCalled();
  expect(finalize).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: p.id, status: "withdrawn", revision: priorProposal.revision + 1 }), priorProposal.revision, activation.id);
  expect((await possibilities.get(BIZ, p.id))!.consumedApprovalIds).toContain("completed-native-plan");
  expect(perform).toHaveBeenCalledOnce(); expect(compensate).toHaveBeenCalledOnce();
 });

 it("keeps ordinary partial rollback on generic repositories even when native ports are installed", async () => {
  const { p, live } = await readyPossibility({ effects: [hostedEffect()], checks: [{ id: "operator-check", description: "Operator must confirm this partial plan." }] });
  const compensate = vi.fn(async () => ({ ok: true, detail: "Exact ordinary fixture inverse confirmed." }));
  const adapter = { ...createHostedWebsiteAdapter(hostedPorts().ports, ctx()), reversibility: () => "compensable" as const, compensate };
  const { svc, possibilities, activations, approvals } = service({ p, live, adapters: [adapter] });
  await possibilities.create(p); approvals.record({ id: "partial-plan", businessId: BIZ, subject: planApprovalSubject(p), status: "approved" });
  const partial = await svc.startApproved({ actor: OWNER, workspaceId: BIZ, possibilityId: p.id, approvalId: "partial-plan" });
  expect(partial.status).toBe("needs_attention");
  const reverse = vi.fn(async () => { throw new Error("Ordinary rollback cannot enter the native checkpoint port."); });
  const finalize = vi.fn(async () => { throw new Error("Ordinary rollback cannot enter the native finalizer."); });
  activations.saveNativeGoogleUndo = reverse; Object.assign(possibilities, { finalizeNativeGoogleUndo: finalize });
  const genericActivation = vi.spyOn(activations, "save"), genericProposal = vi.spyOn(possibilities, "save");
  expect((await svc.rollback(OWNER, BIZ, partial.id)).status).toBe("rolled_back");
  expect(genericActivation).toHaveBeenCalled(); expect(genericProposal).toHaveBeenCalledOnce();
  expect(reverse).not.toHaveBeenCalled(); expect(finalize).not.toHaveBeenCalled(); expect(compensate).toHaveBeenCalledOnce();
  expect((await possibilities.get(BIZ, p.id))!.status).toBe("ready");
 });

 it("denies a former owner before any inverse despite retained original approval", async () => {
  const { svc, activation, frame, compensate, live, nativeGoogleUndoOwner } = await completedNativeFixture();
  nativeGoogleUndoOwner.mockResolvedValue(false);
  await expect(svc.rollbackNativeGoogle(OWNER, BIZ, activation.id, frame)).rejects.toThrow();
  expect(nativeGoogleUndoOwner).toHaveBeenCalledWith(OWNER, BIZ);
  expect(compensate).not.toHaveBeenCalled(); expect(live.writes.restore).toBe(0); expect(live.writes.disconnect).toBe(0);
 });

 it("defaults to denying completed native undo when no current owner verifier is injected", async () => {
  const { activation, frame, compensate, live, possibilities, activations, approvals } = await completedNativeFixture();
  const noOwnerVerifier = createLiveMakeRealService({ possibilities: () => possibilities, activations: () => activations,
   live: () => live.port, adapters: () => [], approvals });
  await expect(noOwnerVerifier.rollbackNativeGoogle(OWNER, BIZ, activation.id, frame)).rejects.toThrow(/owner/i);
  expect(compensate).not.toHaveBeenCalled(); expect(live.writes.restore).toBe(0); expect(live.writes.disconnect).toBe(0);
 });

 it("denies another actor before any inverse despite the exact approved frame", async () => {
  const { svc, activation, frame, compensate, live } = await completedNativeFixture();
  await expect(svc.rollbackNativeGoogle({ userId: "b1000000-0000-4000-8000-000000000088", verifiedEmail: "agency@example.test" }, BIZ, activation.id, frame)).rejects.toThrow();
  expect(compensate).not.toHaveBeenCalled(); expect(live.writes.restore).toBe(0); expect(live.writes.disconnect).toBe(0);
 });

 it("stops remaining internal and provider inverses when current owner authority ends between steps", async () => {
  const { svc, activation, frame, compensate, live, nativeGoogleUndoOwner } = await completedNativeFixture();
  const disconnect = live.port.disconnect;
  vi.spyOn(live.port, "disconnect").mockImplementation(async (...args) => { await disconnect(...args); nativeGoogleUndoOwner.mockResolvedValue(false); });
  await svc.rollbackNativeGoogle(OWNER, BIZ, activation.id, frame).catch(() => undefined);
  expect(live.writes.disconnect).toBe(1);
  expect(live.writes.restore).toBe(0);
  expect(compensate).not.toHaveBeenCalled();
  expect((await svc.read(OWNER, BIZ, activation.id)).status).not.toBe("rolled_back");
 });

 it.each(["candidate", "fingerprint", "effect", "reference"])("refuses a foreign completed frame %s before any inverse", async invalid => {
  const { svc, activation, frame, compensate, live, activations } = await completedNativeFixture();
  if (invalid === "candidate") frame.candidateRevision++;
  if (invalid === "fingerprint") frame.planFingerprint = "f".repeat(64);
  if (invalid === "effect") frame.effectId = "foreign-google";
  if (invalid === "reference") frame.providerRef = JSON.stringify({ ...JSON.parse(frame.providerRef), businessId: "b1000000-0000-4000-8000-000000000088" });
  await expect(svc.rollbackNativeGoogle(OWNER, BIZ, activation.id, frame)).rejects.toThrow();
  expect(compensate).not.toHaveBeenCalled(); expect(live.writes.restore).toBe(0); expect(live.writes.disconnect).toBe(0);
  expect((await activations.get(BIZ, activation.id))!.status).toBe("made_real");
 });

 it("refuses a completed Google effect without a native grant before any inverse", async () => {
  const { svc, activation, frame, compensate, live } = await completedNativeFixture(false);
  await expect(svc.rollbackNativeGoogle(OWNER, BIZ, activation.id, frame)).rejects.toThrow();
  expect(compensate).not.toHaveBeenCalled(); expect(live.writes.restore).toBe(0); expect(live.writes.disconnect).toBe(0);
 });

 it("refuses a foreign canonical reference even when it is copied into both stored receipt and frame", async () => {
  const { svc, activation, frame, compensate, live, activations } = await completedNativeFixture();
  const stored = (await activations.get(BIZ, activation.id))!;
  const foreign = JSON.stringify({ ...JSON.parse(frame.providerRef), businessId: "b1000000-0000-4000-8000-000000000088" });
  stored.steps.find(step => step.id === "effect:google")!.receipt!.providerRef = foreign;
  await activations.save({ ...stored, revision: stored.revision + 1 }, stored.revision);
  frame.providerRef = foreign;
  await expect(svc.rollbackNativeGoogle(OWNER, BIZ, activation.id, frame)).rejects.toThrow();
  expect(compensate).not.toHaveBeenCalled(); expect(live.writes.restore).toBe(0); expect(live.writes.disconnect).toBe(0);
 });

 it.each(["opaque", "missing_receipt"])("requires a canonical actual native receipt when %s reference matches stored receipt and frame", async invalid => {
  const { svc, activation, frame, compensate, live, activations } = await completedNativeFixture();
  const stored = (await activations.get(BIZ, activation.id))!;
  const reference = invalid === "opaque" ? "opaque-reference-without-native-authority" : JSON.stringify({ ...JSON.parse(frame.providerRef), receiptId: null });
  stored.steps.find(step => step.id === "effect:google")!.receipt!.providerRef = reference;
  await activations.save({ ...stored, revision: stored.revision + 1 }, stored.revision);
  frame.providerRef = reference;
  await expect(svc.rollbackNativeGoogle(OWNER, BIZ, activation.id, frame)).rejects.toThrow();
  expect(compensate).not.toHaveBeenCalled(); expect(live.writes.restore).toBe(0); expect(live.writes.disconnect).toBe(0);
 });

 it("finishes proposal withdrawal after a lost terminal save without repeating the confirmed inverse", async () => {
  const { svc, activation, frame, possibilities, activations, p, perform, compensate } = await completedNativeFixture();
  const save = possibilities.save;
  let loseWithdrawal = true;
  vi.spyOn(possibilities, "save").mockImplementation(async (...args) => {
   if (args[0].status === "withdrawn" && loseWithdrawal) { loseWithdrawal = false; throw new Error("Proposal withdrawal checkpoint lost."); }
   return save(...args);
  });
  await expect(svc.rollbackNativeGoogle(OWNER, BIZ, activation.id, frame)).rejects.toThrow("withdrawal checkpoint lost");
  expect((await activations.get(BIZ, activation.id))!.status).toBe("rolled_back");
  expect((await possibilities.get(BIZ, p.id))!.status).toBe("made_real");
  expect((await svc.rollbackNativeGoogle(OWNER, BIZ, activation.id, frame)).status).toBe("rolled_back");
  expect((await possibilities.get(BIZ, p.id))!.status).toBe("withdrawn");
  expect((await possibilities.get(BIZ, p.id))!.consumedApprovalIds).toContain("completed-native-plan");
  expect(perform).toHaveBeenCalledOnce(); expect(compensate).toHaveBeenCalledOnce();
 });

 it.each(["staged", "introduced"])("refuses a moved live %s pointer before any provider or internal inverse", async target => {
  const { svc, activation, frame, compensate, live, site } = await completedNativeFixture();
  const moved = target === "staged" ? site : { businessId: BIZ, systemId: activation.introduced[0]!.systemId! };
  const revision = live.edit(moved, { ownerEdit: "Keep this newer state" });
  await expect(svc.rollbackNativeGoogle(OWNER, BIZ, activation.id, frame)).rejects.toThrow();
  expect(compensate).not.toHaveBeenCalled(); expect(live.writes.restore).toBe(0); expect(live.writes.disconnect).toBe(0);
  expect((await live.port.current(moved))!.revisionId).toBe(revision);
 });

 it("holds an unknown inverse and finishes only after exact inverse verification without another provider write", async () => {
  const { svc, activation, frame, compensate, verifyCompensation, possibilities, p, perform } = await completedNativeFixture();
  compensate.mockRejectedValueOnce(new Error("Inverse response lost after dispatch."));
  verifyCompensation.mockResolvedValue({ ok: false, detail: "Inverse current state is unconfirmed." });
  const held = await svc.rollbackNativeGoogle(OWNER, BIZ, activation.id, frame);
  expect(held.status).toBe("needs_attention");
  expect(held.steps.find(step => step.id === "effect:google")!.compensation?.status).toBe("unknown");
  expect((await possibilities.get(BIZ, p.id))!.status).toBe("made_real");
  expect((await svc.rollbackNativeGoogle(OWNER, BIZ, activation.id, frame)).status).toBe("needs_attention");
  await expect(svc.reconcile(OWNER, BIZ, activation.id, { stepId: "effect:google", target: "compensation", resolution: "completed", evidence: "Text alone cannot establish the inverse." })).rejects.toThrow(/unconfirmed/i);
  expect(compensate).toHaveBeenCalledOnce();
  verifyCompensation.mockResolvedValue({ ok: true, detail: "Exact retained inverse and actual current provider state matched." });
  await svc.reconcile(OWNER, BIZ, activation.id, { stepId: "effect:google", target: "compensation", resolution: "completed", evidence: "Exact linked inverse readback confirmed." });
  const finished = await svc.rollbackNativeGoogle(OWNER, BIZ, activation.id, frame);
  expect(finished.status).toBe("rolled_back"); expect((await possibilities.get(BIZ, p.id))!.status).toBe("withdrawn");
  expect((await possibilities.get(BIZ, p.id))!.consumedApprovalIds).toContain("completed-native-plan");
  expect(perform).toHaveBeenCalledOnce(); expect(compensate).toHaveBeenCalledOnce();
  expect(verifyCompensation).toHaveBeenCalledWith({ businessId: BIZ, providerRef: frame.providerRef });
 });
});
