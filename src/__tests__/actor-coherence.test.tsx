import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { actorLabel } from "@/platform/presentation/actor";
import { buildWebsiteSystemDetail, mergeWebsiteHistory } from "@/experience/systems/website-detail";
import { PossibilityTry } from "@/experience/systems/PossibilityTry";
import { changeDocument, createDocument, documentHistoryPageSchema } from "@/products/documents/engine";
import { applicationSchema } from "@/products/applications/contracts";

const agency = { kind: "agency", displayName: "North Studio" } as const;
const at = "2026-10-11T14:00:00.000Z";
describe("actor coherence across receipts and public previews", () => {
  it("always names a recorded actor, and discloses missing actors", () => {
    expect(actorLabel(agency)).toBe("North Studio · Runs on Strelva");
    expect(actorLabel({ kind: "platform" })).toBe("Strelva");
    expect(actorLabel(null)).toBe("Actor not recorded");
    expect(actorLabel({ kind: "person", displayName: "" })).toBe("Actor not recorded");
  });
  it("preserves actors through every website History source and merged System row", () => {
    const detail = buildWebsiteSystemDetail({ systemId: "site", actorId: "viewer", domains: [], decisions: [], draftSections: [], siteReview: null, serviceRequests: [], unavailable: [],
      contentVersions: [{ id: "content", section: "hero", author: "ai", timestamp: at, status: "live", actor: agency }],
      snapshots: [{ id: "snapshot", label: "Saved copy", reason: "manual", author: "user", createdAt: at, status: "available", actor: agency }],
      documentRevisions: [{ revision: 1, contentHash: "a".repeat(64), createdAt: at, createdBy: "viewer", published: true, actor: agency }],
      linkedPublications: [{ revision: 1, tenantSlugAtPublication: "site", publishedAt: at, fallbackUntil: at, priorDeliveryModel: "custom_repo", actor: agency }],
      changeRequests: [{ requestId: "change", title: "Changed the form", kind: "custom_request", status: "shipped", createdAt: at, actor: agency }],
      repoDeployments: [{ id: "deploy", requestId: "change", title: "Changed the form", commitSha: "abcdef0", deploymentUrl: "https://example.test", readBack: "not_confirmed", recordedAt: at, actor: agency }],
    });
    expect(detail.history).toHaveLength(6);
    expect(detail.history.every(row => row.actor?.kind === "agency" && row.by === "North Studio · Runs on Strelva")).toBe(true);
    const merged = mergeWebsiteHistory(detail.history, [{ id: "system", sentence: "Saved the System", at, actor: agency }, { id: "unknown", sentence: "Earlier change", at }]);
    expect(merged.find(row => row.id === "system")?.actor).toEqual(agency);
    expect(merged.find(row => row.id === "unknown")?.by).toBe("Actor not recorded");
  });
  it("retains document actor snapshots through paged History decoding", () => {
    const document = changeDocument(createDocument({ title: "Brief", text: "Before" }, "principal"), { kind: "edit", expectedRevision: 0, title: "Brief", text: "After" }, "principal", agency);
    const receipt = document.history[0]!;
    expect(receipt.actor).toEqual(agency);
    expect(documentHistoryPageSchema.parse({ workId: "83000000-0000-4000-8000-000000000001", workspaceId: "83000000-0000-4000-8000-000000000002", receipts: [receipt], nextBeforeRevision: null }).receipts[0]!.actor).toEqual(agency);
  });
  it("keeps native application History actors through schema decoding", () => {
    const entry = applicationSchema.shape.history.parse([{ revision: 1, kind: "published", actorId: "principal", actor: agency, at }])[0]!;
    expect(entry.actor).toEqual(agency);
  });
  it("separates the business, proposing actor and serving agency in a signed preview", () => {
    const html = renderToStaticMarkup(createElement(PossibilityTry, { state: { kind: "ready", view: {
      title: "Shorter intake", intent: "Try it", changes: [], introduces: [], takesSubmissions: false,
      businessName: "Harbor Dental", proposingActor: { kind: "person", displayName: "Alex" },
      agencyBrand: { agencyId: "north", name: "North Studio", logoUrl: null, accentColor: "#447a4f", replyTo: null, credit: "runs_on_strelva" },
    } } }));
    expect(html).toContain("<strong>Harbor Dental</strong>");
    expect(html).toContain("North Studio");
    expect(html).toContain("Proposed by Alex");
    expect(html).toContain("Runs on Strelva");
    expect(html).toContain("disabled");
    expect(html).toContain("Make it live");
  });
  it("does not invent a refresh or a platform actor on unavailable previews", () => {
    const changed = renderToStaticMarkup(createElement(PossibilityTry, { state: { kind: "changed" } }));
    expect(changed).not.toContain("is refreshing");
    const ready = renderToStaticMarkup(createElement(PossibilityTry, { state: { kind: "ready", view: { title: "Preview", intent: "", changes: [], introduces: [], takesSubmissions: false } } }));
    expect(ready).toContain("Business identity unavailable");
    expect(ready).toContain("Actor not recorded");
  });
});
