import { describe, expect, it, vi } from "vitest";
import { declareApplicationPackage } from "@/platform/system-versions/declarations";
import { cloneJson, type JsonObject } from "@/platform/system-versions/compare";
import { createInMemoryVersionStore } from "@/platform/system-versions/store";
import { assessRevisionQualification, parseRevisionQualification, revisionQualificationSchema,
  type RevisionRehearsal } from "@/platform/system-versions/qualification";
import { createInMemoryRevisionQualificationStore, createRevisionQualifications } from "@/platform/system-versions/qualification-store";
import { createSupabaseRevisionQualificationStore } from "@/platform/system-versions/qualification-supabase-store";
import { rehearseSourceApplicationRevision } from "@/products/applications";
import { VersionAccessError, VersionStaleError, type SourceRevision, type VersionActor } from "@/platform/system-versions/types";

const uuid = (n: number) => `bc327000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = "2026-10-08T00:00:00.000Z";
const owner: VersionActor = { userId: uuid(1), verifiedEmail: "creator@example.test", memberships: [{ businessId: uuid(10), role: "owner" }] };
const reader: VersionActor = { userId: uuid(2), verifiedEmail: "reader@example.test", memberships: [{ businessId: uuid(11), role: "member" }] };
function revision(number = 1, title = "Requests"): SourceRevision {
  return { source: { businessId: uuid(10), systemId: uuid(20), revisionId: uuid(30 + number), number },
    definition: declareApplicationPackage({ kind: "internal_app", title, fields: [{ id: "subject", label: "Subject", type: "text", required: true }],
      components: [{ kind: "form", fields: ["subject"] }] }), requires: { bindingKinds: [] }, publishedBy: owner.userId, publishedAt: at, summary: title };
}
const assess = (r = revision(), previous: SourceRevision | null = null, rehearse: RevisionRehearsal = rehearseSourceApplicationRevision) =>
  assessRevisionQualification({ revision: r, previous, rehearse, id: uuid(100), evaluatedBy: owner.userId, evaluatedAt: at, environment: "local" });
async function fixture() {
  const versions = createInMemoryVersionStore();
  const r = revision();
  await versions.putSource(owner, { source: r.source, sharedWith: [uuid(11)], createdAt: at });
  await versions.insertRevision(owner, r);
  const qualifications = createInMemoryRevisionQualificationStore(versions);
  const service = createRevisionQualifications({ versions, qualifications, rehearse: rehearseSourceApplicationRevision, now: () => at, id: () => uuid(100) });
  return { r, versions, qualifications, service };
}

describe("preparatory source revision qualification", () => {
  it("computes four revision-bound checks and keeps human review pending after all pass", async () => {
    const record = await assess();
    expect(record.automatedStatus).toBe("passed");
    expect(record.humanReview).toEqual({ status: "pending", reason: "review_policy_pending" });
    expect(record.evidence).toHaveLength(4);
    expect(record.evidence.every(item => item.source.revisionId === revision().source.revisionId)).toBe(true);
    expect(record.previousRevisionId).toBeNull();
    expect(record.comparedPaths).toEqual([]);
    expect(record).not.toHaveProperty("qualifiedAt");
  });
  it.each(["qualified", "approved", "failed"])("cannot represent a human %s verdict", async status => {
    const record = await assess();
    expect(revisionQualificationSchema.safeParse({ ...record, humanReview: { status, reason: "review_policy_pending" } }).success).toBe(false);
  });
  it("runs the existing native rehearsal without records or provider actions", async () => {
    const r = revision();
    const witness = await rehearseSourceApplicationRevision(r);
    expect(witness.source).toEqual(r.source);
    expect(witness.definition).toEqual(r.definition);
    expect(witness.checks.map(check => check.name)).toEqual(["Declared fields and approved components", "Executable code rejected", "Existing records fit this version"]);
    expect(witness.checks.every(check => check.passed)).toBe(true);
    expect((await assess()).evidence.find(e => e.check === "rehearsal")?.summary).toContain("Customer records and outside delivery were not exercised");
  });
  it("compares the actual immediately prior revision and retains changed paths", async () => {
    const result = await assess(revision(2, "New title"), revision());
    expect(result.previousRevisionId).toBe(uuid(31));
    expect(result.comparedPaths).toEqual(["title"]);
    expect(result.automatedStatus).toBe("passed");
  });
  it("retains changes to required bindings outside the definition", async () => {
    const r = revision(2); r.requires.bindingKinds = ["calendar"];
    (r.definition.declaration as JsonObject).bindingKinds = ["calendar"];
    expect((await assess(r, revision())).comparedPaths).toEqual(["declaration.bindingKinds", "$requires.bindingKinds"]);
  });
  it.each(["missing", "other_source", "other_business", "skipped", "same_id"])("rejects %s prior-revision evidence", async kind => {
    const prior = revision();
    if (kind === "other_source") prior.source.systemId = uuid(21);
    if (kind === "other_business") prior.source.businessId = uuid(11);
    if (kind === "skipped") prior.source.number = 3;
    if (kind === "same_id") prior.source.revisionId = uuid(32);
    await expect(assess(revision(2), kind === "missing" ? null : prior)).rejects.toBeInstanceOf(VersionStaleError);
  });
  it("rejects a prior revision for an initial publication", async () => {
    await expect(assess(revision(), revision())).rejects.toBeInstanceOf(VersionStaleError);
  });
  it.each(["missing_declaration", "underdeclared", "secret", "unknown_behavior"])("computes failure for %s and does not run a rehearsal", async kind => {
    const r = revision();
    if (kind === "missing_declaration") delete r.definition.declaration;
    if (kind === "underdeclared") (r.definition.declaration as JsonObject).outsideEffects = [];
    if (kind === "secret") r.definition.accessToken = "fictional-secret";
    if (kind === "unknown_behavior") r.definition.script = "sendSomething()";
    const rehearse = vi.fn(rehearseSourceApplicationRevision);
    const result = await assess(r, null, rehearse);
    expect(result.automatedStatus).toBe("failed");
    expect(result.evidence.find(item => item.check === "rehearsal")?.status).toBe("failed");
    expect(result.humanReview.status).toBe("pending");
    expect(rehearse).not.toHaveBeenCalled();
  });
  it.each(["source", "revision", "number", "definition", "requires"])("rejects a mismatched rehearsal %s", async mismatch => {
    await expect(assess(revision(), null, async r => {
      const witness = await rehearseSourceApplicationRevision(r);
      if (mismatch === "source") witness.source.systemId = uuid(99);
      if (mismatch === "revision") witness.source.revisionId = uuid(99);
      if (mismatch === "number") witness.source.number = 2;
      if (mismatch === "definition") witness.definition.title = "Later changes";
      if (mismatch === "requires") witness.requires.bindingKinds = ["calendar"];
      return witness;
    })).rejects.toBeInstanceOf(VersionStaleError);
  });
  it.each(["exception", "empty", "failed"])("records an unavailable/%s rehearsal as failed, without leaking errors", async mode => {
    const result = await assess(revision(), null, async r => {
      if (mode === "exception") throw new Error("private provider body");
      const witness = await rehearseSourceApplicationRevision(r);
      witness.checks = mode === "empty" ? [] : [{ name: "Synthetic failure", passed: false }];
      return witness;
    });
    expect(result.automatedStatus).toBe("failed");
    expect(JSON.stringify(result)).not.toContain("private provider");
  });
  it("does not let an adapter mutate the pinned revision while checking", async () => {
    const r = revision();
    await expect(assess(r, null, async snapshot => {
      snapshot.definition.title = "Mutated";
      return rehearseSourceApplicationRevision(snapshot);
    })).rejects.toBeInstanceOf(VersionStaleError);
    expect(r.definition.title).toBe("Requests");
  });
  it("rejects a copied qualification when any source identity changed", async () => {
    const record = await assess();
    for (const field of ["businessId", "systemId", "revisionId", "number"] as const) {
      const source = { ...record.source, [field]: field === "number" ? 2 : uuid(99) };
      expect(() => parseRevisionQualification(record, source)).toThrow(VersionStaleError);
    }
  });
  it("rejects missing/duplicate checks, mixed revision ids and false aggregate passes", async () => {
    const original = await assess();
    const copies = [cloneJson(original), cloneJson(original), cloneJson(original), cloneJson(original)];
    copies[0]!.evidence.pop();
    copies[1]!.evidence[1] = copies[1]!.evidence[0]!;
    copies[2]!.evidence[1]!.source.revisionId = uuid(99);
    copies[3]!.evidence[1]!.status = "failed";
    for (const record of copies) expect(revisionQualificationSchema.safeParse(record).success).toBe(false);
  });
});

describe("source qualification stores", () => {
  it("rechecks source authority and stores an exact-revision record", async () => {
    const { r, service } = await fixture();
    await expect(service.assess(reader, r.source)).rejects.toBeInstanceOf(VersionAccessError);
    const record = await service.assess(owner, r.source);
    expect(await service.list(reader, r.source)).toEqual([record]);
  });
  it("provider seats do not become source-review or creator authority", async () => {
    const { r, service } = await fixture();
    const seat = { ...owner, memberships: [{ businessId: uuid(10), role: "owner" as const, via: "provider_seat" as const }] };
    await expect(service.assess(seat, r.source)).rejects.toBeInstanceOf(VersionAccessError);
  });
  it("retains existing source visibility for a current provider-seat reader", async () => {
    const { r, service } = await fixture(); const record = await service.assess(owner, r.source);
    const seat = { ...reader, memberships: [{ businessId: uuid(10), role: "admin" as const, via: "provider_seat" as const }] };
    expect(await service.list(seat, r.source)).toEqual([record]);
  });
  it("preserves old evidence without carrying it into a new revision", async () => {
    const { r, versions, service } = await fixture();
    const first = await service.assess(owner, r.source);
    const next = revision(2, "Next revision"); await versions.insertRevision(owner, next);
    expect(await service.list(owner, next.source)).toEqual([]);
    expect(await service.list(owner, r.source)).toEqual([first]);
    await expect(service.assess(owner, { ...r.source, revisionId: uuid(99) })).rejects.toBeInstanceOf(VersionStaleError);
  });
  it("replays the same record id but refuses replacement", async () => {
    const { r, service, qualifications } = await fixture();
    const first = await service.assess(owner, r.source);
    expect(await qualifications.append(owner, r, first)).toEqual(first);
    const changed = cloneJson(first); changed.evidence[0]!.summary = "Different evidence";
    await expect(qualifications.append(owner, r, changed)).rejects.toBeInstanceOf(VersionStaleError);
    expect(await service.list(owner, r.source)).toEqual([first]);
  });
  it("stores failed automated attempts without asserting failed human review", async () => {
    const { r, versions, qualifications } = await fixture();
    const service = createRevisionQualifications({ versions, qualifications, rehearse: async () => { throw new Error("unavailable"); } });
    const record = await service.assess(owner, r.source);
    expect(record.automatedStatus).toBe("failed"); expect(record.humanReview.status).toBe("pending");
  });
  it("revocation blocks subsequent shared reads", async () => {
    const { r, versions, service } = await fixture(); await service.assess(owner, r.source);
    await versions.putSource(owner, { source: r.source, sharedWith: [], createdAt: at });
    await expect(service.list(reader, r.source)).rejects.toBeInstanceOf(VersionAccessError);
  });
  it("refuses same-id definition/requirement snapshots different from storage", async () => {
    const { r, service, qualifications } = await fixture(); const record = await service.assess(owner, r.source);
    const wrong = cloneJson(r); wrong.definition.title = "Unstored title";
    await expect(qualifications.append(owner, wrong, record)).rejects.toBeInstanceOf(VersionStaleError);
  });
  it("memory storage independently rejects forged lint and comparison outcomes", async () => {
    const { r, versions, qualifications } = await fixture();
    const next = revision(2, "New title"); await versions.insertRevision(owner, next);
    const record = await assess(next, r);
    const noChanges = cloneJson(record); noChanges.comparedPaths = [];
    await expect(qualifications.append(owner, next, noChanges)).rejects.toBeInstanceOf(VersionStaleError);
    const badLint = cloneJson(record); badLint.evidence[0]!.status = "failed"; badLint.automatedStatus = "failed";
    await expect(qualifications.append(owner, next, badLint)).rejects.toBeInstanceOf(VersionStaleError);
    expect(await qualifications.list(owner, next.source)).toEqual([]);
  });
  it("rejects mixed evidence clocks, unsupported environments and wrong check kinds", async () => {
    const original = await assess();
    for (const [field, value] of [["checkedAt", "2026-10-09T00:00:00.000Z"], ["environment", "production"], ["kind", "review"], ["id", "unbound_check"]] as const) {
      const raw = cloneJson(original) as unknown as { evidence: Array<Record<string, unknown>> };
      raw.evidence[0]![field] = value;
      expect(revisionQualificationSchema.safeParse(raw).success).toBe(false);
    }
  });
  it("passes only server-generated evidence and exact snapshots into the RPC", async () => {
    const r = revision(); const record = await assess();
    const rpc = vi.fn(async () => ({ data: record, error: null }));
    const store = createSupabaseRevisionQualificationStore({ rpc });
    expect(await store.append(owner, r, record)).toEqual(record);
    expect(rpc).toHaveBeenCalledWith("record_system_revision_qualification", {
      p_user_id: owner.userId, p_verified_email: owner.verifiedEmail, p_revision_id: r.source.revisionId,
      p_definition: r.definition, p_requires: [], p_record: record,
    });
  });
  it.each(["changed_record", "wrong_source", "missing_email", "stale_error"])("fails closed on %s storage responses", async scenario => {
    const r = revision(); const record = await assess(); const altered = cloneJson(record);
    if (scenario === "changed_record") altered.evidence[0]!.summary = "Different";
    if (scenario === "wrong_source") altered.source.revisionId = uuid(99);
    const rpc = vi.fn(async () => ({ data: altered, error: scenario === "stale_error" ? { message: "system_revision_qualification_stale" } : null }));
    const store = createSupabaseRevisionQualificationStore({ rpc });
    await expect(store.append({ ...owner, verifiedEmail: scenario === "missing_email" ? undefined : owner.verifiedEmail }, r, record)).rejects.toThrow();
  });
  it("refuses malformed or cross-revision storage reads", async () => {
    const record = await assess();
    for (const data of [{}, [record]]) {
      const store = createSupabaseRevisionQualificationStore({ rpc: async () => ({ data, error: null }) });
      await expect(store.list(owner, revision(2).source)).rejects.toThrow();
    }
  });
});
