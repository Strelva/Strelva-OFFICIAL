import { describe, expect, it, vi } from "vitest";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type SavedWork } from "@/platform/workspaces/types";
import { createHostedWebsiteProvider, createWebsiteService, type WebsiteArtifactProvider } from "@/products/websites/server";
import { WebsiteAddressTakenError, type PublishWebsiteRecordInput, type WebsitePublicationStore } from "@/products/websites/publications";
import type { WebsiteArtifact, WebsiteBrief, WebsiteLaunchReceipt, WebsitePublishedCapabilities, WebsiteRecord } from "@/products/websites/contracts";
import { memoryBoundedStore, owner } from "./fixtures/bounded-store";

const brief: WebsiteBrief = {
  businessName: "Alder & Pine",
  description: "A neighborhood florist with seasonal arrangements.",
  audience: "People ordering flowers in the city.",
  primaryGoal: "Help visitors request an arrangement.",
  primaryCallToAction: "Request an arrangement",
  contactEmail: "hello@alderpine.example",
  notes: "Use a calm, welcoming tone.",
};

function artifact(revision: number, suffix = "a"): WebsiteArtifact {
  const contentHash = suffix.repeat(64);
  return {
    kind: "website_candidate",
    revision,
    spec: {
      version: 1,
      siteName: brief.businessName,
      content: { hero: { headline: brief.businessName } },
      pages: { home: { sections: [{ type: "hero", visible: true, order: 0 }] } },
      theme: { fontDisplay: "Instrument_Serif", fontBody: "Inter" },
    },
    contentHash,
    rendererDigest: "b".repeat(64),
    artifactDigest: "c".repeat(64),
    preview: { href: `/preview/websites/${revision}`, revision, contentHash },
    generatedAt: "2026-09-20T12:00:00.000Z",
  };
}

function providerFixture(options: { failGenerate?: boolean; launch?: WebsiteLaunchReceipt } = {}): WebsiteArtifactProvider & { generate: ReturnType<typeof vi.fn>; publish: ReturnType<typeof vi.fn>; takeOffline: ReturnType<typeof vi.fn> } {
  return {
    generate: vi.fn(async ({ revision }: { revision: number }) => {
      if (options.failGenerate) throw new Error("provider unavailable");
      return artifact(revision, revision % 2 ? "a" : "b");
    }),
    publish: vi.fn(async ({ candidate }: { candidate: WebsiteArtifact }): Promise<WebsiteLaunchReceipt> => options.launch ?? {
      status: "published",
      receiptId: `receipt-${candidate.revision}`,
      provider: "strelva_hosted",
      providerUrl: "https://alder-pine.sites.example",
      evidence: "Preview version is live.",
      artifactHash: candidate.contentHash,
      candidateRevision: candidate.revision,
      publishedAt: "2026-09-20T12:01:00.000Z",
    }),
    takeOffline: vi.fn(async () => undefined),
  };
}

/** In-memory stand-in for the Postgres publication authority. */
function memoryPublications(): WebsitePublicationStore & { rows: Map<string, PublishWebsiteRecordInput & { status: "live" | "offline"; publishedAt: string }> } {
  const rows = new Map<string, PublishWebsiteRecordInput & { status: "live" | "offline"; publishedAt: string }>();
  const present = (row: PublishWebsiteRecordInput & { status: "live" | "offline"; publishedAt: string }) => ({ address: row.address, status: row.status, candidateRevision: row.candidateRevision, contentHash: row.contentHash, publishedAt: row.publishedAt, updatedAt: row.publishedAt });
  return {
    rows,
    async publish(actor, input) {
      if (actor.userId !== owner.userId) throw new WorkspaceAccessError();
      const existing = rows.get(input.workId);
      const address = existing?.address ?? input.address;
      if (!existing && [...rows.values()].some((row) => row.address === address)) throw new WebsiteAddressTakenError();
      const row = { ...input, address, status: "live" as const, publishedAt: "2026-09-28T12:00:00.000Z" };
      rows.set(input.workId, row);
      return present(row);
    },
    async takeOffline(_actor, input) {
      const row = rows.get(input.workId);
      if (!row) throw new WorkspaceConflictError("This website is not published.");
      row.status = "offline";
      return present(row);
    },
    async readLive(address) {
      const row = [...rows.values()].find((candidate) => candidate.address === address && candidate.status === "live");
      return row ? { address: row.address, contentHash: row.contentHash, connectOrigin: row.connectOrigin, pages: row.pages } : null;
    },
  };
}

async function approvedWebsite(service: ReturnType<typeof createWebsiteService>, requestId: string, input: WebsiteBrief = brief) {
  const created = await service.create(owner, "workspace-a", { requestId, brief: input });
  return service.approve(owner, created.workId, {
    expectedRevision: created.website.revision,
    candidateRevision: created.website.candidate!.revision,
    candidateContentHash: created.website.candidate!.contentHash,
  });
}

function publishInput(record: WebsiteRecord) {
  return { expectedRevision: record.website.revision, candidateRevision: record.website.candidate!.revision, candidateContentHash: record.website.candidate!.contentHash };
}

describe("self-service website work", () => {
  it("uses the native deterministic renderer for a real local preview when no paid provider is configured", async () => {
    const service = createWebsiteService(memoryBoundedStore());
    const created = await service.create(owner, "workspace-a", { requestId: "website-request-native", brief });
    expect(created.website.status).toBe("preview_ready");
    expect(created.website.candidate?.preview.href).toBe(`/api/websites/${created.workId}/preview?revision=1&contentHash=${created.website.candidate?.contentHash}`);
    expect(created.website.candidate?.spec).toMatchObject({ version: 1, content: expect.any(Object), pages: expect.any(Object), theme: expect.any(Object) });
  });

  it("persists a provider-backed candidate, ties its preview to the same revision, and makes create idempotent", async () => {
    const provider = providerFixture();
    const service = createWebsiteService(memoryBoundedStore(), { provider });

    const created = await service.create(owner, "workspace-a", { requestId: "website-request-001", brief });
    expect(created.website).toMatchObject({ status: "preview_ready", revision: 1, candidate: { revision: 1 } });
    expect(created.website.candidate?.preview).toEqual(expect.objectContaining({ revision: 1, contentHash: created.website.candidate?.contentHash }));
    expect(created.website.candidate?.preview.href).toBe(`/api/websites/${created.workId}/preview?revision=1&contentHash=${created.website.candidate?.contentHash}`);
    expect(created.website.candidate?.spec).toMatchObject({ version: 1, content: { hero: { headline: brief.businessName } }, pages: { home: { sections: [{ type: "hero" }] } } });

    const repeated = await service.create(owner, "workspace-a", { requestId: "website-request-001", brief });
    expect(repeated.workId).toBe(created.workId);
    expect(repeated.website.revision).toBe(created.website.revision);
    expect(provider.generate).toHaveBeenCalledTimes(1);
  });

  it("passes only the server-resolved published capability projection to generation", async () => {
    const publishedCapabilities: WebsitePublishedCapabilities = {
      baseUrl: "https://public.example",
      tenant: "alder-pine",
      inquiry: { capabilityId: "inquiry-main", version: 3 },
    };
    const provider = providerFixture();
    const resolvePublishedCapabilities = vi.fn(async () => publishedCapabilities);
    const service = createWebsiteService(memoryBoundedStore(), { provider, resolvePublishedCapabilities });

    const created = await service.create(owner, "workspace-a", { requestId: "website-request-capabilities", brief });

    expect(resolvePublishedCapabilities).toHaveBeenCalledWith(owner, "workspace-a", created.workId, undefined);
    expect(provider.generate).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-a",
      workId: created.workId,
      publishedCapabilities,
    }));
  });

  it("pins a validated native connection and regenerates when it is removed", async () => {
    const publishedCapabilities: WebsitePublishedCapabilities = {
      baseUrl: "https://public.example",
      tenant: "alder-pine",
      inquiry: { capabilityId: "inquiry-main", version: 3 },
    };
    const selection = { tenantId: "alder-pine", inquiryCapabilityId: "inquiry-main" } as const;
    const provider = providerFixture();
    const resolvePublishedCapabilities = vi.fn(async (_actor, _workspaceId, _workId, selected) => selected ? publishedCapabilities : undefined);
    const listPublishedCapabilityOptions = vi.fn(async () => ({
      tenants: [{ tenantId: "alder-pine", siteName: "Alder & Pine", inquiry: [{ capabilityId: "inquiry-main", version: 3, name: "Arrangement requests" }], booking: [] }],
    }));
    const service = createWebsiteService(memoryBoundedStore(), { provider, resolvePublishedCapabilities, listPublishedCapabilityOptions });

    const created = await service.create(owner, "workspace-a", { requestId: "website-request-connect", brief });
    const connected = await service.connectCapabilities(owner, created.workId, { expectedRevision: created.website.revision, selection });
    expect(connected.website).toMatchObject({ revision: 2, status: "preview_ready", publishedCapabilitySelection: selection });
    expect(resolvePublishedCapabilities).toHaveBeenLastCalledWith(owner, "workspace-a", created.workId, selection);
    expect(provider.generate).toHaveBeenLastCalledWith(expect.objectContaining({ publishedCapabilities }));

    const removed = await service.connectCapabilities(owner, created.workId, { expectedRevision: connected.website.revision, selection: null });
    expect(removed.website).toMatchObject({ revision: 3, status: "preview_ready" });
    expect(removed.website.publishedCapabilitySelection).toBeUndefined();
    expect(resolvePublishedCapabilities).toHaveBeenLastCalledWith(owner, "workspace-a", created.workId, undefined);
    expect(provider.generate).toHaveBeenLastCalledWith(expect.objectContaining({ publishedCapabilities: undefined }));
  });

  it("rejects a connection that is no longer in the server options", async () => {
    const provider = providerFixture();
    const listPublishedCapabilityOptions = vi.fn(async () => ({ tenants: [] }));
    const service = createWebsiteService(memoryBoundedStore(), { provider, listPublishedCapabilityOptions });
    const created = await service.create(owner, "workspace-a", { requestId: "website-request-stale-connect", brief });

    await expect(service.connectCapabilities(owner, created.workId, {
      expectedRevision: created.website.revision,
      selection: { tenantId: "alder-pine", inquiryCapabilityId: "inquiry-main" },
    })).rejects.toThrow(/no longer available/i);
    expect(provider.generate).toHaveBeenCalledTimes(1);
  });

  it("invalidates approval when the customer revises and rejects approval of a stale preview", async () => {
    const provider = providerFixture();
    const service = createWebsiteService(memoryBoundedStore(), { provider });
    const created = await service.create(owner, "workspace-a", { requestId: "website-request-002", brief });
    const approved = await service.approve(owner, created.workId, { expectedRevision: 1, candidateRevision: 1, candidateContentHash: created.website.candidate!.contentHash });
    expect(approved.website).toMatchObject({ status: "approved", approvedCandidateRevision: 1, revision: 2 });

    const revised = await service.revise(owner, created.workId, { expectedRevision: 2, brief: { ...brief, primaryGoal: "Help visitors book a consultation." } });
    expect(revised.website).toMatchObject({ status: "preview_ready", approvedCandidateRevision: null, revision: 3, candidate: { revision: 3 } });
    await expect(service.approve(owner, created.workId, { expectedRevision: 2, candidateRevision: 1, candidateContentHash: created.website.candidate!.contentHash })).rejects.toThrow(/changed|reload/i);
    await expect(service.approve(owner, created.workId, { expectedRevision: 3, candidateRevision: 1, candidateContentHash: created.website.candidate!.contentHash })).rejects.toThrow(/current candidate|preview/i);
  });

  it("records a failed generation without losing the brief and retries through a later revision", async () => {
    const provider = providerFixture({ failGenerate: true });
    const service = createWebsiteService(memoryBoundedStore(), { provider });
    const failed = await service.create(owner, "workspace-a", { requestId: "website-request-003", brief });
    expect(failed.website).toMatchObject({ status: "failed", revision: 1, brief, candidate: null, lastError: { stage: "artifact" } });

    provider.generate.mockImplementation(async ({ revision }: { revision: number }) => artifact(revision, "c"));
    const recovered = await service.revise(owner, failed.workId, { expectedRevision: 1, brief });
    expect(recovered.website).toMatchObject({ status: "preview_ready", revision: 2, candidate: { revision: 2 }, lastError: null });
  });

  it("does not turn a candidate persistence failure into a false failed website", async () => {
    const store = memoryBoundedStore();
    const provider = providerFixture();
    const originalCreate = store.create.bind(store);
    let work: SavedWork | null = null;
    let updateCalls = 0;
    store.create = async (...args) => {
      work = await originalCreate(...args);
      return work;
    };
    store.update = async () => {
      updateCalls += 1;
      throw new WorkspaceStoreError("Candidate persistence is unavailable.");
    };
    const service = createWebsiteService(store, { provider });

    await expect(service.create(owner, "workspace-a", { requestId: "website-request-persist-failure", brief }))
      .rejects.toThrow(/candidate persistence/i);
    expect(updateCalls).toBe(1);
    expect(work).not.toBeNull();
    const persisted = await store.read(owner, work!.id);
    expect(persisted?.payload).toMatchObject({ status: "draft", revision: 0, candidate: null });
  });

  it("does not persist a failed candidate when native capability authority is unavailable", async () => {
    const store = memoryBoundedStore();
    const originalCreate = store.create.bind(store);
    let work: SavedWork | null = null;
    store.create = async (...args) => {
      work = await originalCreate(...args);
      return work;
    };
    const service = createWebsiteService(store, {
      resolvePublishedCapabilities: async () => {
        throw new WorkspaceStoreError("Native capability authority is unavailable.");
      },
    });

    await expect(service.create(owner, "workspace-a", { requestId: "website-request-capability-store-failure", brief }))
      .rejects.toThrow(/native capability authority/i);
    expect(work).not.toBeNull();
    const persisted = await store.read(owner, work!.id);
    expect(persisted?.payload).toMatchObject({ status: "draft", revision: 0, candidate: null });
  });

  it("requires direct workspace membership before returning an idempotent existing website", async () => {
    const base = memoryBoundedStore();
    const created = await createWebsiteService(base).create(owner, "workspace-a", {
      requestId: "website-request-delegated-replay",
      brief,
    });
    const delegated: typeof owner = { userId: "agency-reader", verifiedEmail: "agency@example.com" };
    const store = {
      ...base,
      async member(actor: typeof owner, workspaceId: string) {
        if (actor.userId === delegated.userId) throw new WorkspaceAccessError();
        return base.member(actor, workspaceId);
      },
      async read(actor: typeof owner, workId: string) {
        if (actor.userId === delegated.userId && workId === created.workId) {
          const row = await base.read(owner, workId);
          return row;
        }
        return base.read(actor, workId);
      },
      async list(actor: typeof owner, workspaceId: string) {
        if (actor.userId === delegated.userId && workspaceId === "workspace-a") {
          const row = await base.read(owner, created.workId);
          return row ? [row] : [];
        }
        return [];
      },
    };
    const service = createWebsiteService(store, { list: store.list });

    await expect(service.create(delegated, "workspace-a", { requestId: "website-request-delegated-replay", brief }))
      .rejects.toThrow(/access/i);
  });

  it("publishes only the exact approved candidate and records the live address", async () => {
    const provider = providerFixture();
    const service = createWebsiteService(memoryBoundedStore(), { provider });
    const created = await service.create(owner, "workspace-a", { requestId: "website-request-004", brief });
    await expect(service.publish(owner, created.workId, publishInput(created))).rejects.toThrow(/approve/i);
    const approved = await service.approve(owner, created.workId, publishInput(created));
    const published = await service.publish(owner, created.workId, publishInput(approved));
    expect(published.website).toMatchObject({
      status: "published",
      launch: { status: "published", candidateRevision: 1, receipt: { receiptId: "receipt-1", provider: "strelva_hosted", artifactHash: created.website.candidate!.contentHash } },
      publication: { status: "live", url: "https://alder-pine.sites.example", candidateRevision: 1 },
    });
    expect(provider.publish).toHaveBeenCalledWith(expect.objectContaining({ actor: owner, workId: created.workId, candidate: expect.objectContaining({ revision: 1 }), idempotencyKey: expect.stringContaining(created.workId) }));

    // Replaying the same publish is a no-op rather than a second write.
    const replay = await service.publish(owner, created.workId, { ...publishInput(approved), expectedRevision: published.website.revision });
    expect(replay.website.revision).toBe(published.website.revision);
    expect(provider.publish).toHaveBeenCalledTimes(1);
  });

  it("keeps the live site through a new preview and republishes the next approval at the same address", async () => {
    const publications = memoryPublications();
    const service = createWebsiteService(memoryBoundedStore(), { provider: createHostedWebsiteProvider({ store: publications, domain: () => "sites.localhost:3000" }) });
    const approved = await approvedWebsite(service, "website-request-hosted");
    const published = await service.publish(owner, approved.workId, publishInput(approved));
    expect(published.website.publication).toMatchObject({ status: "live", url: "http://alder-and-pine.sites.localhost:3000", candidateRevision: 1 });
    const live = await publications.readLive("alder-and-pine");
    expect(Object.keys(live!.pages)).toContain("/");
    expect(live!.pages["/"]).toContain("Alder &amp; Pine");
    expect(Object.keys(live!.pages).every((path) => path === "/" || /^\/[a-zA-Z0-9_-]+$/.test(path))).toBe(true);

    const revised = await service.revise(owner, approved.workId, { expectedRevision: published.website.revision, brief: { ...brief, description: "Seasonal flowers and weekly subscriptions." } });
    expect(revised.website).toMatchObject({ status: "preview_ready", publication: { status: "live", candidateRevision: 1 } });
    expect((await publications.readLive("alder-and-pine"))!.contentHash).toBe(approved.website.candidate!.contentHash);

    const reapproved = await service.approve(owner, approved.workId, publishInput(revised));
    const republished = await service.publish(owner, approved.workId, publishInput(reapproved));
    expect(republished.website.publication).toMatchObject({ status: "live", url: "http://alder-and-pine.sites.localhost:3000", candidateRevision: revised.website.candidate!.revision });
    expect((await publications.readLive("alder-and-pine"))!.contentHash).toBe(revised.website.candidate!.contentHash);
  });

  it("chooses the next free address when another website already uses the business name", async () => {
    const publications = memoryPublications();
    const service = createWebsiteService(memoryBoundedStore(), { provider: createHostedWebsiteProvider({ store: publications, domain: () => "sites.example" }) });
    const first = await approvedWebsite(service, "website-request-address-1");
    await service.publish(owner, first.workId, publishInput(first));
    const second = await approvedWebsite(service, "website-request-address-2", { ...brief, description: "A second florist with the same name." });
    const published = await service.publish(owner, second.workId, publishInput(second));
    expect(published.website.publication?.url).toBe("https://alder-and-pine-2.sites.example");
  });

  it("does not publish when hosting is not configured and keeps the approval retryable", async () => {
    const publications = memoryPublications();
    const service = createWebsiteService(memoryBoundedStore(), { provider: createHostedWebsiteProvider({ store: publications, domain: () => null }) });
    const approved = await approvedWebsite(service, "website-request-unconfigured");
    const failed = await service.publish(owner, approved.workId, publishInput(approved));
    expect(failed.website).toMatchObject({ status: "failed", lastError: { stage: "launch", message: expect.stringMatching(/not configured/i) }, launch: { receipt: null } });
    expect(failed.website.publication).toBeUndefined();
    expect(publications.rows.size).toBe(0);
  });

  it("propagates a refused publication without recording a provider failure", async () => {
    const provider = providerFixture();
    provider.publish.mockRejectedValueOnce(new WorkspaceConflictError("Only the current approved website preview can be published."));
    const service = createWebsiteService(memoryBoundedStore(), { provider });
    const approved = await approvedWebsite(service, "website-request-refused");
    await expect(service.publish(owner, approved.workId, publishInput(approved))).rejects.toThrow(/approved website preview/i);
    const pending = await service.read(owner, approved.workId);
    expect(pending.website).toMatchObject({ status: "launch_pending", launch: { receipt: null } });
    await expect(service.revise(owner, approved.workId, { expectedRevision: pending.website.revision, brief })).rejects.toThrow(/in progress/i);
    const finished = await service.publish(owner, approved.workId, publishInput(pending));
    expect(finished.website.status).toBe("published");
  });

  it("takes a live website offline and allows publishing it again", async () => {
    const publications = memoryPublications();
    const service = createWebsiteService(memoryBoundedStore(), { provider: createHostedWebsiteProvider({ store: publications, domain: () => "sites.example" }) });
    const approved = await approvedWebsite(service, "website-request-offline");
    await expect(service.takeOffline(owner, approved.workId, { expectedRevision: approved.website.revision })).rejects.toThrow(/not live/i);
    const published = await service.publish(owner, approved.workId, publishInput(approved));
    const offline = await service.takeOffline(owner, approved.workId, { expectedRevision: published.website.revision });
    expect(offline.website).toMatchObject({ status: "approved", launch: { status: "not_requested" }, publication: { status: "offline", url: "https://alder-and-pine.sites.example" } });
    expect(offline.website.history.at(-1)?.kind).toBe("taken_offline");
    expect(await publications.readLive("alder-and-pine")).toBeNull();
    await expect(service.takeOffline({ userId: "outsider", verifiedEmail: "outsider@example.com" }, approved.workId, { expectedRevision: offline.website.revision })).rejects.toThrow(/denied/i);

    const again = await service.publish(owner, approved.workId, publishInput(offline));
    expect(again.website.publication).toMatchObject({ status: "live", url: "https://alder-and-pine.sites.example" });
  });

  it("leaves receipt persistence recoverable after publishing succeeds", async () => {
    const provider = providerFixture();
    const store = memoryBoundedStore();
    const service = createWebsiteService(store, { provider });
    const approved = await approvedWebsite(service, "website-request-reconcile");
    const originalUpdate = store.update.bind(store);
    let updateCount = 0;
    store.update = async (...args) => {
      updateCount += 1;
      if (updateCount === 2) throw new WorkspaceStoreError("Receipt persistence is unavailable.");
      return originalUpdate(...args);
    };
    await expect(service.publish(owner, approved.workId, publishInput(approved))).rejects.toThrow(/receipt persistence/i);
    const pending = await service.read(owner, approved.workId);
    expect(pending.website).toMatchObject({ status: "launch_pending", launch: { status: "pending", candidateRevision: 1, receipt: null } });

    store.update = originalUpdate;
    const resumed = await service.publish(owner, approved.workId, publishInput(pending));
    expect(resumed.website).toMatchObject({ status: "published", launch: { receipt: { receiptId: "receipt-1", candidateRevision: 1 } } });
    expect(provider.publish).toHaveBeenCalledTimes(2);
  });

  it("keeps reads tenant-bound and propagates a stopped workspace write as a conflict", async () => {
    const store = memoryBoundedStore();
    const provider = providerFixture();
    const service = createWebsiteService(store, { provider });
    const created = await service.create(owner, "workspace-a", { requestId: "website-request-005", brief });
    const originalUpdate = store.update.bind(store);
    let stopped = false;
    store.update = async (...args) => {
      if (stopped) throw new WorkspaceConflictError("New work is stopped for this workspace.");
      return originalUpdate(...args);
    };
    stopped = true;
    await expect(service.revise(owner, created.workId, { expectedRevision: 1, brief })).rejects.toThrow(/stopped/i);
    await expect(service.read({ userId: "outsider", verifiedEmail: "outsider@example.com" }, created.workId)).rejects.toThrow(/denied/i);
    expect((await service.read(owner, created.workId)).website.revision).toBe(1);
  });

  it("does not claim publication when publishing fails, and allows a retry", async () => {
    const provider = providerFixture();
    provider.publish.mockRejectedValueOnce(new Error("provider unavailable"));
    const service = createWebsiteService(memoryBoundedStore(), { provider });
    const approved = await approvedWebsite(service, "website-request-006");
    const failed = await service.publish(owner, approved.workId, publishInput(approved));
    expect(failed.website).toMatchObject({ status: "failed", launch: { receipt: null }, lastError: { stage: "launch" } });
    expect(failed.website.publication).toBeUndefined();
    const published = await service.publish(owner, failed.workId, publishInput(failed));
    expect(published.website).toMatchObject({ status: "published", launch: { receipt: { receiptId: "receipt-1", candidateRevision: 1, artifactHash: approved.website.candidate!.contentHash }, candidateRevision: 1 } });
  });
});
