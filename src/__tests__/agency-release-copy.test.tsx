import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AgencyLibraryCanonPreview } from "@/experience/workspace/preview/AgencyLibraryCanonPreview";
import { AgencyPortfolioPreview } from "@/experience/workspace/preview/AgencyPortfolioPreview";
import { AgencyCanonPreview } from "@/experience/workspace/preview/AgencyCanonPreview";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

describe("agency release and review language", () => {
  it("uses the same release names in Library, draft, offer and Version screens", () => {
    for (const surface of ["library", "package", "bulk", "version"]) {
      const html = renderToStaticMarkup(<AgencyLibraryCanonPreview surface={surface} state="ready" mode="light" />);
      expect(html).not.toMatch(/\br\d+/);
      expect(html).not.toContain("Source revisions");
      expect(html).not.toContain("Package Release");
    }
    const library = renderToStaticMarkup(<AgencyLibraryCanonPreview surface="library" state="ready" mode="light" />);
    expect(library).toContain("Release 13 draft");
    expect(library).toContain("Release 12 + 1 local change");
    expect(library).toContain("Releases");
  });
  it("keeps Home and Clients on the same portfolio count", () => {
    const html = renderToStaticMarkup(<AgencyPortfolioPreview surface="clients" state="ready" mode="light" />);
    const home = renderToStaticMarkup(<AgencyPortfolioPreview surface="home" state="ready" mode="light" />);
    expect(html).toContain("4 clients");
    expect(home).toContain("4 clients");
    expect(html).not.toMatch(/<th[^>]*>Time this month/);
    expect(html).not.toContain("Minutes · Oct");
    expect(html).not.toMatch(/\br\d+/);
  });
  it("speaks to the agency as preparer reviewing work for the business", () => {
    const html = renderToStaticMarkup(<AgencyCanonPreview frame="client" state="ready" mode="light" />);
    expect(html).toContain("prepared this for Harbor Dental");
    expect(html).not.toContain("from your request");
    expect(html).toContain("Send to Harbor Dental");
  });
});
