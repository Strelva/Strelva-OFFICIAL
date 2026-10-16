import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HomeFinderBuyer } from "@/experience/enterprise/HomeFinderBuyer";
import { AgencyProspectsView } from "@/experience/workspace/agency/AgencyProspectsView";
import type { AgencyProspect } from "@/platform/agency-prospecting/server";

const workspaceId = "b2770000-0000-4000-8000-000000000010";
const prospect: AgencyProspect = { id: "b2770000-0000-4000-8000-000000000011", name: "[Owner]", email: "owner@example.test", business: "[Business]", url: null, source: "monitor", result_id: "fixture", score: 0, grade: "F", created_at: "2026-10-09T12:00:00Z" };

describe("L13 remaining page presentation", () => {
  it("opens Home Finder with a named search field and honest initial state, without fetching listings", () => {
    const request = vi.fn<typeof fetch>();
    const html = renderToStaticMarkup(<HomeFinderBuyer bindingId={workspaceId} entryToken="fixture-token" brokerageName="[Brokerage]" request={request} />);
    expect(html).toContain("Find your home");
    expect(html).toContain("City, area or address");
    expect(html).toMatch(/<label for="[^"]+">City, area or address<\/label>/);
    expect(html).toContain("Search an area to see homes for sale.");
    expect(html).not.toContain("Send inquiry");
    expect(request).not.toHaveBeenCalled();
  });
  it("labels the check and its grade without a score readout or invented health", () => {
    const html = renderToStaticMarkup(<AgencyProspectsView prospects={[prospect]} workspaceId={workspaceId} />);
    expect(html).toContain("Answer check: F");
    expect(html).not.toContain("/100");
    expect(html).not.toContain("Latest checks passed");
    expect(html).not.toContain("Add as client");
  });
  it("offers the existing add-client URL only when released and workspace-scoped", () => {
    const html = renderToStaticMarkup(<AgencyProspectsView prospects={[prospect]} workspaceId={workspaceId} addClientEnabled />);
    expect(html).toContain(`/workspace/agency/clients/new?workspaceId=${workspaceId}&amp;prospect=${prospect.id}`);
    expect(renderToStaticMarkup(<AgencyProspectsView prospects={[prospect]} addClientEnabled />)).not.toContain("Add as client");
  });
  it("keeps loading, unavailable and empty reads distinct", () => {
    expect(renderToStaticMarkup(<AgencyProspectsView prospects={[]} loading />)).toContain("Reading who ran your check links");
    const failed = renderToStaticMarkup(<AgencyProspectsView prospects={[]} error="Agency membership is required." />);
    expect(failed).toContain('role="alert"');
    expect(failed).not.toContain("No one has run your check yet.");
    expect(failed).not.toContain("<table");
    expect(renderToStaticMarkup(<AgencyProspectsView prospects={[]} />)).toContain("No one has run your check yet.");
  });
});
