import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }), usePathname: () => "/admin/queue" }));
import type { OperatorOwnerReachRow } from "@/platform/owner-reach/contracts";
const { OwnerReachPanel } = await import("@/app/admin/queue/OwnerReachPanel");

const row = (over: Partial<OperatorOwnerReachRow> = {}): OperatorOwnerReachRow => ({
  workspaceId: "aaaaaaaa-0000-4000-8000-000000000001", name: "The Mooney Firm", sites: ["mooney"], ownerMember: false,
  trusted: { email: "ops@strelva.example", trustedVia: "conversion", staffReason: "platform_operator" }, tenantOwnerEmails: [], proposed: null, invite: null,
  openDecisions: 2, soonestLapse: "2026-10-20T12:00:00Z", lapsed14d: 1, ...over,
});
const html = (load: Parameters<typeof OwnerReachPanel>[0]["load"]) => renderToStaticMarkup(createElement(OwnerReachPanel, { load }));

describe("OwnerReachPanel", () => {
  it("renders nothing when off or denied", () => {
    expect(html({ state: "off" })).toBe("");
    expect(html({ state: "denied" })).toBe("");
  });

  it("names each business and the problem in operator words", () => {
    const out = html({ state: "ready", value: [row(), row({ workspaceId: "aaaaaaaa-0000-4000-8000-000000000002", name: "Signed In Co", ownerMember: true, sites: [] })] });
    expect(out).toContain("Owners not reachable");
    expect(out).toContain("1 business");
    expect(out).toContain("The Mooney Firm · mooney");
    expect(out).toContain("Owner email is a staff address (platform_operator)");
    expect(out).toContain("2 open owner decisions");
    expect(out).toContain("1 lapsed in the last 14 days, nothing changed");
    expect(out).toContain("/admin/clients/mooney");
    expect(out).toContain("Reachable (1)");
  });

  it("says when every owner can be reached", () => {
    const out = html({ state: "ready", value: [row({ ownerMember: true })] });
    expect(out).toContain("every owner reachable");
  });

  it("shows the message when the list could not be read", () => {
    expect(html({ state: "unavailable", message: "The owner reach list could not be read. Nothing is hidden: try again." })).toContain("could not be read");
  });
});
