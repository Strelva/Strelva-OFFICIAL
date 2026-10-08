import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { createInMemoryPossibilityRepository, type Possibility } from "@/platform/possibilities";
import type { ListedPossibility, SupabasePossibilityRepository } from "@/platform/possibilities/supabase-repository";
import { createInMemoryLiveSystems } from "@/platform/make-real";
import type { Activation } from "@/platform/make-real/contracts";
import type { SystemListing } from "@/platform/systems/from-existing";
import type { WebsiteRebuildCandidate } from "@/products/websites/index";
import {
  activationViews,
  makeRealReceipts,
  rebuildPossibilityInput,
  rebuildSourceRef,
  revisionHistory,
  storedPossibilityViews,
  syncRebuildPossibilities,
  type StoredTarget,
} from "@/experience/systems/stored-possibilities";

/*
 * Rebuild Possibilities kept in Postgres for stored website Systems. The
 * repository here is an in-memory twin of the Postgres one (same interface);
 * possibility-repository.test.ts runs the real RPCs.
 */

const BIZ = "c1000000-0000-4000-8000-000000000001";
const ACTOR = "c1000000-0000-4000-8000-0000000000a1";
const AT = "2026-10-06T12:00:00.000Z";
const HASH = "b".repeat(64);

function memoryRepo(options: { deny?: boolean } = {}): SupabasePossibilityRepository & { writes: number } {
  const inner = createInMemoryPossibilityRepository();
  const sources = new Map<string, string>();
  const repo = {
    writes: 0,
    get: inner.get, list: inner.list,
    async create(value: Possibility) { if (options.deny) throw new WorkspaceAccessError(); repo.writes++; await inner.create(value); },
    async save(value: Possibility, expected: number) { if (options.deny) throw new WorkspaceAccessError(); repo.writes++; await inner.save(value, expected); },
    async createFromSource(value: Possibility, sourceRef: string) {
      const existing = sources.get(sourceRef);
      if (existing) return { possibility: (await inner.get(value.businessId, existing))!, replayed: true };
      await repo.create(value);
      sources.set(sourceRef, value.id);
      return { possibility: value, replayed: false };
    },
    async listWithSources(businessId: string): Promise<ListedPossibility[]> {
      const rows = await inner.list(businessId);
      return rows.map((possibility) => ({ possibility, sourceRef: [...sources].find(([, id]) => id === possibility.id)?.[0] ?? null, lastActivityAt: AT }));
    },
  };
  return repo;
}

function candidate(over: Partial<WebsiteRebuildCandidate> = {}): WebsiteRebuildCandidate {
  return {
    workId: "c1000000-0000-4000-8000-0000000000w1".replace("w", "c"), title: "The Mooney Firm, rebuilt", sourceHost: "attymooney.com", tenantId: "mooney",
    ready: true, summary: "The same business, pages and facts, rebuilt on Strelva's website system.", evidence: "12 of 12 pages carried over.",
    previewHref: "/api/websites/x/preview", candidateRevision: 3, candidateContentHash: HASH, origin: "rebuild", ...over,
  };
}

function siteListing(systemId: string, revisionId: string): SystemListing {
  return {
    system: { id: systemId, businessId: BIZ, name: "attymooney.com", purpose: null, kind: "website", lifecycle: "live", currentRevision: { businessId: BIZ, systemId, revisionId, number: 1 }, origin: { kind: "tenant", ref: "c1000000-0000-4000-8000-0000000000b1" }, changeNumber: 3, createdAt: AT, updatedAt: AT },
    provenance: "stored", basis: null, references: { savedWorkId: null, tenantStableId: "c1000000-0000-4000-8000-0000000000b1", tenantId: "mooney" },
  };
}

function fixture() {
  const live = createInMemoryLiveSystems();
  const ref = { businessId: BIZ, systemId: "c1000000-0000-4000-8000-0000000000e1" };
  const revisionId = live.seed(ref, "attymooney.com", { pointer: "tenant_content" });
  const target: StoredTarget = { candidate: candidate(), site: siteListing(ref.systemId, revisionId), inquiries: [], domain: "attymooney.com" };
  const revisions = new Map([[ref.systemId, { revisionId, number: 1 }]]);
  return { live, ref, target, revisions };
}

describe("stored rebuild possibilities", () => {
  it("pins the stored site's current revision and publishes through the hosted website channel", () => {
    const { target, revisions } = fixture();
    const input = rebuildPossibilityInput(target, revisions)!;
    expect(input.changes![0]!.baseline).toMatchObject({ systemId: target.site.system.id, number: 1 });
    expect(input.effects).toEqual([expect.objectContaining({ kind: "publish", channel: "hosted_website", request: { workId: target.candidate.workId, candidateRevision: 3, candidateContentHash: HASH, tenantId: "mooney" } })]);
    expect(rebuildPossibilityInput({ ...target, candidate: candidate({ candidateRevision: null }) }, revisions)).toBeNull();
    expect(rebuildPossibilityInput(target, new Map())).toBeNull();
  });

  it("creates one stored possibility per rebuild, Ready when reviewed, and never doubles it", async () => {
    const { live, target, revisions } = fixture();
    const repo = memoryRepo();
    const deps = { repo, live: live.port, businessId: BIZ, targets: [target], revisions, actorId: ACTOR, at: AT, canWrite: true };
    const first = await syncRebuildPossibilities(deps);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ sourceRef: rebuildSourceRef(target.candidate.workId), possibility: { status: "ready" } });
    const writes = repo.writes;
    const again = await syncRebuildPossibilities(deps);
    expect(again.map((row) => row.possibility.id)).toEqual(first.map((row) => row.possibility.id));
    expect(repo.writes).toBe(writes);
  });

  it("recovers when rehearsal persisted but a concurrent Ready save failed", async () => {
    const { live, target, revisions } = fixture();
    const repo = memoryRepo();
    const save = repo.save;
    let interrupted = false;
    repo.save = async (value, expected) => {
      if (value.status === "ready" && !interrupted) {
        interrupted = true;
        throw new Error("Synthetic concurrent Ready-write failure");
      }
      return save(value, expected);
    };
    const deps = { repo, live: live.port, businessId: BIZ, targets: [target], revisions, actorId: ACTOR, at: AT, canWrite: true };
    await syncRebuildPossibilities(deps);
    const first = await repo.listWithSources(BIZ);
    expect(first[0]!.possibility).toMatchObject({ status: "exploring", rehearsal: { ok: true } });
    const recovered = await syncRebuildPossibilities(deps);
    expect(recovered[0]!.possibility).toMatchObject({ id: first[0]!.possibility.id, status: "ready", rehearsal: { ok: true } });
    const writes = repo.writes;
    expect((await syncRebuildPossibilities(deps))[0]!.possibility.status).toBe("ready");
    expect(repo.writes).toBe(writes);
  });

  it.each(["live moved", "review withdrawn", "member"] as const)("does not recover partial readiness when %s", async (reason) => {
    const { live, ref, target, revisions } = fixture();
    const repo = memoryRepo();
    const save = repo.save;
    repo.save = async (value, expected) => {
      if (value.status === "ready") throw new Error("Synthetic interrupted Ready save");
      return save(value, expected);
    };
    const deps = { repo, live: live.port, businessId: BIZ, targets: [target], revisions, actorId: ACTOR, at: AT, canWrite: true };
    await syncRebuildPossibilities(deps);
    repo.save = save;
    const before = (await repo.listWithSources(BIZ))[0]!.possibility;
    const writes = repo.writes;
    if (reason === "live moved") live.edit(ref, { pointer: "tenant_content@changed-after-rehearsal" });
    const [retried] = await syncRebuildPossibilities({
      ...deps,
      targets: reason === "review withdrawn" ? [{ ...target, candidate: candidate({ ready: false }) }] : deps.targets,
      canWrite: reason !== "member",
    });
    expect(retried!.possibility).toMatchObject({ id: before.id, status: "exploring" });
    if (reason === "live moved") expect(retried!.possibility.rehearsal!.ok).toBe(false);
    else expect(repo.writes).toBe(writes);
  });

  it("refreshes the candidate when the rebuild or the live site moved, and asks again", async () => {
    const { live, ref, target, revisions } = fixture();
    const repo = memoryRepo();
    const deps = { repo, live: live.port, businessId: BIZ, targets: [target], revisions, actorId: ACTOR, at: AT, canWrite: true };
    const [created] = await syncRebuildPossibilities(deps);
    const moved = live.edit(ref, { pointer: "tenant_content@v2" });
    const refreshed = await syncRebuildPossibilities({ ...deps, revisions: new Map([[ref.systemId, { revisionId: moved, number: 2 }]]), targets: [{ ...target, candidate: candidate({ candidateRevision: 4 }) }] });
    expect(refreshed[0]!.possibility).toMatchObject({ id: created!.possibility.id, status: "ready", candidateRevision: 2 });
    expect(refreshed[0]!.possibility.changes[0]!.baseline.revisionId).toBe(moved);
  });

  it("a member reads what is stored and writes nothing; a refused write stops quietly", async () => {
    const { live, target, revisions } = fixture();
    const repo = memoryRepo();
    await expect(syncRebuildPossibilities({ repo, live: live.port, businessId: BIZ, targets: [target], revisions, actorId: ACTOR, at: AT, canWrite: false })).resolves.toEqual([]);
    expect(repo.writes).toBe(0);
    const denied = memoryRepo({ deny: true });
    await expect(syncRebuildPossibilities({ repo: denied, live: live.port, businessId: BIZ, targets: [target], revisions, actorId: ACTOR, at: AT, canWrite: true })).resolves.toEqual([]);
  });

  it("shows open ones with the reason a stale one went back to Exploring; made real moves to History", async () => {
    const { live, target, revisions } = fixture();
    const [row] = await syncRebuildPossibilities({ repo: memoryRepo(), live: live.port, businessId: BIZ, targets: [target], revisions, actorId: ACTOR, at: AT, canWrite: true });
    const stale: Possibility = { ...row!.possibility, status: "exploring", revision: row!.possibility.revision + 1, history: [...row!.possibility.history, { revision: row!.possibility.revision + 1, kind: "stale", actorId: ACTOR, at: AT, detail: "attymooney.com changed since this was built." }] };
    const views = storedPossibilityViews([{ ...row!, possibility: stale }, { ...row!, possibility: { ...row!.possibility, id: randomUUID(), status: "made_real" } }], [target.candidate]);
    expect(views).toEqual([expect.objectContaining({ id: stale.id, status: "exploring", stored: true, staleReason: "attymooney.com changed since this was built.", workId: target.candidate.workId, previewHref: "/api/websites/x/preview" })]);
  });
});

function activation(over: Partial<Activation>): Activation {
  return {
    version: 1, id: "act-1", businessId: BIZ, possibilityId: "p", candidateRevision: 1, actorId: ACTOR, status: "needs_attention", revision: 4,
    pinned: [], introduced: [], connections: [], approvals: [], checks: [],
    steps: [
      { id: "effect:publish-site", kind: "effect", target: "publish-site", label: "Publish the rebuilt attymooney.com", dependsOn: [], reversibility: "compensable", idempotencyKey: "k1", status: "completed", effect: "accepted", attempts: 1,
        receipt: { providerRef: "w:hosted-3", adapterMode: "live", acceptedAt: AT }, readBack: { status: "confirmed", detail: "ok", at: AT } },
      { id: "effect:google", kind: "effect", target: "google", label: "Add the booking link on Google", dependsOn: [], reversibility: "irreversible", idempotencyKey: "k2", status: "blocked", effect: "none", attempts: 1, reason: "Waiting: Google hasn't approved Strelva's access yet." },
      { id: "effect:iso", kind: "effect", target: "iso", label: "Isolated rehearsal write", dependsOn: [], reversibility: "compensable", idempotencyKey: "k3", status: "completed", effect: "accepted", attempts: 1, receipt: { providerRef: "isolated-publish-1", adapterMode: "isolated", acceptedAt: AT } },
    ],
    createdAt: AT, updatedAt: AT, history: [], ...over,
  };
}

describe("Make real on Home and the System page", () => {
  const p = { id: "p", title: "A rebuilt attymooney.com", changes: [{ baseline: { businessId: BIZ, systemId: "c1000000-0000-4000-8000-0000000000e1", revisionId: "r", number: 1 } }], history: [], status: "ready" } as unknown as Possibility;

  it("In progress reads Partly live with each line in the customer's words; isolated lines never show", () => {
    const [view] = activationViews([{ possibility: p, activation: activation({}) }]);
    expect(view).toMatchObject({ headline: "Partly live", partlyLive: true, affects: ["c1000000-0000-4000-8000-0000000000e1"] });
    expect(view!.lines).toEqual([
      { label: "Publish the rebuilt attymooney.com", state: "Done", detail: null },
      { label: "Add the booking link on Google", state: "Waiting", detail: "Google hasn't approved Strelva's access yet." },
    ]);
    expect(activationViews([{ possibility: p, activation: activation({ status: "in_progress", steps: activation({}).steps.map((s) => ({ ...s, status: "pending", effect: "none", receipt: undefined, readBack: undefined, reason: undefined })) }) }])[0]!.headline)
      .toBe("Making the rebuilt attymooney.com live: 0 of 3 done");
  });

  it("Strelva handled lists each live accepted effect and the settled summary, never an isolated one", () => {
    const receipts = makeRealReceipts([{ possibility: p, activation: activation({ status: "made_real" }) }], Date.parse(AT) - 1000);
    expect(receipts.map((r) => r.sentence)).toEqual(["Strelva: Publish the rebuilt attymooney.com", 'Strelva made "A rebuilt attymooney.com" live']);
    expect(receipts[0]!.undo).toBe("Undo from History");
    expect(makeRealReceipts([{ possibility: p, activation: activation({}) }], Date.parse(AT) + 1000)).toEqual([]);
    const withdrawn = { ...p, status: "withdrawn", history: [{ revision: 9, kind: "withdraw_idle", actorId: "strelva", at: AT }] } as unknown as Possibility;
    expect(makeRealReceipts([{ possibility: withdrawn, activation: null }], Date.parse(AT) - 1)).toEqual([expect.objectContaining({ sentence: 'Strelva set aside "A rebuilt attymooney.com" after 90 days without activity' })]);
  });

  it("History reads the System's own changes, newest first, never calling them Versions", () => {
    const rows = revisionHistory("s1", [
      { id: "r1", businessId: BIZ, systemId: "s1", number: 1, implementation: { kind: "tenant_content", ref: "x@initial" }, summary: "Adopted at conversion.", createdAt: "2026-10-01T00:00:00.000Z", createdBy: ACTOR },
      { id: "r2", businessId: BIZ, systemId: "s1", number: 2, implementation: { kind: "tenant_content", ref: "x@v_2" }, summary: "Website content changed.", createdAt: "2026-10-02T00:00:00.000Z", createdBy: ACTOR },
      { id: "r3", businessId: BIZ, systemId: "s1", number: 3, implementation: { kind: "make_real_content", ref: "sha256:a", contentHash: HASH }, summary: "the rebuilt attymooney.com", createdAt: "2026-10-03T00:00:00.000Z", createdBy: ACTOR },
    ]);
    expect(rows.map((r) => r.sentence)).toEqual(["Made live: the rebuilt attymooney.com", "Website content changed", "Strelva started running it"]);
    expect(rows.every((r) => !/version/i.test(r.sentence))).toBe(true);
  });
});
