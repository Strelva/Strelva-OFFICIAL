// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResultsRetry } from "@/experience/places/ResultsRetry";
import { resultsFinding, searchPlace, sourceName } from "@/experience/places/WorkspaceResults";
import { XsLeadsPreview, type XsScreen } from "@/experience/workspace/preview/XsLeadsPreview";
import { ServerStatus } from "@/experience/inquiries/InquiryServerExperience";
import { websiteReportPaper, type WebsiteMonthlyReport } from "@/products/websites/site-report";
import { connectedInquiryEmail } from "@/products/connected-sites/notify";
import { renderPaperEmailHtml } from "@/platform/infra/email/paper";

const render = (screen: XsScreen, state = "ready", extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(<XsLeadsPreview screen={screen} state={state} mode="light" {...extra} />);
/** Visible words only: tags, attribute values and entities removed. */
const words = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const BUILDER = /preview data|authorized (inquiry )?state|Rank \d|Average rank|Grade [A-F]|\/100|Converting|Coming soon|Refresh leads|retained|Not counted in this saved recap|provider isn|delivery not verified|Release \d|actor not recorded/i;

afterEach(() => { document.body.innerHTML = ""; vi.unstubAllGlobals(); });

describe("XA lane xs-leads words", () => {
  it.each(["leads", "reviews", "recaps", "results", "prospects", "business-picker", "business"] as const)("%s says nothing in builder words and uses no em dash", screen => {
    const text = words(render(screen, screen === "business" ? "error" : "ready"));
    expect(text).not.toMatch(BUILDER);
    expect(text).not.toContain("—");
  });

  it("writes search position and sources the way an owner says them", () => {
    expect([searchPlace(1), searchPlace(2.1), searchPlace(3.4), searchPlace(4.6), searchPlace(8), searchPlace(14)]).toEqual(["Usually first", "Usually 2nd", "Usually 3rd", "Page 1, near the top", "Page 1, near the bottom", "Page 2"]);
    expect(sourceName("google / organic")).toBe("Google searches");
    expect(sourceName("(direct)")).toBe("Typed your address or used a bookmark");
  });

  it("puts the one finding in the Results head and names the window the figure shows", () => {
    const html = render("results");
    expect(words(html)).toContain("Up 41 visits from the previous 7 days. Most came from Google searches like “dentist elmwood buffalo”.");
    expect(html).toMatch(/aria-current="page"[^>]*>Last 7 days</);
    expect(words(html)).toContain("Nothing needs fixing (checked Oct 15)");
    // Search and source facts are plain text, not rows that look tappable.
    expect(html).not.toMatch(/<a [^>]*>[^<]*dentist elmwood/);
    expect(resultsFinding({ stats: null } as never)).toBeNull();
  });

  it("retries a failed Results read by reloading the same address", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const reload = vi.fn();
    const node = document.createElement("div"); document.body.append(node);
    const root = createRoot(node);
    await act(async () => root.render(<ResultsRetry reload={reload} />));
    const button = node.querySelector("button")!;
    expect(button.textContent).toBe("Try again"); expect(button.dataset.variant).toBe("primary");
    await act(async () => button.click());
    expect(reload).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it("keeps Service requests inside the agency shell, not Agency details", () => {
    const html = render("leads");
    for (const label of ["Home", "Queue", "Library", "Time this month", "Fieldwork Studio", "Service requests"]) expect(html).toContain(label);
    expect(html).toMatch(/aria-current="page" href="\/preview\/strelva\/xa\/xs-leads\/leads"/);
    expect(html).not.toContain(">Verification<"); expect(html).not.toContain(">Team<");
  });

  it("says the held-replies fact once, beside the draft", () => {
    const text = words(render("reviews", "held"));
    expect(text.match(/holds automatic replies/g)).toHaveLength(1);
    expect(text).not.toContain("Reply drafted, not posted");
    expect(text).toContain("Posts on Google as Harbor Dental");
  });

  it("opens a picked item on a phone with its one ink pill", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const node = document.createElement("div"); document.body.append(node);
    const root = createRoot(node);
    await act(async () => root.render(<XsLeadsPreview screen="leads" state="ready" mode="light" open />));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(node.querySelector('[data-open="true"]')).toBeTruthy();
    expect(node.querySelectorAll('[data-xa-primary="true"]')).toHaveLength(1);
    expect(node.textContent).toContain("Harbor Dental asked");
    await act(async () => root.unmount());
    const reviews = render("reviews", "ready", { open: true });
    expect(reviews).toContain('data-open="true"'); expect(reviews.match(/data-xa-primary="true"/g)).toHaveLength(1);
    const prospects = render("prospects", "ready", { prospect: "5e000000-0000-4000-8000-0000000001a1" });
    expect(prospects).toContain('data-open="true"'); expect(prospects.match(/data-xa-primary="true"/g)).toHaveLength(1);
  });

  it("shows an existing client as a client, never as something to add", () => {
    const text = words(render("prospects", "ready", { prospect: "5e000000-0000-4000-8000-0000000001a5" }));
    expect(text).toContain("Already a client"); expect(text).toContain("Open Fieldwork Studio");
  });

  it("writes a business load failure once, with two ways forward", () => {
    const text = words(renderToStaticMarkup(<ServerStatus businessName="Harbor Dental" error="raw api text" />));
    expect(text).toContain("Harbor Dental's inquiries didn't load."); expect(text).toContain("Try again"); expect(text).toContain("Choose another business");
    expect(text).not.toContain("raw api text");
  });
});

describe("XA lane xs-leads emails", () => {
  const report: WebsiteMonthlyReport = { workId: "w", workspaceId: "5e000000-0000-4000-8000-0000000000d1", tenantId: "harbor", siteName: "Harbor Dental", month: "2026-09", generatedAt: "2026-10-01T07:00:00Z",
    inquiries: { status: "available", count: 38, limitedToRecentRecords: true }, bookings: { status: "available", scheduledInPeriod: 61, providerAccepted: 58, providerVerified: 55 },
    visibility: { status: "available", checkedAt: "2026-09-25T12:00:00Z", mentioned: true, recommended: false, note: "Saved measurement" },
    readiness: { status: "available", checkedAt: "2026-09-25T12:00:00Z", passedChecks: 14, totalChecks: 15 },
    changes: [{ revision: 3, contentHash: "a", createdAt: "2026-09-10T12:00:00Z", createdBy: "maya", published: true }, { revision: 4, contentHash: "b", createdAt: "2026-09-12T12:00:00Z", createdBy: "strelva", published: true }] };

  it("shapes the monthly report like E3: clay, one figure, sentences, who acted, an ink button", () => {
    const paper = websiteReportPaper(report, "https://app.example/open", { clayUrl: "https://app.example/xa/email-lineup.png", actors: { maya: "Maya at North Studio" } });
    expect(paper.blocks[0]).toMatchObject({ kind: "clay" });
    expect(paper.blocks.filter(block => block.kind === "figure")).toHaveLength(1);
    expect(paper.blocks.some(block => block.kind === "rows" || block.kind === "metrics")).toBe(false);
    const html = renderPaperEmailHtml(paper);
    expect(html).toContain("Maya at North Studio"); expect(html).toContain(">Strelva<"); expect(html).toContain("background:#161715");
    expect(html).not.toMatch(/retained|saved answer|Also this month/);
  });

  it("says where a connected-site inquiry is kept without the word workspace", () => {
    const paper = connectedInquiryEmail({ siteHost: "www.harbordental.com", workspaceId: "5e000000-0000-4000-8000-0000000000d1" }, { name: "Priya Shah", email: "p@example.com", message: "Hello" }).options.paper;
    const said = paper.blocks.flatMap(block => block.kind === "paragraph" ? [block.text] : []).join(" ");
    expect(said).toContain("saved in Strelva"); expect(said).not.toContain("workspace");
  });
});
