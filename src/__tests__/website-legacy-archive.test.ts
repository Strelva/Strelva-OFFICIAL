import { describe, expect, it, vi } from "vitest";
import { generateWebsiteArtifact } from "@/products/websites/generation";
import { captureLegacyWebsiteArchive, validateLegacyWebsiteArchive, legacyArchiveRecord, createLegacyArchiveCaptureService, legacyArchiveVersionEntries, legacyArchiveExportFiles, LegacyArchiveConflict, type LegacyWebsiteArchive, type LegacyArchiveCapturePort } from "@/products/websites/legacy-archive";
import { renderWebsiteCandidate, exportWebsiteCandidate } from "@/products/websites/preview";
import type { SavedWork, WorkspaceActor } from "@/platform/workspaces/types";

const key = { workspaceId: "11111111-1111-4111-8111-111111111111", workId: "22222222-2222-4222-8222-222222222222" };
const actor: WorkspaceActor = { userId: "33333333-3333-4333-8333-333333333333", verifiedEmail: "owner@example.com" };
async function fixture() {
  const brief = { businessName: "Juniper Bread", description: "Fresh bread for Saturday pickup.", primaryCallToAction: "Contact us" };
  const older = await generateWebsiteArtifact({ ...key, revision: 1, brief, now: "2026-10-09T12:00:00.000Z" });
  const current = await generateWebsiteArtifact({ ...key, revision: 3, brief, now: "2026-10-09T13:00:00.000Z" });
  const work: SavedWork = { id: key.workId, workspaceId: key.workspaceId, productId: "websites", resourceKind: "website", title: brief.businessName, input: { version: 1, requestId: "original-request" }, sourceWorkId: "44444444-4444-4444-8444-444444444444", createdBy: actor.userId, createdAt: older.generatedAt, updatedAt: current.generatedAt, payload: {
    version: 1, revision: 4, title: brief.businessName, brief, candidate: current.candidate, status: "approved", approvedCandidateRevision: 3, launch: { status: "not_requested", candidateRevision: null, receipt: null, failure: null }, lastError: null, createdBy: actor.userId, createdAt: older.generatedAt,
    history: [1,2,3].map(revision => ({ revision, kind: "candidate_generated", actorId: actor.userId, at: older.generatedAt, candidateRevision: revision, note: `Original ${revision}` })),
  } };
  return { work, current, older };
}
function memory(work: SavedWork) {
  let source = structuredClone(work); const rows = new Map<string, LegacyWebsiteArchive>(); let allowed = true;
  const port: LegacyArchiveCapturePort = {
    authorize: vi.fn(async () => { if (!allowed) throw new Error("denied"); }),
    readSource: vi.fn(async () => structuredClone(source)),
    captureAtomically: vi.fn(async (who, archive) => {
      await port.authorize(who,key);
      const locked = captureLegacyWebsiteArchive(source,key);
      if (locked.sourceDigest !== archive.sourceDigest || locked.sourceRevision !== archive.sourceRevision) throw new LegacyArchiveConflict("atomic source conflict");
      const old = rows.get(archive.archiveId);
      if (old && JSON.stringify(old) !== JSON.stringify(archive)) throw new LegacyArchiveConflict("immutable evidence conflict");
      if (!old) rows.set(archive.archiveId,structuredClone(archive));
      return structuredClone(rows.get(archive.archiveId));
    }),
  };
  return { port, rows, change: (next: SavedWork) => { source = structuredClone(next); }, deny: () => { allowed = false; } };
}
describe("immutable v1 website archive", () => {
  it("retains full source/wire fields and current candidate without modifying the saved work", async () => {
    const { work, current } = await fixture(); const before = JSON.stringify(work);
    const archive = captureLegacyWebsiteArchive(work,key);
    expect(JSON.parse(archive.sourceJson)).toEqual(work);
    expect(archive.versions.map(v => [v.revision,v.availability])).toEqual([[1,"body_unresolved"],[2,"body_unresolved"],[3,"body_retained"]]);
    const record = legacyArchiveRecord(archive);
    expect(record.website).toEqual(work.payload);
    expect(record.website.approvedCandidateRevision).toBe(3);
    expect(record.website.candidate).toEqual(current.candidate);
    expect(JSON.stringify(work)).toBe(before);
  });
  it("preserves exact current preview/export parity through the retained v1 adapter", async () => {
    const { work,current } = await fixture(); const archive = captureLegacyWebsiteArchive(work,key,[current]);
    const selection = { revision: 3, contentHash: current.contentHash };
    const original = { workId: work.id, workspaceId: work.workspaceId, website: work.payload as ReturnType<typeof legacyArchiveRecord>["website"], createdAt: work.createdAt, updatedAt: work.updatedAt };
    expect(renderWebsiteCandidate(legacyArchiveRecord(archive),selection)).toBe(renderWebsiteCandidate(original,selection));
    expect(exportWebsiteCandidate(legacyArchiveRecord(archive),selection)).toEqual(exportWebsiteCandidate(original,selection));
  });
  it("retains verified recovered artifact bodies but never fabricates missing history", async () => {
    const { work,older } = await fixture(); const archive = captureLegacyWebsiteArchive(work,key,[older]);
    expect(archive.versions[0]?.bundleJson).not.toBeNull();
    expect(archive.versions[1]?.contentHash).toBeNull();
    expect(legacyArchiveRecord(archive,{ revision:1, contentHash:older.contentHash }).website.candidate).toEqual(older.candidate);
    expect(() => legacyArchiveRecord(archive,{ revision:2, contentHash:older.contentHash })).toThrow("unavailable");
    expect(legacyArchiveRecord(archive).website.candidate?.revision).toBe(3);
  });
  it("rejects source, version-reference and recovered artifact tampering", async () => {
    const { work,older } = await fixture(); const archive = captureLegacyWebsiteArchive(work,key,[older]);
    expect(() => validateLegacyWebsiteArchive({ ...archive, sourceJson: `${archive.sourceJson} ` })).toThrow("digest");
    expect(() => validateLegacyWebsiteArchive({ ...archive, versions: archive.versions.filter(v => v.revision !== 2) })).toThrow("references");
    const changed = structuredClone(archive); changed.versions[0]!.bundleJson += " ";
    expect(() => validateLegacyWebsiteArchive(changed)).toThrow("digest");
    const foreign = structuredClone(older); foreign.workspaceId = "55555555-5555-4555-8555-555555555555";
    expect(() => captureLegacyWebsiteArchive(work,key,[foreign])).toThrow();
  });
  it("binds work, workspace, source version and stable canonical digest", async () => {
    const { work } = await fixture(); const archive = captureLegacyWebsiteArchive(work,key);
    expect(captureLegacyWebsiteArchive({ ...work, payload: work.payload },key)).toEqual(archive);
    expect(() => captureLegacyWebsiteArchive({ ...work, workspaceId: "other" },key)).toThrow("scope");
    expect(() => captureLegacyWebsiteArchive({ ...work, resourceKind:"document" },key)).toThrow("scope");
    expect(() => captureLegacyWebsiteArchive({ ...work, payload: { ...(work.payload as object), version: 2 } },key)).toThrow();
    expect(() => captureLegacyWebsiteArchive({ ...work, input: { lost: undefined } },key)).toThrow();
  });
  it("exports exact capture evidence and exposes only read-only archive Versions", async () => {
    const { work,current,older } = await fixture();
    const payload = work.payload as ReturnType<typeof legacyArchiveRecord>["website"];
    payload.launch = { status: "pending", candidateRevision: 3, receipt: { status: "pending", receiptId: "original-receipt", provider: "local-export", providerUrl: `/api/websites/${key.workId}/export?revision=3&contentHash=${current.contentHash}`, evidence: "Prepared only", artifactHash: current.contentHash, candidateRevision: 3, preparedAt: current.generatedAt }, failure: null };
    const archive = captureLegacyWebsiteArchive(work,key,[older]);
    const files = legacyArchiveExportFiles(archive);
    expect(JSON.parse(files.find(file => file.path === "original-saved-work.json")!.bytes.toString())).toEqual(work);
    expect(files.find(file => file.path === "versions/2/candidate.json")).toBeUndefined();
    expect(files.find(file => file.path === "versions/1/bundle.json")).toBeTruthy();
    const manifest = JSON.parse(files.find(file => file.path === "legacy-archive.json")!.bytes.toString());
    expect(validateLegacyWebsiteArchive(manifest)).toEqual(archive);
    expect(legacyArchiveRecord(manifest).website.launch.receipt).toEqual(payload.launch.receipt);
    expect(legacyArchiveVersionEntries(manifest).every(version => version.kind === "legacy_archive" && !version.restoreAllowed && !version.publishAllowed)).toBe(true);
    expect(legacyArchiveVersionEntries(manifest)[1]?.availability).toBe("body_unresolved");
    expect(captureLegacyWebsiteArchive(work,key).archiveId).not.toBe(archive.archiveId);
  });

  it("dry-runs without writes and restarts/replays one immutable capture", async () => {
    const { work } = await fixture(); const store = memory(work);
    const first = createLegacyArchiveCaptureService(store.port); const plan = await first.dryRun(actor,key);
    expect(store.port.captureAtomically).not.toHaveBeenCalled();
    expect(await first.commit(actor,plan)).toEqual(plan);
    const restarted = createLegacyArchiveCaptureService(store.port);
    expect(await restarted.commit(actor,plan)).toEqual(plan);
    expect(store.rows.size).toBe(1);
    expect(store.port.authorize).toHaveBeenCalledTimes(5);
  });
  it("rechecks current authority before replay and refuses edits after dry run", async () => {
    const { work } = await fixture(); const store = memory(work); const service = createLegacyArchiveCaptureService(store.port);
    const plan = await service.dryRun(actor,key); await service.commit(actor,plan); store.deny();
    await expect(service.commit(actor,plan)).rejects.toThrow("denied");
    expect(store.rows.size).toBe(1);
    const next = memory(work); const capture = createLegacyArchiveCaptureService(next.port); const prepared = await capture.dryRun(actor,key);
    next.change({ ...work, title: "Concurrent source edit" });
    await expect(capture.commit(actor,prepared)).rejects.toThrow("changed after dry run");
    expect(next.port.captureAtomically).not.toHaveBeenCalled();
  });
  it("requires atomic CAS to reject a source edit racing the final write", async () => {
    const { work } = await fixture(); const store = memory(work); const capture = createLegacyArchiveCaptureService(store.port);
    const plan = await capture.dryRun(actor,key);
    const atomic = store.port.captureAtomically;
    store.port.captureAtomically = vi.fn(async (who, archive) => { store.change({ ...work, title: "Racing edit" }); return atomic(who,archive); });
    await expect(capture.commit(actor,plan)).rejects.toThrow("atomic source conflict");
    expect(store.rows.size).toBe(0);
  });
});
