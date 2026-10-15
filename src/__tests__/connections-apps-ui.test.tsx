// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { PackageCatalog } from "@/experience/systems/PackageCatalog";
import { bundlePreviewRequest } from "@/experience/systems/BundlePackagePreview";

const workspaceId = "bb000000-0000-4000-8000-000000000011";
let root: Root | undefined;
let host: HTMLDivElement;
async function mount(state = "ready", request = bundlePreviewRequest(state)) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(createElement(PackageCatalog, { workspaceId, canInstall: true, requestOverride: request })));
}
afterEach(async () => { if (root) await act(async () => root!.unmount()); host?.remove(); root = undefined; vi.unstubAllGlobals(); });
async function filter(provider: string) {
  await act(async () => { const select = host.querySelector<HTMLSelectElement>('[aria-label="Works with"]')!; select.value = provider; select.dispatchEvent(new Event("change", { bubbles: true })); });
}
it("filters Apps by declared connections without turning providers into Apps", async () => {
  await mount();
  await filter("resend");
  expect(host.querySelectorAll("article")).toHaveLength(1);
  expect(host.querySelector("article")!.textContent).toContain("Whose account: Strelva");
  expect(host.querySelector("article")!.textContent).toContain("Connected");
  await filter("highlevel");
  expect(host.querySelectorAll("article")).toHaveLength(0);
  expect(host.textContent).toContain("No Apps work with HighLevel yet");
  await filter("");
  expect(host.querySelectorAll("article")).toHaveLength(1);
});
it.each([
  ["unknown", "Reconnect to record whose account this is", "Whose account: Unknown"],
  ["coming-soon", "Email sending is coming soon", "Coming soon"],
  ["ineligible", "Email sending is coming soon", "Coming soon"],
  ["source-error", "This provider could not be checked", "Could not check"],
  ["missing", "Connect Email sending to confirm access", "Whose account: Not connected"],
  ["permission", "You do not have permission to read", "Not checked"],
  ["connections-error", "Connections could not be checked", "Not checked"],
])("shows honest Needs evidence for %s", async (state, detail, status) => {
  const request = vi.fn(bundlePreviewRequest(state)); await mount(state, request);
  const needs = host.querySelector('[aria-label="Connections this App needs"]')!;
  expect(host.textContent).toContain(detail);
  expect(needs.textContent).toContain(status);
  expect(needs.textContent).not.toContain("Connected");
  expect(request.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
});
it("shows loading as unconfirmed ownership and ignores a response for another workspace", async () => {
  let resolve!: (response: Response) => void;
  const delegate = bundlePreviewRequest("ready");
  const request: typeof fetch = async (input, init) => String(input).startsWith("/api/workspace/connections") ? new Promise(done => { resolve = done; }) : delegate(input, init);
  await mount("ready", request);
  expect(host.textContent).toContain("Checking this business’s Connections");
  expect(host.textContent).toContain("Whose account: Not checked");
  const response = await bundlePreviewRequest("ready")("/api/workspace/connections");
  const body = await response.json(); body.connections[0].workspaceId = "bb000000-0000-4000-8000-000000000012";
  await act(async () => resolve(Response.json(body)));
  expect(host.textContent).toContain("Connections could not be checked");
  expect(host.textContent).not.toContain("Whose account: Strelva");
});
it("retries a connection read without installing anything", async () => {
  let failed = true;
  const delegate = bundlePreviewRequest("ready");
  const request = vi.fn<typeof fetch>(async (input, init) => String(input).startsWith("/api/workspace/connections") && failed ? Response.json({}, { status: 503 }) : delegate(input, init));
  await mount("ready", request); failed = false;
  await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "Retry Connections")!.click());
  expect(host.textContent).toContain("Whose account: Strelva");
  expect(request.mock.calls.filter(([input]) => String(input).startsWith("/api/workspace/connections"))).toHaveLength(2);
  expect(request.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
});

it("uses explicit provider eligibility before the first account is connected", async () => {
  const delegate = bundlePreviewRequest("ready");
  const request: typeof fetch = async (input, init) => String(input).startsWith("/api/workspace/connections")
    ? Response.json({ connections: [], sourceErrors: [], providerEligibility: { resend: { eligible: false, reason: "not_configured", message: "Email sending is coming soon." } } }) : delegate(input, init);
  await mount("ready", request);
  const needs = host.querySelector('[aria-label="Connections this App needs"]')!;
  expect(needs.textContent).toContain("Coming soon");
  expect(needs.textContent).toContain("Email sending is coming soon.");
  expect(needs.textContent).not.toContain("Connect Email sending to confirm access");
});
