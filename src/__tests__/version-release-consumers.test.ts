import { describe, expect, it, vi } from "vitest";
import { createInMemoryConnectionOwnership, createInMemoryVersionStore, createSystemVersions, VersionStaleError, type JsonObject, type VersionLineage } from "@/platform/system-versions";
import { projectVersionPossibilities } from "@/platform/system-versions/possibilities";
import { prepareVersionRelease } from "@/platform/system-versions/preparation";
import { prepareNativeBundleVersion } from "@/experience/workspace/agency/bundle-lifecycle-server";
import { prepareBundleInquiry } from "@/products/inquiries";
import { InquiryEngine } from "@/products/inquiries/inquiry-engine";
import type { VersionsDb } from "@/platform/system-versions/supabase-store";

const actor = { userId: crypto.randomUUID(), verifiedEmail: "version-owner@example.test" };
const businessId = crypto.randomUUID(), sourceBusinessId = crypto.randomUUID();
const now = "2026-10-09T12:00:00.000Z";
const inquiry: JsonObject = { kind: "inquiry_pattern", name: "Intake", title: "How can we help?", intro: "Tell us what you need.", fields: [{ id: "name", label: "Name", kind: "text", required: true }], routingWithinMinutes: 60 };

async function fixture() {
  const store = createInMemoryVersionStore();
  const versions = createSystemVersions({ store, connections: createInMemoryConnectionOwnership() });
  const owner = { ...actor, memberships: [{ businessId, role: "owner" as const }, { businessId: sourceBusinessId, role: "owner" as const }] };
  const source = { businessId: sourceBusinessId, systemId: crypto.randomUUID() };
  const revision = await versions.publishSourceRevision(owner, { source, definition: inquiry, summary: "First intake" });
  await versions.shareSource(owner, source, businessId);
  const lineage = await versions.createVersion(owner, { source: revision.source, version: { businessId, systemId: crypto.randomUUID() }, context: { kind: "agency_client", label: "Fictional intake" } });
  return { versions, owner, lineage };
}

// Both database transports are fictional. These tests qualify caller behavior,
// not native runtime eligibility, persisted authority or provider publication.
function genericTransport(lineage: VersionLineage) {
  const decisionId = crypto.randomUUID();
  const decisions = { policies: vi.fn().mockResolvedValue([]), open: vi.fn().mockResolvedValue({ id: decisionId }) };
  const rpc = vi.fn<VersionsDb["rpc"]>(async name => {
    if (name === "read_version_native_runtime") return { data: { kind: "internal_app", workId: crypto.randomUUID(), releaseNumber: lineage.currentRelease, designRevision: 0 }, error: null };
    if (name === "record_version_preparation") return { data: { receiptId: crypto.randomUUID(), decisionId, workspaceId: businessId, versionId: lineage.id, rowRevision: lineage.rowRevision }, error: null };
    throw new Error(`Unexpected generic RPC: ${name}`);
  });
  return { decisions, db: { rpc } };
}

function nativeTransport(lineage: VersionLineage, extra: Record<string, unknown> = {}) {
  const initial = prepareBundleInquiry(inquiry, { sourceBusinessId, sourceId: "fictional:intake", businessId, actorId: actor.userId, state: null, now });
  const receipt = { kind: "native", receiptId: crypto.randomUUID(), workspaceId: businessId, versionId: lineage.id, rowRevision: lineage.rowRevision, workId: initial.work.id, reviewHref: "/workspace?view=inquiries", status: "awaiting_native_review" };
  const rpc = vi.fn<VersionsDb["rpc"]>(async name => {
    if (name === "read_bundle_native_preparation") return { data: { kind: "inquiry_pattern", state: initial.state, capabilityId: initial.work.capabilityId, revision: 1, ...extra }, error: null };
    if (name === "commit_bundle_native_preparation") return { data: receipt, error: null };
    throw new Error(`Unexpected native RPC: ${name}`);
  });
  return { db: { rpc }, receipt, initial, lineage: { ...lineage, sourceComponentKey: "intake" } };
}

async function assertConsumers(lineage: VersionLineage, needed: boolean) {
  const candidate = projectVersionPossibilities(lineage, [], "Intake").pendingRelease;
  const generic = genericTransport(lineage), native = nativeTransport(lineage);
  expect(Boolean(candidate)).toBe(needed);
  expect(Boolean(await prepareVersionRelease(actor, lineage, generic))).toBe(needed);
  expect(Boolean(await prepareNativeBundleVersion(actor, native.lineage, native.db))).toBe(needed);
  if (candidate) {
    expect(generic.decisions.open).toHaveBeenCalledWith(businessId, expect.objectContaining({ detail: expect.stringContaining(`What changed: ${candidate.changedPaths.slice(0, 8).join(", ")}.`) }));
  } else {
    expect(generic.db.rpc).not.toHaveBeenCalled();
    expect(native.db.rpc).toHaveBeenCalledTimes(1); // Native receipt/revision read still runs.
  }
}

describe("Version release determination across callers", () => {
  it("describes the first release consistently and never treats an unreleased baseline as live", async () => {
    const { lineage } = await fixture();
    await assertConsumers(lineage, true);
    expect(projectVersionPossibilities(lineage, [], "Intake").pendingRelease).toMatchObject({ current: null, preview: inquiry, changedPaths: ["fields", "intro", "kind", "name", "routingWithinMinutes", "title"] });
  });

  it("does no new preparation for an unchanged release or reordered nested object keys", async () => {
    const { versions, owner, lineage } = await fixture();
    const live = await versions.release(owner, lineage.id, { expectedRowRevision: lineage.rowRevision });
    await assertConsumers(live, false);
    const reordered = await versions.setOverride(owner, lineage.id, { path: "*", value: { routingWithinMinutes: 60, fields: [{ required: true, kind: "text", label: "Name", id: "name" }], intro: inquiry.intro!, title: inquiry.title!, name: inquiry.name!, kind: inquiry.kind! }, expectedRowRevision: live.rowRevision });
    await assertConsumers(reordered, false);
    await expect(versions.release(owner, lineage.id, { expectedRowRevision: reordered.rowRevision })).rejects.toThrow("Nothing changed");
  });

  it("prepares an actual override and a restored draft without rewinding Live or changing History", async () => {
    const { versions, owner, lineage } = await fixture();
    const first = await versions.release(owner, lineage.id, { expectedRowRevision: lineage.rowRevision });
    const changed = await versions.setOverride(owner, lineage.id, { path: "title", value: "Consultation intake", expectedRowRevision: first.rowRevision });
    await assertConsumers(changed, true);
    const second = await versions.release(owner, lineage.id, { expectedRowRevision: changed.rowRevision });
    const restored = await versions.restoreReleaseDraft(owner, lineage.id, { releaseNumber: 1, expectedRowRevision: second.rowRevision });
    expect(restored.currentRelease).toBe(restored.releases.at(-1)?.number);
    expect(restored.currentRelease).toBe(2);
    expect(restored.releases).toEqual(second.releases);
    expect(restored.baseline).toEqual(second.baseline);
    await assertConsumers(restored, true);
    await expect(versions.release(owner, lineage.id, { expectedRowRevision: second.rowRevision })).rejects.toBeInstanceOf(VersionStaleError);
    const third = await versions.release(owner, lineage.id, { expectedRowRevision: restored.rowRevision });
    expect(third.currentRelease).toBe(3);
    expect(third.releases.at(-1)?.definition).toEqual(inquiry);
    await assertConsumers(third, false);
  });

  it("recovers the retained native receipt before the unchanged-definition exit", async () => {
    const { versions, owner, lineage } = await fixture();
    const live = await versions.release(owner, lineage.id, { expectedRowRevision: lineage.rowRevision });
    const native = nativeTransport(live);
    native.db.rpc.mockResolvedValueOnce({ data: { existing: native.receipt }, error: null });
    expect(await prepareNativeBundleVersion(actor, native.lineage, native.db)).toEqual(native.receipt);
    expect(native.db.rpc).toHaveBeenCalledTimes(1);
  });

  it("keeps the native exact-revision read before no-change, and rejects a stale commit", async () => {
    const { versions, owner, lineage } = await fixture();
    const live = await versions.release(owner, lineage.id, { expectedRowRevision: lineage.rowRevision });
    const unchanged = nativeTransport(live);
    unchanged.db.rpc.mockResolvedValueOnce({ data: null, error: { message: "system_version_stale" } });
    await expect(prepareNativeBundleVersion(actor, unchanged.lineage, unchanged.db)).rejects.toBeInstanceOf(VersionStaleError);
    const changed = await versions.setOverride(owner, lineage.id, { path: "title", value: "New intake", expectedRowRevision: live.rowRevision });
    const stale = nativeTransport(changed);
    stale.db.rpc.mockResolvedValueOnce({ data: { kind: "inquiry_pattern", state: stale.initial.state, capabilityId: stale.initial.work.capabilityId, revision: 1 }, error: null }).mockResolvedValueOnce({ data: null, error: { message: "system_version_stale" } });
    await expect(prepareNativeBundleVersion(actor, stale.lineage, stale.db)).rejects.toBeInstanceOf(VersionStaleError);
    expect(stale.db.rpc).toHaveBeenLastCalledWith("commit_bundle_native_preparation", expect.objectContaining({ p_row_revision: changed.rowRevision, p_expected_revision: 1 }));
  });

  it("reports a native inquiry conflict without committing and preserves the named choice", async () => {
    const { lineage } = await fixture();
    const native = nativeTransport(lineage);
    const engine = new InquiryEngine({ businessId, state: native.initial.state, now: () => now });
    engine.applyDraftEdit(native.initial.work.id, { actorId: actor.userId, source: "manual", path: "form.title", after: "Native owner's wording" });
    const state = engine.snapshot();
    native.db.rpc.mockResolvedValueOnce({ data: { kind: "inquiry_pattern", state, capabilityId: native.initial.work.capabilityId, revision: 1 }, error: null });
    expect(await prepareNativeBundleVersion(actor, native.lineage, native.db)).toMatchObject({ kind: "native_conflict", rowRevision: lineage.rowRevision, conflicts: [{ path: "form.title", local: "Native owner's wording", source: inquiry.title }] });
    expect(native.db.rpc).toHaveBeenCalledTimes(1);
    native.db.rpc.mockResolvedValueOnce({ data: { kind: "inquiry_pattern", state, capabilityId: native.initial.work.capabilityId, revision: 1 }, error: null });
    expect(await prepareNativeBundleVersion(actor, native.lineage, native.db, [{ path: "form.title", choice: "local" }])).toEqual(native.receipt);
    expect(native.db.rpc).toHaveBeenLastCalledWith("commit_bundle_native_preparation", expect.objectContaining({ p_artifact: expect.objectContaining({ effectiveDefinition: expect.objectContaining({ title: "Native owner's wording" }) }) }));
  });
});
