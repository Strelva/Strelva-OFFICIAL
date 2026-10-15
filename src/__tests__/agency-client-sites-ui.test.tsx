// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgencyClientSites } from "@/experience/connected-sites/AgencyClientSites";

const AGENCY = "7f100000-0000-4000-8000-000000000001";
const id = (n: number) => `7f100000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const site = (n: number, patch: Record<string, unknown> = {}) => ({ id: id(900 + n), siteHost: `client${n}.example`, siteUrl: `https://client${n}.example/`, platform: "unknown", detectedPlatform: null, verifiedAt: null, firstEventAt: null, lastEventAt: null, lastCheckedAt: null, lastCheckResult: null, ...patch });
const detection = (n: number, platform: string, reachable = true) => ({ siteUrl: `https://client${n}.example/`, siteHost: `client${n}.example`, platform, evidence: [], reachable, detectedAt: new Date().toISOString() });
const row = (n: number, patch: Record<string, unknown> = {}) => ({ workspaceId: id(n), name: `Client ${n}`, website: `https://client${n}.example/`, sourceUrl: null, detection: null, site: null, enabled: true, health: null, ...patch });

const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
async function mount(handler: Handler) {
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push(root);
  const request = vi.fn(async (url: string, init?: RequestInit) => handler(String(url), init));
  await act(async () => root.render(createElement(AgencyClientSites, { agencyWorkspaceId: AGENCY, request: request as unknown as typeof fetch })));
  await act(async () => { await Promise.resolve(); });
  return { node, request };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const button = (node: HTMLElement, label: string) => [...node.querySelectorAll("button")].find(item => item.textContent?.trim() === label) as HTMLButtonElement | undefined;
async function click(element: HTMLElement | undefined) { expect(element).toBeTruthy(); await act(async () => { element!.dispatchEvent(new MouseEvent("click", { bubbles: true })); await Promise.resolve(); await Promise.resolve(); }); }
const serve = (rows: unknown[], nextCursor: unknown = null, onPost?: (body: Record<string, unknown>) => Response | undefined): Handler => (_url, init) => {
  if (init?.method === "POST") return onPost?.(JSON.parse(String(init.body))) ?? json({ results: [] });
  return json({ clients: rows, nextCursor });
};
const mixed = [
  row(1, { detection: detection(1, "wix") }),
  row(2, { detection: detection(2, "wix"), site: site(2, { verifiedAt: "2026-10-01T00:00:00Z", lastEventAt: "2026-10-19T00:00:00Z" }) }),
  row(3, { detection: detection(3, "godaddy") }),
  row(4, { website: null }),
  row(5, { enabled: false }),
  row(6, { detection: detection(6, "unknown", false) }),
];

describe("Client websites", () => {
  it("shows each client's website, what it is built with and the install state", async () => {
    const { node } = await mount(serve(mixed));
    for (const heading of ["Client", "Website", "Built with", "Strelva lines", "Last visit"]) expect([...node.querySelectorAll("th")].some(item => item.textContent === heading), heading).toBe(true);
    expect(node.textContent).toContain("Sites your clients already run elsewhere. Strelva reads each live page to see what it’s built with. Nothing on the sites changes.");
    expect(node.textContent).toContain("client1.example");
    expect(node.textContent).toContain("No website on record");
    expect(node.textContent).toContain("Installed and reporting");
    expect(node.textContent).toContain("Couldn’t open the site");
    expect(node.textContent).toContain("Keep your site isn’t on for Client 5.");
    expect(node.textContent).toContain("Not added");
  });
  it("filters by what the site is built with", async () => {
    const { node } = await mount(serve(mixed));
    const select = node.querySelector("select")!;
    expect([...select.options].map(item => item.textContent)).toEqual(["All", "GoDaddy", "Wix"]);
    await act(async () => { select.value = "godaddy"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    const body = [...node.querySelectorAll("tbody tr")];
    expect(body).toHaveLength(1);
    expect(body[0]!.textContent).toContain("Client 3");
  });
  it("says GoDaddy and Google Sites can't run the lines", async () => {
    const { node } = await mount(serve([row(3, { detection: detection(3, "godaddy") }), row(7, { detection: detection(7, "google-sites") })]));
    expect(node.textContent).toContain("GoDaddy can’t run these lines.");
    expect(node.textContent).toContain("Google Sites can’t run these lines.");
  });
  it("has nothing to read when every client was read recently", async () => {
    const { node } = await mount(serve(mixed));
    expect(button(node, "Check what they\u2019re built with")!.disabled).toBe(true);
  });
  it("sends clients with no detection to be read", async () => {
    let posted: Record<string, unknown> | null = null;
    const rows = [row(1), row(2, { detection: detection(2, "wix") }), row(3, { detection: { ...detection(3, "wix"), detectedAt: "2026-09-01T00:00:00Z" } }), row(5, { enabled: false }), row(4, { website: null })];
    const { node } = await mount(serve(rows, null, body => { posted = body; return json({ results: [] }); }));
    await click(button(node, "Check what they’re built with"));
    expect(posted).toEqual({ agencyWorkspaceId: AGENCY, action: "detect", workspaceIds: [id(1), id(3)] });
  });
  it("gets the two lines for a client and copies the steps for its builder", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { node } = await mount(serve([row(1, { detection: detection(1, "wix") })], null, body => body.action === "connect"
      ? json({ site: { snippet: { script: '<script src="https://app.test/connect.js" data-strelva-site="sk_pub_x" defer></script>', meta: null } }, stepsText: "Please add two lines to client1.example" }, 201) : undefined));
    await click(button(node, "Get the two lines"));
    expect(node.querySelector('pre[aria-label="Lines for Client 1"]')?.textContent).toContain("data-strelva-site");
    await click(button(node, "Copy steps for Wix"));
    expect(writeText).toHaveBeenCalledWith("Please add two lines to client1.example");
  });
  it("copies steps for all sites of one builder", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const rows = [row(1, { detection: detection(1, "wix") }), row(2, { detection: detection(2, "wix") })];
    const { node } = await mount(serve(rows, null, body => body.action === "connect"
      ? json({ site: { snippet: { script: "<script></script>", meta: null } }, stepsText: `Steps for ${String(body.workspaceId).slice(-1)}` }, 201) : undefined));
    expect(button(node, "Copy steps for all Wix sites")).toBeUndefined();
    await click(button(node, "Get the two lines"));
    await click(button(node, "Get the two lines"));
    const select = [...node.querySelectorAll("select")][0]!;
    await act(async () => { select.value = "wix"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await click(button(node, "Copy steps for all Wix sites"));
    expect(writeText).toHaveBeenCalledWith("Steps for 1\n\n---\n\nSteps for 2");
  });
  it("never reads a failed bulk call as success", async () => {
    const { node } = await mount(serve([row(1, { site: site(1) })], null, () => json({ results: [{ workspaceId: id(1), status: "failed", message: "We couldn't find your verification tag or Strelva script on the live page yet." }] })));
    await click(button(node, "Check all lines"));
    expect(node.textContent).toContain("Checked 0 of 1. 1 did not go through:");
    expect(node.textContent).toContain("Client 1: We couldn't find your verification tag");
    expect(node.querySelector('[role="status"]')).toBeNull();
  });
  it("shows more clients from the cursor", async () => {
    const requests: string[] = [];
    const { node } = await mount((url, init) => { requests.push(url); return serve(url.includes("afterName") ? [row(2)] : [row(1)], url.includes("afterName") ? null : { name: "Client 1", id: id(1) })(url, init); });
    expect(node.textContent).not.toContain("Client 2");
    await click(button(node, "Show more clients"));
    expect(requests.some(url => url.includes("afterName=Client+1"))).toBe(true);
    expect(node.textContent).toContain("Client 2");
    expect(button(node, "Show more clients")).toBeUndefined();
  });
  it("renders nothing while keep your site is off", async () => {
    const { node } = await mount(() => json({ error: "Not available." }, 404));
    expect(node.textContent).toBe("");
  });
  it("says so when the list cannot be loaded", async () => {
    const { node } = await mount(() => json({ error: "x" }, 503));
    expect(node.textContent).toContain("The client websites could not be loaded. Nothing on any site changed.");
  });
});
