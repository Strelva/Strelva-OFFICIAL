import { describe, expect, it, vi } from "vitest";
import { createInvestigationService } from "@/products/investigations/server";
import { memoryBoundedStore, owner } from "./fixtures/bounded-store";
import { createDocument } from "@/products/documents/contracts";
import { sweepDueWork } from "@/products/operations/sweep";

describe("ongoing investigation commands", () => {
  it("compares two authorized versioned sources, reports discrepancy then no change on a repeated run", async () => {
    const store = memoryBoundedStore();
    const left = await store.create(owner, "workspace-a", { productId: "documents", resourceKind: "document", payload: createDocument({ title: "Policy", text: "Tuesday" }, owner.userId) });
    const right = await store.create(owner, "workspace-a", { productId: "documents", resourceKind: "document", payload: createDocument({ title: "Website copy", text: "Wednesday" }, owner.userId) });
    const service = createInvestigationService(store);
    const work = await service.create(owner, "workspace-a", { title: "Opening day agreement", intervalMinutes: 60, sources: [{ workId: left.id }, { workId: right.id }] });
    const first = await service.run(owner, work.id, { expectedRevision: 0, requestId: "run-1" });
    expect(first.payload.runs[0]).toMatchObject({ result: "discrepancy", differences: [{ key: "document", left: "Tuesday", right: "Wednesday" }] });
    expect(first.payload.runs[0]!.sources.map(source => source.revision)).toEqual([0, 0]);
    const nextTime = new Date(Date.now() + 61 * 60000);
    const repeated = await service.run(owner, work.id, { expectedRevision: 1, requestId: "run-2" }, nextTime);
    expect(repeated.payload.runs[1]).toMatchObject({ result: "no_change", differences: [{ key: "document", left: "Tuesday", right: "Wednesday" }] });
  });
  it("does not run paused or prematurely and rejects missing source access", async () => {
    const store = memoryBoundedStore();
    const doc = (text: string) => createDocument({ title: "Hours", text }, owner.userId);
    const a = await store.create(owner, "workspace-a", { productId: "documents", resourceKind: "document", payload: doc("Monday") });
    const b = await store.create(owner, "workspace-a", { productId: "documents", resourceKind: "document", payload: doc("Monday") });
    const service = createInvestigationService(store);
    await expect(service.create(owner, "workspace-a", { title: "Hours", intervalMinutes: 60, sources: [{ workId: a.id }, { workId: "11111111-1111-4111-8111-111111111111" }] })).rejects.toThrow(/unavailable/i);
    const work = await service.create(owner, "workspace-a", { title: "Hours", intervalMinutes: 60, sources: [{ workId: a.id }, { workId: b.id }] });
    const first = await service.run(owner, work.id, { expectedRevision: 0, requestId: "first" });
    expect(first.payload.runs[0]!.result).toBe("agreement");
    await expect(service.run(owner, work.id, { expectedRevision: 1, requestId: "early" })).rejects.toThrow(/not due/i);
    await service.command(owner, work.id, { kind: "pause", expectedRevision: 1 });
    await expect(service.run(owner, work.id, { expectedRevision: 2, requestId: "paused" }, new Date(Date.now() + 3600001))).rejects.toThrow(/paused/i);
    expect((await service.read(owner, work.id)).payload.runs).toHaveLength(1);
  });

  it("records a durable unavailable result when a saved source disappears, then retries with the prior evidence intact", async () => {
    const store = memoryBoundedStore();
    const doc = (text: string) => createDocument({ title: "Hours", text }, owner.userId);
    const left = await store.create(owner, "workspace-a", { productId: "documents", resourceKind: "document", payload: doc("Monday") });
    const right = await store.create(owner, "workspace-a", { productId: "documents", resourceKind: "document", payload: doc("Monday") });
    const originalRead = store.read.bind(store);
    let unavailableRight = false;
    store.read = async (actor, workId) => unavailableRight && workId === right.id ? null : originalRead(actor, workId);
    const service = createInvestigationService(store);
    const work = await service.create(owner, "workspace-a", { title: "Hours", intervalMinutes: 60, sources: [{ workId: left.id }, { workId: right.id }] });
    const first = await service.run(owner, work.id, { expectedRevision: 0, requestId: "available" });
    unavailableRight = true;
    const unavailable = await service.run(owner, work.id, { expectedRevision: 1, requestId: "missing" }, new Date(Date.now() + 61 * 60000));
    expect(unavailable.payload.runs[1]).toMatchObject({ result: "unavailable", unavailableReason: "missing_source", retryable: true });
    expect(unavailable.payload.runs[1]!.sources).toEqual(first.payload.runs[0]!.sources);
    expect(unavailable.payload.runs[1]!.sourceStates).toEqual(expect.arrayContaining([expect.objectContaining({ workId: right.id, status: "missing" })]));
    unavailableRight = false;
    const recovered = await service.run(owner, work.id, { expectedRevision: 2, requestId: "recovered" }, new Date(Date.now() + 62 * 60000));
    expect(recovered.payload.runs[2]!.result).toBe("agreement");
  });

  it("records a durable source-change conflict and allows a clean retry", async () => {
    const store = memoryBoundedStore();
    const doc = (text: string) => createDocument({ title: "Hours", text }, owner.userId);
    const left = await store.create(owner, "workspace-a", { productId: "documents", resourceKind: "document", payload: doc("Monday") });
    const right = await store.create(owner, "workspace-a", { productId: "documents", resourceKind: "document", payload: doc("Monday") });
    const service = createInvestigationService(store);
    const work = await service.create(owner, "workspace-a", { title: "Hours", intervalMinutes: 60, sources: [{ workId: left.id }, { workId: right.id }] });
    const originalRead = store.read.bind(store);
    let rightReads = 0;
    let mutateDuringCheck = true;
    store.read = async (actor, workId) => {
      const value = await originalRead(actor, workId);
      if (value && workId === right.id) {
        rightReads += 1;
        if (mutateDuringCheck && rightReads === 2) return { ...value, payload: doc("Tuesday"), updatedAt: new Date().toISOString() };
      }
      return value;
    };
    const changed = await service.run(owner, work.id, { expectedRevision: 0, requestId: "changed" });
    expect(changed.payload.runs[0]).toMatchObject({ result: "unavailable", unavailableReason: "source_changed", retryable: true });
    expect(changed.payload.runs[0]!.sourceStates).toEqual(expect.arrayContaining([expect.objectContaining({ workId: right.id, status: "changed" })]));
    mutateDuringCheck = false;
    const recovered = await service.run(owner, work.id, { expectedRevision: 1, requestId: "changed-retry" }, new Date(Date.now() + 61 * 60000));
    expect(recovered.payload.runs[1]!.result).toBe("agreement");
  });

  it("reads a saved public URL through the canonical snapshot boundary and detects content changes", async () => {
    const store = memoryBoundedStore();
    const document = await store.create(owner, "workspace-a", { productId: "documents", resourceKind: "document", payload: createDocument({ title: "Expected price", text: "$100" }, owner.userId) });
    let page = { contentFingerprint: "a".repeat(64), fingerprint: "b".repeat(64), contentExcerpt: "Product price: $100", contentVisibility: "server_visible" as const, observedAt: "2026-09-20T12:00:00.000Z" };
    let reads = 0;
    const readPublicWebsite = vi.fn(async () => ({
      sourceUrl: "https://example.test/",
      freshness: "fresh" as const,
      status: "available" as const,
      retryable: false,
      ...page,
      observedAt: new Date(Date.parse(page.observedAt) + reads++ * 1_000).toISOString(),
    }));
    const service = createInvestigationService(store, { readPublicWebsite });
    const work = await service.create(owner, "workspace-a", {
      title: "Public price check",
      intervalMinutes: 60,
      sources: [{ kind: "public_website", url: "https://example.test/" }, { workId: document.id }],
    });
    const first = await service.run(owner, work.id, { expectedRevision: 0, requestId: "public-first" });
    expect(first.payload.runs[0]).toMatchObject({ result: "discrepancy" });
    expect(first.payload.runs[0]!.sources[0]).toMatchObject({
      kind: "public_website",
      sourceUrl: "https://example.test/",
      contentFingerprint: "a".repeat(64),
      auditFingerprint: "b".repeat(64),
      status: "available",
      freshness: "fresh",
    });

    const repeated = await service.run(owner, work.id, { expectedRevision: 1, requestId: "public-repeat" }, new Date(Date.now() + 61 * 60000));
    expect(repeated.payload.runs[1]!.result).toBe("no_change");
    // The audit category score is unchanged. The visible price text still
    // needs to produce a useful temporal finding.
    page = { contentFingerprint: "c".repeat(64), fingerprint: "b".repeat(64), contentExcerpt: "Product price: $120", contentVisibility: "server_visible" as const, observedAt: "2026-09-20T13:02:00.000Z" };
    const changed = await service.run(owner, work.id, { expectedRevision: 2, requestId: "public-changed" }, new Date(Date.now() + 122 * 60000));
    expect(changed.payload.runs[2]!.result).toBe("discrepancy");
    expect(changed.payload.runs[2]!.sources[0]!.contentFingerprint).toBe("c".repeat(64));
    expect(changed.payload.runs[2]!.sources[0]!.auditFingerprint).toBe("b".repeat(64));
    expect(changed.payload.runs[2]!.differences).toEqual(expect.arrayContaining([expect.objectContaining({ key: "public_page_text", left: "Product price: $120" })]));
    expect(readPublicWebsite).toHaveBeenCalledTimes(6);
  });

  it("monitors one public page against its prior snapshot through the background sweep", async () => {
    const store = memoryBoundedStore();
    let state: "same" | "changed" | "denied" = "same";
    const readPublicWebsite = vi.fn(async () => state === "denied"
      ? { sourceUrl: "https://example.test/pricing", observedAt: new Date().toISOString(), freshness: "unavailable" as const, status: "access_denied" as const, retryable: true, reason: "source_access_denied" }
      : { sourceUrl: "https://example.test/pricing", observedAt: new Date().toISOString(), freshness: "fresh" as const, status: "available" as const, retryable: false, contentFingerprint: state === "changed" ? "c".repeat(64) : "a".repeat(64), fingerprint: "b".repeat(64), contentLength: state === "changed" ? 20 : 20, contentExcerpt: state === "changed" ? "Product price: $120" : "Product price: $100", contentVisibility: "server_visible" as const, fetchedUrl: "https://example.test/pricing" });
    const service = createInvestigationService(store, { readPublicWebsite });
    const work = await service.create(owner, "workspace-a", { title: "Watch the public price", intervalMinutes: 15, mode: "public_website", sources: [{ kind: "public_website", url: "https://example.test/pricing" }] });
    const due = [{ id: work.id, productId: "investigations" as const, actor: owner }];
    const sweep = () => sweepDueWork(due, 20_000, { readInvestigation: service.read, runInvestigation: service.run });
    const makeDue = async () => {
      const current = await service.read(owner, work.id);
      return store.update(owner, current, current.payload.revision, { ...current.payload, nextRunAt: new Date(Date.now() - 1_000).toISOString() });
    };

    expect(await sweep()).toMatchObject({ processed: 1, failed: 0 });
    let current = await service.read(owner, work.id);
    expect(current.payload.mode).toBe("public_website");
    expect(current.payload.runs[0]).toMatchObject({ result: "baseline", sources: [{ sourceUrl: "https://example.test/pricing", contentExcerpt: "Product price: $100" }] });

    await service.command(owner, work.id, { kind: "pause", expectedRevision: current.payload.revision });
    expect(await sweep()).toMatchObject({ processed: 0, failed: 1, failures: [expect.objectContaining({ error: expect.stringMatching(/paused/i) })] });
    current = await service.command(owner, work.id, { kind: "resume", expectedRevision: current.payload.revision + 1 });
    await makeDue();
    state = "changed";
    expect(await sweep()).toMatchObject({ processed: 1, failed: 0 });
    current = await service.read(owner, work.id);
    expect(current.payload.runs[1]).toMatchObject({ result: "changed" });
    expect(current.payload.runs[1]!.differences).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "public_page_text", left: "Product price: $100", right: "Product price: $120" }),
    ]));
    expect(current.payload.runs[1]!.sources[0]!.auditFingerprint).toBe("b".repeat(64));

    state = "denied";
    await makeDue();
    expect(await sweep()).toMatchObject({ processed: 1, failed: 0 });
    current = await service.read(owner, work.id);
    expect(current.payload.runs[2]).toMatchObject({ result: "unavailable", unavailableReason: "inaccessible_source", retryable: true });
    expect(current.payload.runs[2]!.sources).toEqual(current.payload.runs[1]!.sources);
    expect(current.payload.runs[2]!.sourceStates).toEqual([expect.objectContaining({ status: "access_denied", sourceUrl: "https://example.test/pricing" })]);

    state = "changed";
    await makeDue();
    expect(await sweep()).toMatchObject({ processed: 1, failed: 0 });
    current = await service.read(owner, work.id);
    expect(current.payload.runs[3]).toMatchObject({ result: "no_change" });
  });

  it("keeps the prior public snapshot when a page is denied, then records recovery", async () => {
    const store = memoryBoundedStore();
    const document = await store.create(owner, "workspace-a", { productId: "documents", resourceKind: "document", payload: createDocument({ title: "Expected price", text: "$100" }, owner.userId) });
    let denied = false;
    const readPublicWebsite = vi.fn(async () => denied
      ? { sourceUrl: "https://example.test/", observedAt: "2026-09-20T13:00:00.000Z", freshness: "unavailable" as const, status: "access_denied" as const, retryable: true, reason: "source_access_denied" }
      : { sourceUrl: "https://example.test/", observedAt: "2026-09-20T12:00:00.000Z", freshness: "fresh" as const, status: "available" as const, retryable: false, contentFingerprint: "a".repeat(64), fingerprint: "b".repeat(64) });
    const service = createInvestigationService(store, { readPublicWebsite });
    const work = await service.create(owner, "workspace-a", { title: "Public recovery", intervalMinutes: 60, sources: [{ kind: "public_website", url: "https://example.test/" }, { workId: document.id }] });
    const first = await service.run(owner, work.id, { expectedRevision: 0, requestId: "available" });
    denied = true;
    const unavailable = await service.run(owner, work.id, { expectedRevision: 1, requestId: "denied" }, new Date(Date.now() + 61 * 60000));
    expect(unavailable.payload.runs[1]).toMatchObject({ result: "unavailable", unavailableReason: "inaccessible_source", retryable: true });
    expect(unavailable.payload.runs[1]!.sources).toEqual(first.payload.runs[0]!.sources);
    expect(unavailable.payload.runs[1]!.sourceStates).toEqual(expect.arrayContaining([expect.objectContaining({ status: "access_denied", sourceUrl: "https://example.test/" })]));
    denied = false;
    const recovered = await service.run(owner, work.id, { expectedRevision: 2, requestId: "recovered" }, new Date(Date.now() + 122 * 60000));
    expect(recovered.payload.runs[2]!.sources[0]!.status).toBe("available");
  });

  it("saves an inaccessible public URL before its first due read", async () => {
    const store = memoryBoundedStore();
    const document = await store.create(owner, "workspace-a", { productId: "documents", resourceKind: "document", payload: createDocument({ title: "Expected price", text: "$100" }, owner.userId) });
    const readPublicWebsite = vi.fn(async () => ({
      sourceUrl: "https://example.test/pricing",
      observedAt: "2026-09-20T12:00:00.000Z",
      freshness: "unavailable" as const,
      status: "access_denied" as const,
      retryable: true,
      reason: "source_access_denied",
    }));
    const service = createInvestigationService(store, { readPublicWebsite });
    const work = await service.create(owner, "workspace-a", { title: "Public access check", intervalMinutes: 60, sources: [{ kind: "public_website", url: "https://example.test/pricing" }, { workId: document.id }] });
    expect(work.payload.sources[0]).toEqual({ kind: "public_website", url: "https://example.test/pricing" });
    const unavailable = await service.run(owner, work.id, { expectedRevision: 0, requestId: "first-read-denied" });
    expect(unavailable.payload.runs[0]).toMatchObject({ result: "unavailable", retryable: true, unavailableReason: "inaccessible_source" });
    expect(unavailable.payload.runs[0]!.sourceStates).toEqual(expect.arrayContaining([expect.objectContaining({ status: "access_denied", sourceUrl: "https://example.test/pricing" })]));
    expect(readPublicWebsite).toHaveBeenCalledTimes(1);
  });

  it("records limited evidence for a client-rendered page instead of claiming unchanged content", async () => {
    const store = memoryBoundedStore();
    let visible = false;
    const readPublicWebsite = vi.fn(async () => visible
      ? { sourceUrl: "https://example.test/app", observedAt: "2026-09-20T13:00:00.000Z", freshness: "fresh" as const, status: "available" as const, retryable: false, contentFingerprint: "a".repeat(64), fingerprint: "b".repeat(64), contentLength: 22, contentExcerpt: "Visible page price: $100", contentVisibility: "server_visible" as const }
      : { sourceUrl: "https://example.test/app", observedAt: "2026-09-20T12:00:00.000Z", freshness: "fresh" as const, status: "available" as const, retryable: false, contentFingerprint: "0".repeat(64), fingerprint: "b".repeat(64), contentLength: 0, contentExcerpt: "", contentVisibility: "no_server_visible_text" as const });
    const service = createInvestigationService(store, { readPublicWebsite });
    const work = await service.create(owner, "workspace-a", { title: "Client rendered page", intervalMinutes: 60, mode: "public_website", sources: [{ kind: "public_website", url: "https://example.test/app" }] });
    const limited = await service.run(owner, work.id, { expectedRevision: 0, requestId: "limited" });
    expect(limited.payload.runs[0]).toMatchObject({ result: "unavailable", unavailableReason: "limited_evidence", retryable: true });
    expect(limited.payload.runs[0]!.sourceStates).toEqual([expect.objectContaining({ status: "unavailable", sourceUrl: "https://example.test/app" })]);
    visible = true;
    const recovered = await service.run(owner, work.id, { expectedRevision: 1, requestId: "visible" }, new Date(Date.now() + 61_000));
    expect(recovered.payload.runs[1]).toMatchObject({ result: "baseline" });
    expect(recovered.payload.runs[1]!.sources[0]!.contentVisibility).toBe("server_visible");
  });

});
