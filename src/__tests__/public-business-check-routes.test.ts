import { describe, expect, it, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ audit: vi.fn(), ai: vi.fn(), agency: vi.fn(), enabled: vi.fn(() => true), views: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/products/website-audit/server", () => ({ getPublicWebsiteAudit: mocks.audit }));
vi.mock("@/products/ai-visibility/server", () => ({ getAiVisibilityResult: mocks.ai, recordAiVisibilityResultView: mocks.views }));
vi.mock("@/platform/agency-prospecting/server", () => ({ resolveAgencyAttribution: mocks.agency, AgencyProspectingError: class extends Error { constructor(message: string, public status: number) { super(message); } } }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.enabled }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`); }, notFound: () => { throw new Error("not-found"); } }));
import AgencyEmbed from "@/app/embed/agency/[slug]/[tool]/page";
import AuditPage from "@/app/(product)/audit/page";
import AiPage from "@/app/(product)/ai-visibility/page";
import SharedAiPage, { generateMetadata } from "@/app/(product)/ai-visibility/[id]/page";
import { AgencyProspectingError } from "@/platform/agency-prospecting/server";
import { withGeminiReportSection } from "@/products/website-audit/report";
const agency = { workspaceId: "studio", slug: "studio", name: "Fictional Studio" };
const ai = { business: "Fictional Business", url: "https://example.invalid", score: 70, grade: "C", citation: { probed: true, mentioned: false, note: "<script>no</script>" }, topFix: "Use <strong>facts</strong>", verdict: "Measured." };
beforeEach(() => { vi.clearAllMocks(); mocks.audit.mockResolvedValue(null); mocks.ai.mockResolvedValue(null); mocks.agency.mockResolvedValue(undefined); });

describe("unified public check routes", () => {
  it("redirects the legacy entry without dropping attribution or campaign params", async () => {
    await expect(AiPage({ searchParams: Promise.resolve({ agency: "studio", business: "Fictional Business", utm_source: "campaign" }) })).rejects.toThrow("redirect:/audit?agency=studio&business=Fictional+Business&utm_source=campaign");
  });
  it("redirects retained Gemini links into the same flow while keeping metadata", async () => {
    mocks.ai.mockResolvedValue({ result: ai });
    await expect(SharedAiPage({ params: Promise.resolve({ id: "scan_fictional" }), searchParams: Promise.resolve({ utm_source: "campaign" }) })).rejects.toThrow("redirect:/audit?utm_source=campaign&scan=scan_fictional");
    expect(mocks.views).toHaveBeenCalledWith("scan_fictional");
    expect((await generateMetadata({ params: Promise.resolve({ id: "scan_fictional" }) })).title).toBe("Fictional Business: C business check grade");
  });
  it("restores both results despite harmless URL normalization differences", async () => {
    mocks.audit.mockResolvedValue({ url: "https://example.invalid/", agency });
    mocks.ai.mockResolvedValue({ result: { ...ai, agency } });
    mocks.agency.mockResolvedValue(agency);
    const page = await AuditPage({ searchParams: Promise.resolve({ report: "audit_id", scan: "scan_id", agency: "studio" }) });
    expect(page.props.initialResult.url).toBe("https://example.invalid/");
    expect(page.props.initialAiResult.business).toBe("Fictional Business");
    expect(page.props.attributionError).toBeUndefined();
  });
  it("blocks unavailable attribution and never restores unattributed scan actions", async () => {
    mocks.agency.mockRejectedValue(new AgencyProspectingError("This agency check is unavailable.", 503));
    const page = await AuditPage({ searchParams: Promise.resolve({ agency: "studio" }) });
    expect(page.props.attributionError).toBe("This agency check is unavailable.");
    expect(page.props.initialResult).toBeUndefined();
  });
  it("never relabels a report using a different or missing recorded agency", async () => {
    mocks.agency.mockResolvedValue(agency);
    for (const recorded of [undefined, { workspaceId: "other", slug: "other" }]) {
      mocks.audit.mockResolvedValue({ url: "https://example.invalid/", agency: recorded });
      const page = await AuditPage({ searchParams: Promise.resolve({ report: "audit_id", agency: "studio" }) });
      expect(page.props.attributionError).toBe("This report belongs to a different agency check.");
      expect(page.props.initialResult).toBeUndefined();
    }
  });
  it("holds mixed-agency or mixed-website saved pairs", async () => {
    mocks.audit.mockResolvedValue({ url: "https://example.invalid/", agency });
    for (const altered of [{ ...ai, agency: { workspaceId: "other", slug: "other" } }, { ...ai, url: "https://other.invalid", agency }]) {
      mocks.ai.mockResolvedValue({ result: altered });
      const page = await AuditPage({ searchParams: Promise.resolve({ report: "audit_id", scan: "scan_id" }) });
      expect(page.props.attributionError).toBe("These reports do not belong to the same business check.");
      expect(page.props.initialAiResult).toBeUndefined();
    }
  });
  it("keeps a surviving result with explicit unavailable copy when a retained read fails", async () => {
    mocks.audit.mockRejectedValue(new Error("store offline")); mocks.ai.mockResolvedValue({ result: ai });
    const page = await AuditPage({ searchParams: Promise.resolve({ report: "audit_id", scan: "scan_id" }) });
    expect(page.props.initialResult).toBeUndefined();
    expect(page.props.initialAiResult).toEqual(ai);
    expect(page.props.initialError).toContain("expired or is unavailable");
  });
});

describe("combined report export", () => {
  it("adds the sampled finding without inventing a Gemini grade and escapes all content", () => {
    const html = withGeminiReportSection('<html><body><main><div class="cta">Contact studio</div></main></body></html>', { ...ai, grade: "C", signals: [], citation: { ...ai.citation, recommended: false } });
    expect(html).toContain("Gemini did not name the business.");
    expect(html).toContain("&lt;script&gt;no&lt;/script&gt;");
    expect(html).toContain("Contact studio");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("70/100");
  });
  it("exports unavailable as unavailable without a positive claim", () => {
    const html = withGeminiReportSection("<body></body>", null, "Gemini check unavailable: provider offline.");
    expect(html).toContain("Gemini check unavailable: provider offline.");
    expect(html).not.toContain("Gemini named");
  });
});


describe("combined agency embed aliases", () => {
  it.each(["audit", "ai-visibility"])("%s restores both sections under the admitted agency", async (tool) => {
    mocks.agency.mockResolvedValue(agency);
    mocks.ai.mockResolvedValue({ id: "scan_id", result: { ...ai, agency } });
    mocks.audit.mockResolvedValue({ url: "https://example.invalid/", agency });
    const page = await AgencyEmbed({ params: Promise.resolve({ slug: "studio", tool }), searchParams: Promise.resolve({ scan: "scan_id", report: "audit_id" }) });
    expect(page.props.initialAiResult.business).toBe(ai.business);
    expect(page.props.initialResult.url).toBe("https://example.invalid/");
    expect(page.props.agency).toEqual(agency);
  });
  it.each(["https://example.invalid:8443/", "http://example.invalid/", "https://example.invalid/?business=other", "not-a-url"])("refuses a report for a distinct or unreadable URL %s", async url => {
    mocks.agency.mockResolvedValue(agency);
    mocks.ai.mockResolvedValue({ id: "scan_id", result: { ...ai, agency } });
    mocks.audit.mockResolvedValue({ url, agency });
    await expect(AgencyEmbed({ params: Promise.resolve({ slug: "studio", tool: "audit" }), searchParams: Promise.resolve({ scan: "scan_id", report: "audit_id" }) })).rejects.toThrow("not-found");
  });
  it("refuses two unreadable retained website identities", async () => {
    mocks.agency.mockResolvedValue(agency);
    mocks.ai.mockResolvedValue({ id: "scan_id", result: { ...ai, url: "not-a-url", agency } });
    mocks.audit.mockResolvedValue({ url: "also-not-a-url", agency });
    await expect(AgencyEmbed({ params: Promise.resolve({ slug: "studio", tool: "audit" }), searchParams: Promise.resolve({ scan: "scan_id", report: "audit_id" }) })).rejects.toThrow("not-found");
  });
  it("refuses a retained pair belonging to different websites", async () => {
    mocks.agency.mockResolvedValue(agency);
    mocks.ai.mockResolvedValue({ id: "scan_id", result: { ...ai, agency } });
    mocks.audit.mockResolvedValue({ url: "https://other.invalid/", agency });
    await expect(AgencyEmbed({ params: Promise.resolve({ slug: "studio", tool: "audit" }), searchParams: Promise.resolve({ scan: "scan_id", report: "audit_id" }) })).rejects.toThrow("not-found");
  });
});
