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
  PREVIEW_BRAND, PREVIEW_BRAND_UNAVAILABLE, PREVIEW_CAREPLAN_LIST, PREVIEW_CAREPLAN_SKIPS, PREVIEW_FACTS, PREVIEW_RELEASES, PREVIEW_SNAPSHOT, previewAgencyView, PREVIEW_NOTE,
} from "@/experience/care-reports/preview-fixture";

const AGENCY = "5e000000-0000-4000-8000-0000000000a0";
const WS = "5e000000-0000-4000-8000-0000000000b0";

describe("Care plan report document", () => {
  const render = (props: Partial<Parameters<typeof CareReportDocument>[0]> = {}) => renderToStaticMarkup(createElement(CareReportDocument, {
    snapshot: PREVIEW_SNAPSHOT, brand: PREVIEW_BRAND, releaseNumber: 2, audience: "owner", releases: PREVIEW_RELEASES, releaseHref: n => `/r?release=${n}`, ...props,
  }));

  it("credits the agency once, keeps Release numbers from the owner and marks only the unchecked change", () => {
    const html = render();
    for (const text of ["North Studio", "Runs on Strelva", "Not checked", "Print or save as PDF", PREVIEW_NOTE, "Sep 4", "3 h 5 min", "harbordental.com passed all 30 checks."]) {
      expect(html, text).toContain(text.replace(/'/g, "&#x27;"));
    }
    expect(html).not.toMatch(/Release \d|Earlier releases/);
    const agency = render({ audience: "agency" });
    for (const text of ["Release 2", "Earlier releases"]) expect(agency, text).toContain(text);
    expect(html).not.toContain("Checked on the live site");
    expect(html).not.toContain("wasn&#x27;t checked on the live site");
    expect(html.match(/Runs on Strelva/g)).toHaveLength(1);
  });

  it("never shows a price or the word Version", () => {
    const html = render();
    expect(html).not.toContain("$");
    expect(html).not.toContain("Version");
    expect(html).not.toContain("Ask Strelva");
  });

  it("shows an unavailable agency identity as it is, never as Strelva Agency", () => {
    const html = render({ brand: PREVIEW_BRAND_UNAVAILABLE });
    expect(html).toContain("Agency identity unavailable");
    expect(html).not.toContain("Strelva Agency");
  });

  it("labels the draft that is not shared", () => {
    const draft = render({ releaseNumber: null, audience: "agency", releases: undefined });
    expect(draft).not.toContain("Release 2");
    expect(draft).toContain("Harbor Dental");
  });

  it("says plainly when nothing happened", () => {
    const html = render({ snapshot: { ...PREVIEW_FACTS, changes: { total: 0, confirmed: 0, notConfirmed: 0, notChecked: 0, items: [] }, requests: { doneCount: 0, openCount: 0, askedCount: 0, done: [] }, time: { minutes: 0, entries: 0, byCategory: {} } } });
    for (const text of ["Nothing changed on Harbor Dental&#x27;s Systems this month.", "No requests were finished this month.", "North Studio didn&#x27;t record time this month."]) expect(html).toContain(text);
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

  it("says once that email is off, with no email control", async () => {
    await mountEditor();
    expect(button("Email it to Harbor Dental")).toBeUndefined();
    expect(node.textContent!.split("Not sent: email is off. Copy the link and send it yourself.")).toHaveLength(2);
  });

  it("offers email for the newest unsent Release when email is on", async () => {
    await mountEditor({ emailOn: true });
    expect(button("Email it to Harbor Dental")).toBeDefined();
  });

  it("has one ink yes, and share links as text", async () => {
    await mountEditor({ shareLinksOn: true });
    expect(node.querySelectorAll("[data-xa-primary]")).toHaveLength(1);
    expect(button("Copy the link for Harbor Dental")).toBeDefined();
  });

  it("offers a link anyone can open only when share links are on", async () => {
    await mountEditor();
    expect(button("Make a link anyone can open")).toBeUndefined();
    expect(button("Copy the link for Harbor Dental")).toBeDefined();
    await act(async () => root.unmount());
    root = createRoot(node);
    await mountEditor({ shareLinksOn: true, shareLink: true });
    expect(button("Make a new open link")).toBeDefined();
    expect(button("Turn the open link off")).toBeDefined();
    expect(node.textContent).toContain("An open link has been on since Oct 2. A new one turns the old one off.");
  });

  it("gives staff a read-only report: no note, share or send", async () => {
    await mountEditor({ canWrite: false, emailOn: true, shareLinksOn: true });
    expect(node.querySelector("textarea")).toBeNull();
    expect(button("Save without sharing")).toBeUndefined();
    expect(button("Count the month again")).toBeUndefined();
    expect(button("Email it to Harbor Dental")).toBeUndefined();
    expect(button("Make a link anyone can open")).toBeUndefined();
    expect(node.textContent).not.toContain("Share Release");
    expect(node.textContent).toContain("You can read this report.");
  });

  it("names the Release a writer is about to share", async () => {
    await mountEditor();
    expect(node.textContent).toContain("Share Release 3 with Harbor Dental");
    expect(node.querySelector("textarea")).not.toBeNull();
  });

  it("shares a typed note with the Release: saves the note first, then shares", async () => {
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { action?: string };
      if (body.action === "note") return Response.json({ ...previewAgencyView({ canWrite: true, shared: true }), report: { ...previewAgencyView({ canWrite: true, shared: true }).report, revision: 4, agencyNote: "A new note" } });
      return Response.json({ error: "held in test" }, { status: 400 });
    });
    await mount(createElement(CareReportEditor, { initial: previewAgencyView({ canWrite: true, shared: true }), brand: PREVIEW_BRAND, emailOn: false, shareLinksOn: false, origin: "https://app.example.test", request }));
    const area = node.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(area, "A new note");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(button("Save without sharing")).toBeDefined();
    const share = button("Share Release 3") as HTMLButtonElement;
    expect(share.disabled).toBe(false);
    await act(async () => { share.click(); });
    const actions = request.mock.calls.map(([, init]) => (JSON.parse(String(init?.body ?? "{}")) as { action?: string; expectedRevision?: number }));
    expect(actions[0]).toMatchObject({ action: "note" });
    expect(actions[1]).toMatchObject({ action: "publish", expectedRevision: 4 });
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
