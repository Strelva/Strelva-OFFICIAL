import { vi } from "vitest";
import type { WebsiteArtifactProvider } from "@/products/websites/server";
import type { WebsiteArtifact, WebsiteBrief, WebsiteLaunchReceipt } from "@/products/websites/contracts";
export const brief: WebsiteBrief = {
  businessName: "Alder & Pine",
  description: "A neighborhood florist with seasonal arrangements.",
  audience: "People ordering flowers in the city.",
  primaryGoal: "Help visitors request an arrangement.",
  primaryCallToAction: "Request an arrangement",
  contactEmail: "hello@alderpine.example",
  notes: "Use a calm, welcoming tone.",
};

export function artifact(revision: number, suffix = "a"): WebsiteArtifact {
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

export function providerFixture(options: { failGenerate?: boolean; launch?: WebsiteLaunchReceipt } = {}): WebsiteArtifactProvider & { generate: ReturnType<typeof vi.fn>; prepareLaunch: ReturnType<typeof vi.fn> } {
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

