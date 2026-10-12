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
    expect(html.match(/aria-label="Strelva platform"/g)).toHaveLength(1);
    expect(html.indexOf("Current Studio / Buffalo Realty")).toBeLessThan(html.indexOf('aria-label="Strelva platform"'));
    expect(html.indexOf('aria-label="Strelva platform"')).toBeLessThan(html.indexOf("Your account"));
    expect(html).not.toContain(">Sign in<");
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
    expect(html).toContain('aria-label="Buffalo Realty inquiries home"');
    expect(html).not.toContain("Runs on Strelva");
    expect(html.match(/aria-label="Strelva platform"/g)).toHaveLength(1);
  });
});
