// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResultsRetry } from "@/experience/places/ResultsRetry";
import { resultsChange, resultsFinding, resultsLead, resultsWindowPhrase, searchPlace, sourceName } from "@/experience/places/WorkspaceResults";
import { recapLead, recapMattered } from "@/experience/recaps/WorkspaceRecaps";
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

  it("leads Results with one sentence and the one change that mattered, with no hero number or bar chart", () => {
    const html = render("results");
    const text = words(html);
    expect(text).toContain("361 visits to harbordental.com in the last 7 days. 41 more than the 7 days before. Over the last 4 weeks, most came from Google searches like “dentist elmwood buffalo”.");
    expect(text).toContain("31 people clicked to book or call: 24 to book, 7 to call. Up 5 from the 7 days before.");
    expect(text).not.toMatch(/\bvs\b/);
    expect(text).toContain("The change that mattered");
    expect(text).toContain("Maya at North Studio moved the Book a visit button to the top of the home page.");
    expect(html).toMatch(/href="\/preview\/strelva\/xa\/xa4-systems\/website"[^>]*>See it</);
    // The date and the link wrap as one, so no line can start with the separator.
    expect(html).toMatch(/<span class="[^"]*changeTail[^"]*"><span class="[^"]*changeWhen[^"]*">Nov 20<\/span><span class="[^"]*changeWhen[^"]*"> · <\/span><a /);
    expect(html).toMatch(/aria-current="page"[^>]*>Last 7 days</);
    expect(text).toContain("Nothing needs fixing (checked Nov 23)");
    // No figure, no chart, and the head does not repeat the sentence.
    expect(html).not.toMatch(/role="img" aria-label="Daily visits/);
    expect(text.match(/41 more than/g)).toHaveLength(1);
    // Search and source facts are plain text, not rows that look tappable.
    expect(html).not.toMatch(/<a [^>]*>[^<]*dentist elmwood/);
    expect(resultsFinding({ stats: null } as never)).toBeNull();
    expect(resultsLead({ stats: null } as never)).toBeNull();
  });

  it("says a quiet week plainly and leaves the change out when What changed couldn't be read", () => {
    expect(words(render("results", "quiet"))).toContain("Nothing on harbordental.com changed in the last 7 days.");
    expect(words(render("results", "changes-unavailable"))).not.toContain("The change that mattered");
  });

  it("picks the newest change that wasn't undone and links to its System", () => {
    const receipt = (sentence: string, state: "undo" | "undone", systemId: string | null) => ({ sentence, at: "2026-11-20T15:40:00Z", systemId, undo: { state } as never });
    expect(resultsChange([receipt("Strelva fixed the map link", "undone", "s1"), receipt("Maya at North Studio moved the button", "undo", "s2")], "w1"))
      .toEqual({ sentence: "Maya at North Studio moved the button.", at: "2026-11-20T15:40:00Z", href: "/workspace?view=system&system=s2&workspaceId=w1" });
    expect(resultsChange([receipt("You said yes to new hours.", "undo", null)], "w1")?.href).toBe("/workspace?workspaceId=w1");
    expect(resultsChange([], "w1")).toBeNull();
    expect(resultsWindowPhrase({ key: "week", label: "This week (Nov 16 – Nov 23)" })).toBe("this week");
    expect(resultsWindowPhrase({ key: "custom", label: "Nov 1 – Nov 9" })).toBe("between Nov 1 and Nov 9");
  });

  it("counts the same week the same way on Results and Recaps, and 4 weeks as at least two of them", () => {
    const results = words(render("results"));
    const recaps = words(render("recaps"));
    expect(results).toContain("361 visits to harbordental.com in the last 7 days. 41 more than the 7 days before.");
    expect(recaps).toContain("361 visits to harbordental.com, up 13% from the week before.");
    expect(words(render("recaps", "ready", { period: "week", recap: "w46" }))).toContain("320 visits to harbordental.com");
    const fourWeeks = Number(/([\d,]+) visits and viewed/.exec(results)![1]!.replace(/,/g, ""));
    expect(fourWeeks).toBeGreaterThanOrEqual(361 + 320);
  });

  it("leads a recap with one sentence and the change that mattered, not a count", () => {
    const text = words(render("recaps"));
    expect(text).toContain("361 visits to harbordental.com, up 13% from the week before. 3 people asked for directions from Google Maps.");
    expect(text).not.toMatch(/new patients found you/);
    // The rail lists October's report from early November, then September's.
    expect(text).toMatch(/October report from North Studio Nov 3 .*September report from North Studio Updated Oct 2/);
    expect(text).not.toContain("August report");
    expect(text).toContain("The change that mattered Maya at North Studio moved the Book a visit button to the top of the home page.");
    expect(text).toContain("Also changed");
    expect(render("recaps")).not.toContain("pose-lineup");
    expect(recapMattered({ highlights: ["1,612 people visited your site this month", "Cleanings is now the most visited page"] })).toBe("Cleanings is now the most visited page");
    expect(recapMattered({ highlights: ["361 people visited your site"] })).toBeNull();
    expect(recapLead({ visits: 1, visitsDelta: 0, period: "month" }, "harbordental.com")).toBe("1 visit to harbordental.com, the same as the month before.");
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
    changes: [{ revision: 3, contentHash: "a", createdAt: "2026-09-10T12:00:00Z", createdBy: "maya", published: true, summary: "added the Insurance page" }, { revision: 4, contentHash: "b", createdAt: "2026-09-12T12:00:00Z", createdBy: "strelva", published: true, summary: "changed the hours on the home page" }, { revision: 5, contentHash: "c", createdAt: "2026-09-20T12:00:00Z", createdBy: "maya", published: false, summary: null }] };

  it("shapes the monthly report like E3: one sentence, the change that mattered said as who did what, an ink button", () => {
    const paper = websiteReportPaper(report, "https://app.example/open", { actors: { maya: "Maya at North Studio" } });
    // No idle clay line-up, and no sender line repeating the subject.
    expect(paper.blocks.some(block => block.kind === "clay")).toBe(false);
    expect(paper.senderDetail).toBe("");
    expect(paper.blocks.some(block => block.kind === "figure" || block.kind === "rows" || block.kind === "metrics")).toBe(false);
    expect(paper.blocks).toContainEqual({ kind: "lead", text: "38 inquiries came in through your site in September.", quiet: "61 visits were booked, and 55 of them are on your calendar." });
    // "See it" opens the website System, not the same place as the primary.
    expect(paper.blocks).toContainEqual(expect.objectContaining({ kind: "change", label: "The change that mattered", text: "Strelva changed the hours on the home page.", date: "Sep 12",
      link: { label: "See it", url: expect.stringContaining("/workspace?view=system&system=w&workspaceId=5e000000-0000-4000-8000-0000000000d1") } }));
    // The subject doesn't repeat the lead's number.
    expect(paper.subject).toBe("Harbor Dental: your September 2026 recap");
    const html = renderPaperEmailHtml(paper);
    expect(html).toContain(">Maya at North Studio<"); expect(html).toContain("Also changed"); expect(html).toContain("Added the Insurance page"); expect(html).toContain("background:#161715");
    expect(html).not.toMatch(/Published a change to the site|Saved a draft|Monthly recap ·/);
    // Above the lead the business is named by the subject line and the sender only.
    const card = html.slice(html.indexOf("<body"), html.lastIndexOf("38 inquiries"));
    expect(card.match(/Harbor Dental/g)).toHaveLength(2);
    expect(html).not.toContain("font-size:64px");
    expect(html).not.toMatch(/retained|saved answer|Also this month/);
  });

  it("says where a connected-site inquiry is kept without the word workspace", () => {
    const paper = connectedInquiryEmail({ siteHost: "www.harbordental.com", workspaceId: "5e000000-0000-4000-8000-0000000000d1" }, { name: "Priya Shah", email: "p@example.com", message: "Hello" }).options.paper;
    const said = paper.blocks.flatMap(block => block.kind === "paragraph" ? [block.text] : []).join(" ");
    expect(said).toContain("saved in Strelva"); expect(said).not.toContain("workspace");
  });
});
