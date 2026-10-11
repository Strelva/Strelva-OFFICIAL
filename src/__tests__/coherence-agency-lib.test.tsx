import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PackageDeclaration } from "@/experience/systems/PackageDeclaration";
import { systemHref } from "@/experience/systems/model";
import ProviderChangeNotices from "@/app/workspace/provider-change/ProviderChangeNotices";
import VersionReviewPage from "@/app/workspace/version-review/page";
import { readAgencyWebsiteContext } from "@/platform/offerings/agency-website-context";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), version: vi.fn(), decision: vi.fn() }));
vi.mock("@/platform/workspaces/http", () => ({ workspaceHttpActor: mocks.actor }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/platform/systems-release", () => ({ systemsReleasedFor: () => true }));
vi.mock("@/platform/needs-you/release", () => ({ needsYouReleaseEnabled: () => true }));
vi.mock("@/experience/workspace/agency/version-server", () => ({ readSystemVersion: mocks.version }));
vi.mock("@/platform/needs-you/repository", () => ({ PostgresNeedsYouStore: { read: mocks.decision } }));
const workspaceId = "11111111-1111-4111-8111-111111111111", systemId = "22222222-2222-4222-8222-222222222222", decisionId = "33333333-3333-4333-8333-333333333333", versionId = "44444444-4444-4444-8444-444444444444";
const actor = { userId: versionId, verifiedEmail: "maya@example.test" };
beforeEach(() => { vi.clearAllMocks(); mocks.actor.mockResolvedValue(actor); mocks.version.mockResolvedValue({ versionId, label: "Harbor Dental intake" }); mocks.decision.mockResolvedValue({ id: decisionId, workspaceId, systemId, sourceLifecycle: "version_release", sourceId: versionId, title: "Put the updated intake live", detail: "New intake questions", state: "open", approveEffect: "The updated form goes live", notYetEffect: "The current form stays" }); });
describe("agency Library coherence", () => {
  it("presents identical plain-language declarations for both consumers", () => {
    const html = renderToStaticMarkup(<PackageDeclaration declaration={{ recordsRead: ["application.records", "business.contacts"], recordsWritten: [], businessRecordFields: [], outsideEffects: ["publish"], bindingKinds: ["booking_calendar"], dataLeavingBusiness: [] }} />);
    expect(html).toContain("Internal tool records, Business contacts"); expect(html).toContain("Business calendar"); expect(html).toContain("Public website publication"); expect(html).not.toContain("booking_calendar");
  });
  it("preserves the System destination on installation receipts", () => {
    const url = new URL(systemHref("", workspaceId, systemId), "https://example.test"); expect(url.searchParams.get("view")).toBe("system"); expect(url.searchParams.get("system")).toBe(systemId);
  });
  it("names both sides of a handoff and marks missing transfer evidence", () => {
    const html = renderToStaticMarkup(<ProviderChangeNotices workspaceId={workspaceId} canCancel requests={[{ id: decisionId, business_workspace_id: workspaceId, business_name: "Harbor Dental", outgoing_agency_name: "North Studio", incoming_agency_name: "Pine & Co.", requested_by_name: "lin@example.test", status: "awaiting_policy", respond_by: null }]} />);
    expect(html).toContain("Harbor Dental: North Studio → Pine &amp; Co."); expect(html).toContain("lin@example.test"); expect(html).toContain("Unverified rule"); expect(html).toContain(`workspaceId=${workspaceId}`); expect(html).toContain("Cancel agency change"); expect(html).not.toContain("Provider");
  });
  it("opens the exact prepared decision after checking the System scope", async () => {
    const html = renderToStaticMarkup(await VersionReviewPage({ searchParams: Promise.resolve({ workspaceId, systemId, decisionId }) }));
    expect(mocks.version).toHaveBeenCalledWith(actor, workspaceId, systemId); expect(mocks.decision).toHaveBeenCalledWith(workspaceId, decisionId); expect(html).toContain("New intake questions"); expect(html).toContain("The business owner decides"); expect(html).toContain(decisionId);
  });
  it("does not read any decision when the scoped System read is refused", async () => {
    mocks.version.mockRejectedValue(new Error("Access refused"));
    const html = renderToStaticMarkup(await VersionReviewPage({ searchParams: Promise.resolve({ workspaceId, systemId, decisionId }) }));
    expect(mocks.decision).not.toHaveBeenCalled(); expect(html).toContain("could not be verified");
  });
  it.each(["systemId", "workspaceId", "sourceId", "sourceLifecycle"])("refuses a decision from a different %s", async key => {
    mocks.decision.mockResolvedValue({ ...(await mocks.decision()), [key]: "different" });
    const html = renderToStaticMarkup(await VersionReviewPage({ searchParams: Promise.resolve({ workspaceId, systemId, decisionId }) })); expect(html).toContain("could not be verified"); expect(html).not.toContain("New intake questions");
  });
  it("refuses preparation context from another delivery", async () => {
    const db = { rpc: vi.fn(async () => ({ error: null, data: { bindingId: systemId, deliveryId: versionId, businessWorkspaceId: workspaceId, businessName: "Harbor Dental", agencyWorkspaceId: decisionId, agencyName: "North Studio", operatorUserId: versionId, personName: "maya@example.test", websiteName: "harbordental.example", expiresAt: "2026-11-01T00:00:00Z" } })) };
    await expect(readAgencyWebsiteContext(actor, systemId, workspaceId, db)).rejects.toThrow("another delivery");
  });
});
