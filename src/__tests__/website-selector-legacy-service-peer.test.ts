import { expect, it, vi } from "vitest";
import { WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";
import { createWebsiteService, type WebsiteArtifactProvider } from "@/products/websites/server";
import type { WebsiteArtifact, WebsiteBrief, WebsiteLaunchReceipt } from "@/products/websites/contracts";
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

function providerFixture(options: { failGenerate?: boolean; launch?: WebsiteLaunchReceipt } = {}): WebsiteArtifactProvider & { generate: ReturnType<typeof vi.fn>; prepareLaunch: ReturnType<typeof vi.fn> } {
  return {
    generate: vi.fn(async ({ revision }: { revision: number }) => {
      if (options.failGenerate) throw new Error("provider unavailable");
      return artifact(revision, revision % 2 ? "a" : "b");
    }),
    prepareLaunch: vi.fn(async ({ candidate }: { candidate: WebsiteArtifact }): Promise<WebsiteLaunchReceipt> => options.launch ?? {
      status: "pending",
      receiptId: `receipt-${candidate.revision}`,
      provider: "local-artifact-provider",
      providerUrl: `https://provider.example/receipts/${candidate.revision}`,
      evidence: "Local provider prepared this exact artifact.",
      artifactHash: candidate.contentHash,
      candidateRevision: candidate.revision,
      preparedAt: "2026-09-20T12:01:00.000Z",
    }),
  };
}

it("selector peer legacy service retains its memory update after reply loss and stale retry is refused", async () => {
 vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Outside transport forbidden in this probe"); }));
 const store = memoryBoundedStore(), provider = providerFixture(); const service = createWebsiteService(store, { provider });
 const created = await service.create(owner, "workspace-a", { requestId: "selector-peer-legacy", brief });
 const approved = await service.approve(owner, created.workId, { expectedRevision: created.website.revision, candidateRevision: created.website.candidate!.revision, candidateContentHash: created.website.candidate!.contentHash });
 const update = store.update.bind(store); let lost = false;
 const persist = vi.spyOn(store, "update").mockImplementation(async (user, work, revision, payload) => { const saved = await update(user, work, revision, payload); if (!lost) { lost = true; throw new WorkspaceStoreError("Reply lost after memory update"); } return saved; });
 await expect(service.connectCapabilities(owner, approved.workId, { expectedRevision: approved.website.revision, selection: null })).rejects.toBeInstanceOf(WorkspaceStoreError);
 const current = await service.read(owner, approved.workId);
 expect(current.website.revision).toBe(approved.website.revision + 1); expect(current.website.status).toBe("preview_ready"); expect(current.website.approvedCandidateRevision).toBeNull(); expect(persist).toHaveBeenCalledTimes(1);
 await expect(service.connectCapabilities(owner, approved.workId, { expectedRevision: approved.website.revision, selection: null })).rejects.toBeInstanceOf(WorkspaceConflictError);
 expect(persist).toHaveBeenCalledTimes(1); expect(provider.generate).toHaveBeenCalledTimes(2); expect(provider.prepareLaunch).not.toHaveBeenCalled(); expect(vi.mocked(fetch)).not.toHaveBeenCalled(); vi.unstubAllGlobals();
});
