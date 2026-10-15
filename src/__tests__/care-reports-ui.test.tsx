// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgencyCareReports } from "@/experience/care-reports/AgencyCareReports";
import { AgencyClientTime } from "@/experience/care-reports/AgencyClientTime";
import { CareReportDocument } from "@/experience/care-reports/CareReportDocument";
import { CareReportEditor } from "@/experience/care-reports/CareReportEditor";
import {
  PREVIEW_BRAND, PREVIEW_BRAND_UNAVAILABLE, PREVIEW_CAREPLAN_LIST, PREVIEW_CAREPLAN_SKIPS, PREVIEW_FACTS, PREVIEW_RELEASES, PREVIEW_SNAPSHOT, previewAgencyView,
} from "@/experience/care-reports/preview-fixture";

const AGENCY = "5e000000-0000-4000-8000-0000000000a0";
const WS = "5e000000-0000-4000-8000-0000000000b0";

describe("Care plan report document", () => {
  const render = (props: Partial<Parameters<typeof CareReportDocument>[0]> = {}) => renderToStaticMarkup(createElement(CareReportDocument, {
    snapshot: PREVIEW_SNAPSHOT, brand: PREVIEW_BRAND, releaseNumber: 2, audience: "owner", releases: PREVIEW_RELEASES, releaseHref: n => `/r?release=${n}`, ...props,
  }));

  it("credits the agency, shows the Release and tells checked from unchecked", () => {
    const html = render();
    for (const text of ["Prepared by North Studio", "Runs on Strelva", "Release 2", "Checked on the live site", "Not checked on the live site", "not continuous uptime", "Print or save as PDF",
      "A note from North Studio", "Earlier Releases", "1 change wasn&#x27;t checked on the live site", "Done Sep 4", "3 h 5 min"]) {
      expect(html, text).toContain(text);
    }
  });

  it("never shows a price or the word Version", () => {
    const html = render();
    expect(html).not.toContain("$");
    expect(html).not.toContain("Version");
    expect(html).toContain("42 Ask Strelva and drafting runs");
  });

  it("shows an unavailable agency identity as it is, never as Strelva Agency", () => {
    const html = render({ brand: PREVIEW_BRAND_UNAVAILABLE });
    expect(html).toContain("Prepared by Agency identity unavailable");
    expect(html).not.toContain("Strelva Agency");
  });

  it("labels the draft that is not shared", () => {
    expect(render({ releaseNumber: null, audience: "agency", releases: undefined })).toContain("Draft, not shared");
  });

  it("says plainly when nothing happened", () => {
    const html = render({ snapshot: { ...PREVIEW_FACTS, changes: { total: 0, confirmed: 0, notConfirmed: 0, notChecked: 0, items: [] }, requests: { doneCount: 0, openCount: 0, askedCount: 0, done: [] }, time: { minutes: 0, entries: 0, byCategory: {} } } });
    for (const text of ["No Releases were recorded this month.", "No Requests were done this month.", "No time recorded by North Studio this month."]) expect(html).toContain(text);
  });

  it("hides the controls when printed", () => {
    const html = render();
    expect(html).toContain("@media print");
    expect(html).toContain("data-print-hide");
  });
});

let root: Root;
let node: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); node = document.createElement("div"); document.body.appendChild(node); root = createRoot(node); });
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); });
const mount = (element: ReturnType<typeof createElement>) => act(async () => root.render(element));
const button = (text: string) => [...node.querySelectorAll("button")].find(item => item.textContent?.includes(text));
const list = (over: Record<string, unknown> = {}, emailOn = false) => Response.json({ ...PREVIEW_CAREPLAN_LIST, emailOn, shareLinksOn: false, ...over });

describe("AgencyCareReports", () => {
  const mountList = (request: typeof fetch, extra: Record<string, unknown> = {}) =>
    mount(createElement(AgencyCareReports, { agencyWorkspaceId: AGENCY, agencyName: "North Studio", initialMonth: "2026-09", request, ...extra }));

  it("renders nothing while the App is off", async () => {
    await mountList(vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: "off" }, { status: 503 })));
    expect(node.innerHTML).toBe("");
  });

  it("shows the bulk action only to someone who can generate", async () => {
    await mountList(vi.fn<typeof fetch>().mockImplementation(async () => list()));
    expect(button("Generate September 2026 reports for all clients")).toBeDefined();
    await act(async () => root.unmount());
    root = createRoot(node);
    await mountList(vi.fn<typeof fetch>().mockImplementation(async () => list({ canGenerate: false })));
    expect(button("Generate September 2026 reports for all clients")).toBeUndefined();
  });

  it("says in each row that email is off, and what each report is", async () => {
    await mountList(vi.fn<typeof fetch>().mockImplementation(async () => list()));
    const text = node.textContent!;
    expect(text.match(/Not sent: email is off\. Copy the link and send it yourself\./g)?.length).toBeGreaterThanOrEqual(4);
    expect(text).toContain("Release 2 shared Oct 2");
    expect(text).toContain("Draft");
    expect(text).toContain("Not generated");
    expect(text).toContain("4 Releases · 3 checked");
    expect(text).toContain("Reports go out under North Studio's name. Nothing is sent to a client until you share it. Email is off, so share by copying the link.");
  });

  it("offers a per-row Generate only where there is no report and the person can write", async () => {
    await mountList(vi.fn<typeof fetch>().mockImplementation(async () => list()));
    expect([...node.querySelectorAll("button")].filter(item => item.textContent === "Generate")).toHaveLength(1);
  });

  it("posts the month and, for one row, that client", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => init?.method === "POST" ? Response.json({ generated: 1, reports: [], skipped: [] }) : list());
    await mountList(request);
    await act(async () => { [...node.querySelectorAll("button")].find(item => item.textContent === "Generate")!.click(); });
    const post = request.mock.calls.find(call => call[1]?.method === "POST")!;
    expect(JSON.parse(String(post[1]!.body))).toEqual({ agencyWorkspaceId: AGENCY, month: "2026-09", workspaceIds: [PREVIEW_CAREPLAN_LIST.clients[2]!.workspaceId] });
    expect(node.textContent).toContain("1 generated");
  });

  it("writes each skipped reason as a sentence", async () => {
    await mountList(vi.fn<typeof fetch>().mockImplementation(async () => list()), { initialOutcome: PREVIEW_CAREPLAN_SKIPS });
    const text = node.textContent!;
    expect(text).toContain("2 generated");
    expect(text).toContain("You can't prepare reports for Elmwood Books");
    expect(text).toContain("Care plan reports are off for Pier 9 Tackle");
    expect(text).toContain("Cobble Hill Tailors couldn't be read. Nothing changed.");
  });

  it("shows a retry when the read fails", async () => {
    await mountList(vi.fn<typeof fetch>().mockResolvedValue(Response.json({}, { status: 500 })));
    expect(node.textContent).toContain("Care plan reports could not be read. Nothing changed.");
    expect(button("Retry")).toBeDefined();
  });
});

describe("CareReportEditor", () => {
  const mountEditor = (props: { canWrite?: boolean; emailOn?: boolean; shareLinksOn?: boolean; shareLink?: boolean } = {}) =>
    mount(createElement(CareReportEditor, {
      initial: previewAgencyView({ canWrite: props.canWrite ?? true, shared: true, shareLink: props.shareLink }), brand: PREVIEW_BRAND,
      emailOn: props.emailOn ?? false, shareLinksOn: props.shareLinksOn ?? false, origin: "https://app.example.test", request: vi.fn<typeof fetch>(),
    }));

  it("disables the email button and says why when email is off", async () => {
    await mountEditor();
    expect(button("Email to Harbor Dental")).toBeDefined();
    expect((button("Email to Harbor Dental") as HTMLButtonElement).disabled).toBe(true);
    expect(node.textContent).toContain("Not sent: email is off. Copy the link and send it yourself.");
  });

  it("enables the email button when email is on", async () => {
    await mountEditor({ emailOn: true });
    expect((button("Email to Harbor Dental") as HTMLButtonElement).disabled).toBe(false);
  });

  it("offers a link anyone can open only when share links are on", async () => {
    await mountEditor();
    expect(button("Create a link anyone can open")).toBeUndefined();
    expect(button("Copy link for signed-in owners")).toBeDefined();
    await act(async () => root.unmount());
    root = createRoot(node);
    await mountEditor({ shareLinksOn: true, shareLink: true });
    expect(button("Create a link anyone can open")).toBeDefined();
    expect(button("Turn off the link")).toBeDefined();
    expect(node.textContent).toContain("A link is on since Oct 2. Create a new link to copy it again; the old one stops working.");
  });

  it("gives staff a read-only report: no note, share or send", async () => {
    await mountEditor({ canWrite: false, emailOn: true, shareLinksOn: true });
    expect(node.querySelector("textarea")).toBeNull();
    expect(button("Save note")).toBeUndefined();
    expect(button("Refresh the numbers")).toBeUndefined();
    expect(button("Email to Harbor Dental")).toBeUndefined();
    expect(button("Create a link anyone can open")).toBeUndefined();
    expect(node.textContent).not.toContain("Hold to share");
    expect(node.textContent).toContain("You can read this report.");
  });

  it("names the Release a writer is about to share", async () => {
    await mountEditor();
    expect(node.textContent).toContain("Hold to share Release 3 with Harbor Dental");
    expect(node.querySelector("textarea")).not.toBeNull();
  });
});

describe("AgencyClientTime", () => {
  const entries = [
    { id: "5e000000-0000-4000-8000-0000000000d1", minutes: 45, category: "change", occurredOn: "2026-10-05", note: null, recordedBy: "owner@example.test", recordedAt: "2026-10-05T10:00:00Z", voided: false },
    { id: "5e000000-0000-4000-8000-0000000000d2", minutes: 75, category: "delivery", occurredOn: "2026-10-06", note: "Newsletter", recordedBy: "staff@example.test", recordedAt: "2026-10-06T10:00:00Z", voided: false },
    { id: "5e000000-0000-4000-8000-0000000000d3", minutes: 500, category: "other", occurredOn: "2026-10-06", note: null, recordedBy: "staff@example.test", recordedAt: "2026-10-06T11:00:00Z", voided: true },
  ];
  const mountTime = (request: typeof fetch, who: { viewerEmail?: string; canManage?: boolean } = { canManage: true }) => mount(createElement(AgencyClientTime, { agencyWorkspaceId: AGENCY, workspaceId: WS, clientName: "Harbor Dental", ...who, request }));

  it("renders nothing while the App is off", async () => {
    await mountTime(vi.fn<typeof fetch>().mockResolvedValue(Response.json({}, { status: 503 })));
    expect(node.innerHTML).toBe("");
  });

  it("totals the month without the voided entry", async () => {
    await mountTime(vi.fn<typeof fetch>().mockImplementation(async () => Response.json(entries)));
    expect(node.textContent).toContain("Time this month · 2 h");
    expect(node.textContent).not.toContain("8 h 20 min");
  });

  it("records time with a fresh uuid and the minutes entered", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => init?.method === "POST" ? Response.json({}) : Response.json(entries));
    await mountTime(request);
    const input = [...node.querySelectorAll("input")].find(item => item.labels?.[0]?.textContent?.includes("Minutes"))!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "30");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    const post = request.mock.calls.find(call => call[1]?.method === "POST")!;
    const body = JSON.parse(String(post[1]!.body));
    expect(body).toMatchObject({ agencyWorkspaceId: AGENCY, workspaceId: WS, minutes: 30, category: "delivery" });
    expect(body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("asks for a reason before removing", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(entries));
    await mountTime(request);
    await act(async () => { button("Remove")!.click(); });
    expect(node.textContent).toContain("Reason");
    const remove = [...node.querySelectorAll("button")].filter(item => item.textContent === "Remove");
    expect(remove.some(item => item.disabled)).toBe(true);
  });

  const removeButtons = () => [...node.querySelectorAll("button")].filter(item => item.textContent === "Remove");

  it("shows Remove only on the viewer's own entries for staff", async () => {
    await mountTime(vi.fn<typeof fetch>().mockImplementation(async () => Response.json(entries)), { viewerEmail: "Staff@example.test", canManage: false });
    expect(removeButtons()).toHaveLength(1);
    expect(node.textContent).toContain("Newsletter");
  });

  it("hides Remove when the viewer recorded nothing and cannot manage", async () => {
    await mountTime(vi.fn<typeof fetch>().mockImplementation(async () => Response.json(entries)), { viewerEmail: "other@example.test", canManage: false });
    expect(removeButtons()).toHaveLength(0);
  });

  it("shows Remove on every entry for owners and admins", async () => {
    await mountTime(vi.fn<typeof fetch>().mockImplementation(async () => Response.json(entries)), { viewerEmail: "other@example.test", canManage: true });
    expect(removeButtons()).toHaveLength(2);
  });
});
