// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IntakeAppPanel } from "@/experience/vertical-intake/IntakeAppPanel";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import type { IntakeAppView, IntakeInstallView, IntakeSubmissionView } from "@/products/vertical-intake/client";

const WS = "84000000-0000-4000-8000-000000000001";
const KEY = "sk_pub_abcdefghijklmnopqrstuvwx";
const config = { bookingServiceId: null, collectMemberId: false, pageUrl: null, formLabel: "Send" };
const install = (over: Partial<IntakeInstallView> = {}): IntakeInstallView => ({
  id: "84000000-0000-4000-8000-0000000000a1", workspaceId: WS, appId: "dental_intake", status: "draft", draftConfig: config, draftRevision: 1,
  liveRelease: null, liveRequestedAt: null, lastLiveCheck: null, updatedAt: "2026-10-20T00:00:00Z", ...over,
});
const ready = [
  { id: "phone", state: "done", blocking: true, label: "Office phone in Business details", detail: "Patients with tooth pain are told to call this number." },
  { id: "site", state: "done", blocking: true, label: "Your website is connected", detail: "The form shows on your connected website." },
  { id: "insurance", state: "missing", blocking: false, label: "Insurance plans you accept", detail: "Patients will only see No insurance and Other." },
  { id: "email", state: "note", blocking: false, label: "Patient email", detail: "Patients aren't emailed while customer email is off. The office calls them back." },
] as const;
const submission = (over: Partial<IntakeSubmissionView> = {}): IntakeSubmissionView => ({
  id: "84000000-0000-4000-8000-0000000000b1", leadRowId: "84000000-0000-4000-8000-0000000000c1", name: "Pat Lee", email: "pat@example.test", phone: "716 555 0111",
  answers: { reason: "checkup" }, triage: "routine", state: "new", bookingId: null, createdAt: new Date(Date.now() - 3 * 3600_000).toISOString(), hasSensitive: false, reasonLabel: "Checkup and cleaning", ...over,
});
const view = (over: Partial<IntakeAppView> = {}): IntakeAppView => ({
  app: { appId: "dental_intake", name: "Dental intake", label: "Dental intake Release 1" }, access: "owner", install: install(), releases: [],
  readiness: [...ready] as unknown as IntakeAppView["readiness"], canGoLive: true,
  sites: [{ siteId: "s1", host: "north.example", siteKey: KEY, lines: { script: `<script src="https://app.strelva.test/connect.js" data-strelva-site="${KEY}" defer></script>`, mount: '<div data-strelva-app="dental_intake"></div>' }, codeSnippet: `<StrelvaIntake baseUrl="https://app.strelva.test" siteKey="${KEY}" appId="dental_intake" />` }],
  services: [{ id: "svc-exam", name: "New patient exam" }], submissions: [], sensitiveAvailable: false, emailOn: false, manualBookingsOn: true,
  previewForm: {} as IntakeAppView["previewForm"], ...over,
});

const roots: ReturnType<typeof createRoot>[] = [];
let request: ReturnType<typeof vi.fn>;
async function mount(initial: IntakeAppView, handler?: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  request = vi.fn(async (url: string | URL | Request, init?: RequestInit) => handler ? handler(String(url), init) : new Response(JSON.stringify(initial), { status: 200 }));
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => { root.render(createElement(WorkspaceRequestContext.Provider, { value: request as unknown as typeof fetch }, createElement(IntakeAppPanel, { workspaceId: WS, initial }))); });
  return node;
}
const button = (node: Element, text: string) => [...node.querySelectorAll("button, a")].find(el => el.textContent?.trim() === text) as HTMLButtonElement | undefined;
const click = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); };

beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });

describe("Dental intake panel", () => {
  it.each([
    ["Not set up", view({ install: null })],
    ["Draft", view()],
    ["Draft · Waiting in Needs you", view({ install: install({ liveRequestedAt: "2026-10-20T01:00:00Z" }) })],
    ["Live · Release 1", view({ install: install({ status: "live", liveRelease: 1 }) })],
    ["Paused · Release 1", view({ install: install({ status: "paused", liveRelease: 1 }) })],
  ])("shows the status %s", async (text, data) => {
    const node = await mount(data);
    expect(node.querySelector("#dental-intake-title")!.textContent).toBe("Dental intake");
    expect(node.textContent).toContain("By Strelva");
    expect(node.textContent).toContain(text);
    expect(node.querySelector("section#dental-intake")).not.toBeNull();
  });

  it("always shows the health information note", async () => {
    for (const data of [view({ install: null }), view({ access: "member" })]) {
      const node = await mount(data);
      expect(node.textContent).toContain("it isn't a HIPAA-covered system");
      expect(node.textContent).toContain("asks patients not to include medical details");
    }
  });

  it("disables the member ID checkbox with the business associate agreement copy when it is unavailable", async () => {
    const node = await mount(view());
    const box = node.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(box.disabled).toBe(true);
    expect(box.checked).toBe(false);
    expect(node.textContent).toContain("Off. Asking for member IDs waits until Strelva can hold them under a business associate agreement.");
    const open = await mount(view({ sensitiveAvailable: true }));
    expect(open.querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled).toBe(false);
  });

  it("says patients aren't emailed while customer email is off", async () => {
    expect((await mount(view())).textContent).toContain("Patients aren't emailed while customer email is off. The office calls them back.");
    const on = await mount(view({ emailOn: true, readiness: ready.filter(row => row.id !== "email") as unknown as IntakeAppView["readiness"] }));
    expect(on.textContent).not.toContain("Patients aren't emailed while customer email is off. The office calls them back.");
  });

  it("gives the owner Make it live and an admin or agency Ask the owner", async () => {
    const owner = await mount(view());
    expect(button(owner, "Make it live")).toBeDefined();
    expect(button(owner, "Ask the owner to make it live")).toBeUndefined();
    for (const access of ["admin", "agency"]) {
      const other = await mount(view({ access }));
      expect(button(other, "Ask the owner to make it live")).toBeDefined();
      expect(button(other, "Make it live")).toBeUndefined();
    }
    const member = await mount(view({ access: "member" }));
    expect(button(member, "Make it live")).toBeUndefined();
    expect(member.querySelector("form")).toBeNull();
  });

  it("disables both actions with the reason while a required step is missing", async () => {
    const blocked = [{ ...ready[0], state: "missing" }, ...ready.slice(1)] as unknown as IntakeAppView["readiness"];
    const owner = await mount(view({ canGoLive: false, readiness: blocked }));
    expect(button(owner, "Make it live")!.disabled).toBe(true);
    expect(owner.textContent).toContain("Finish first: Office phone in Business details.");
    const admin = await mount(view({ access: "admin", canGoLive: false, readiness: blocked }));
    expect(button(admin, "Ask the owner to make it live")!.disabled).toBe(true);
  });

  it("asks through the workspace route and then links to Needs you", async () => {
    const after = view({ install: install({ liveRequestedAt: "2026-10-20T01:00:00Z" }) });
    const node = await mount(view(), (url, init) => url.startsWith("/api/workspace/vertical-intake?") ? new Response(JSON.stringify(after)) : new Response(JSON.stringify({ install: {} }), { status: init?.method === "POST" ? 200 : 500 }));
    await click(button(node, "Make it live")!);
    const post = request.mock.calls.find(call => (call[1] as RequestInit | undefined)?.method === "POST")!;
    expect(JSON.parse((post[1] as RequestInit).body as string)).toEqual({ workspaceId: WS, appId: "dental_intake", action: "request_live" });
    expect(node.textContent).toContain("Waiting in Needs you");
    expect(button(node, "Review it in Needs you")!.getAttribute("href")).toBe(`/workspace?workspaceId=${WS}&view=needs-you`);
  });

  it("puts the two lines on the clipboard", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const data = view();
    const node = await mount(data);
    expect(node.textContent).toContain('<div data-strelva-app="dental_intake"></div>');
    await click(button(node, "Copy")!);
    expect(writeText).toHaveBeenCalledWith(`${data.sites[0]!.lines.script}\n${data.sites[0]!.lines.mount}`);
    expect(button(node, "Copied")).toBeDefined();
    expect(node.querySelector("details summary")!.textContent).toBe("Site built in code");
  });

  it("shows each live check result in plain words", async () => {
    const live = install({ status: "live", liveRelease: 1 });
    for (const [state, text] of [["found", "The form is on https://north.example/visit (Release 1)."], ["not_seen", "We couldn't see the form on https://north.example/visit. If your site draws it with JavaScript, open the page and check by eye."], ["unreachable", "We couldn't open https://north.example/visit just now."]] as const) {
      const node = await mount(view({ install: live }), () => new Response(JSON.stringify({ check: { state, checkedAt: "2026-10-20T00:00:00Z", url: "https://north.example/visit", release: 1 } })));
      await click(button(node, "Check the live page")!);
      expect(node.querySelector('[role="status"]')!.textContent).toContain(text);
    }
  });

  it("lists recent requests with honest states and an Urgent tag", async () => {
    const node = await mount(view({ install: install({ draftConfig: { ...config, bookingServiceId: "svc-exam" }, status: "live", liveRelease: 1 }), submissions: [
      submission({ triage: "urgent", name: "Sam Roe" }), submission({ id: "x2", name: "No Email", email: null }), submission({ id: "x3", name: "Booked", state: "visit_booked" }), submission({ id: "x4", name: "Declined", state: "not_booked" }),
    ] }));
    const text = node.textContent!;
    expect(text).toContain("Urgent");
    expect(text).toContain("Waiting in Needs you");
    expect(text).toContain("No open time matched. Call them.");
    expect(text).toContain("Visit booked");
    expect(text).toContain("Not booked");
    expect(text).toContain("3 h ago");
    expect(text).not.toContain("ABC");
  });

  it("shows Show member ID only to an owner or admin, reveals it in place and hides it again", async () => {
    const sensitive = submission({ hasSensitive: true });
    const live = install({ status: "live", liveRelease: 1 });
    const reveal = () => new Response(JSON.stringify({ values: [{ label: "Member ID", value: "ABC123XYZ" }] }));
    const owner = await mount(view({ install: live, submissions: [sensitive] }), reveal);
    expect(owner.textContent).not.toContain("ABC123XYZ");
    await click(button(owner, "Show member ID")!);
    expect(owner.textContent).toContain("Member ID: ABC123XYZ");
    const post = request.mock.calls.find(call => (call[1] as RequestInit | undefined)?.method === "POST")!;
    expect(JSON.parse((post[1] as RequestInit).body as string)).toMatchObject({ action: "reveal", submissionId: sensitive.id });
    await click(button(owner, "Hide")!);
    expect(owner.textContent).not.toContain("ABC123XYZ");
    expect(button(await mount(view({ access: "admin", install: live, submissions: [sensitive] })), "Show member ID")).toBeDefined();
    expect(button(await mount(view({ access: "agency", install: live, submissions: [sensitive] })), "Show member ID")).toBeUndefined();
    expect(button(await mount(view({ access: "member", install: live, submissions: [sensitive] })), "Show member ID")).toBeUndefined();
    expect(button(await mount(view({ install: live, submissions: [submission()] })), "Show member ID")).toBeUndefined();
  });

  it("shows a server message when an action is refused", async () => {
    const node = await mount(view(), () => new Response(JSON.stringify({ error: "Finish the required steps first: Your website is connected." }), { status: 409 }));
    await click(button(node, "Make it live")!);
    expect(node.querySelector('[role="alert"]')!.textContent).toBe("Finish the required steps first: Your website is connected.");
  });
});
