import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InquiryExperience } from "@/experience/inquiries/InquiryExperience";
import { createPreviewInquiryAdapter } from "@/experience/inquiries/preview-fixture";
import type { InquirySurfaceSnapshot } from "@/products/inquiries/surface-contracts";

function render(servingAgency: InquirySurfaceSnapshot["servingAgency"], audience: "business" | "agency" = "agency") {
  const base = createPreviewInquiryAdapter(audience);
  const snapshot = { ...base.getSnapshot(), servingAgency };
  const adapter = { ...base, getSnapshot: () => snapshot };
  return renderToStaticMarkup(<InquiryExperience adapter={adapter} initialSnapshot={snapshot} />);
}
const agency = { agencyId: "current-studio", name: "Current Studio", logoUrl: null, accentColor: "#447a4f", replyTo: null, credit: "runs_on_strelva" as const };

describe("standalone inquiry serving agency identity", () => {
  it("uses the current serving agency in the client header independently from receipt actors", () => {
    const html = render(agency);
    expect(html).toContain("Current Studio / Buffalo Realty");
    expect(html).toContain("Runs on Strelva");
    expect(html).not.toContain('aria-label="Strelva platform"');
    expect(html.indexOf("Current Studio / Buffalo Realty")).toBeLessThan(html.indexOf("Your account"));
    expect(html).not.toContain(">Sign in<");
    expect(html).toContain('href="/preview/strelva/workspace/account"');
  });
  it.each([null, undefined])("keeps unknown current agency identity neutral", brand => {
    const html = render(brand);
    expect(html).toContain("Agency identity unavailable / Buffalo Realty");
    expect(html).not.toContain("North Studio / Buffalo Realty");
    expect(html).not.toContain("Strelva Agency / Buffalo Realty");
    expect(html).not.toContain("Runs on Strelva");
  });
  it("puts the owner business first and does not fabricate an agency for a direct business", () => {
    const html = render(null, "business");
    expect(html).toContain('aria-label="Buffalo Realty home"');
    expect(html).not.toContain("Runs on Strelva");
    expect(html).not.toContain('aria-label="Strelva platform"');
  });
});

describe("inquiry shared workspace navigation", () => {
  it("uses workspace places and account while keeping inquiry actions inside the page", () => {
    const base = createPreviewInquiryAdapter("business");
    const snapshot = { ...base.getSnapshot(), account: { name: "Maria", email: "maria@example.test", memberships: [] } };
    const html = renderToStaticMarkup(<InquiryExperience adapter={base} initialSnapshot={snapshot} systemsReleased />);
    const sidebar = html.slice(html.indexOf("<aside"), html.indexOf("</aside>") + 8);
    const main = html.slice(html.indexOf("<main"));
    for (const label of ["Ask Strelva", "Search", "Home", "Requests", "Running", "All systems and files", "Business details", "People &amp; access", "Help", "Maria", "maria@example.test"]) {
      expect(sidebar).toContain(label);
    }
    expect(sidebar).toContain('href="/preview/strelva/workspace/account"');
    expect(sidebar).not.toContain(">New<");
    expect(sidebar).not.toContain("Recent changes");
    expect(sidebar).not.toContain(">Businesses<");
    expect(main).toContain('aria-label="Inquiries"');
    for (const label of ["New", "Search", "Recent changes", "Businesses", "Needs you across businesses", "Reuse an inquiry pattern", "Connections", "Read running rules"]) expect(main).toContain(label);
    expect(html).toContain('aria-label="Open navigation"');
    expect(html).not.toContain('aria-label="Open inquiry navigation"');
  });

  it("keeps shared navigation in the explicitly mapped business workspace", () => {
    const adapter = createPreviewInquiryAdapter("business");
    const snapshot = { ...adapter.getSnapshot(), business: { ...adapter.getSnapshot().business, id: "tenant-stable-id", workspaceId: "mapped-business-workspace" } };
    const html = renderToStaticMarkup(<InquiryExperience adapter={adapter} initialSnapshot={snapshot} basePath="/business/buffalo-realty" />);
    const sidebar = html.slice(html.indexOf("<aside"), html.indexOf("</aside>") + 8);
    expect(sidebar).toContain('href="/workspace?workspaceId=mapped-business-workspace"');
    expect(sidebar).toContain('href="/workspace?view=requests&amp;workspaceId=mapped-business-workspace"');
    expect(sidebar).not.toContain("workspaceId=tenant-stable-id");
  });

  it.each([true, false])("follows the server workspace Systems flag (%s)", systems => {
    const adapter = createPreviewInquiryAdapter("business");
    const snapshot = { ...adapter.getSnapshot(), releases: { systems } };
    const html = renderToStaticMarkup(<InquiryExperience adapter={adapter} initialSnapshot={snapshot} systemsReleased={!systems} />);
    expect(html).toContain(systems ? "All systems and files" : "Files and results");
    expect(html).not.toContain(systems ? "Files and results" : "All systems and files");
  });

  it("keeps the Systems release default off for an authenticated standalone surface", () => {
    const html = render(null, "business");
    expect(html).toContain("Files and results");
    expect(html).not.toContain("All systems and files");
  });
});
