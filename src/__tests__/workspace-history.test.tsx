// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined, prefetch: () => undefined }), usePathname: () => "/workspace", useSearchParams: () => new URLSearchParams() }));
import { WorkspaceApp } from "@/experience/workspace/WorkspaceApp";
import { createPreviewRequest } from "@/experience/workspace/preview/fixture";

const BUSINESS = "33333333-3333-4333-8333-333333333333";
const INSTALLATION = "77777777-7777-4777-8777-777777777777";
const STAFF_REQUESTS = "88888888-8888-4888-8888-888888888888";

const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  window.scrollTo = () => undefined;
  Element.prototype.scrollTo = () => undefined;
});
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); }
async function render(request: typeof fetch) {
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => { root.render(<WorkspaceApp request={request} />); });
  await settle();
  return node;
}
async function back() { await act(async () => { window.history.back(); }); await settle(); }
function button(node: HTMLElement, name: string) {
  const found = [...node.querySelectorAll("button")].find(item => item.getAttribute("aria-label") === name || item.textContent?.trim() === name);
  if (!found) throw new Error(`No button named ${name}`);
  return found;
}

describe("leaving a workspace entry never rewrites it", () => {
  it("Back from work opened in an offering returns to that offering", async () => {
    window.history.replaceState(null, "", `/workspace?workspaceId=${BUSINESS}&view=products&offering=${INSTALLATION}`);
    const node = await render(createPreviewRequest("business", { installedStaffRequest: true }));
    await act(async () => button(node, "Open Staff requests").click());
    await settle();
    const opened = new URLSearchParams(window.location.search);
    expect(opened.get("work")).toBe(STAFF_REQUESTS);
    expect(opened.get("view")).toBe("applications");
    expect(opened.has("offering")).toBe(false);

    await back();
    const returned = new URLSearchParams(window.location.search);
    expect(returned.get("view")).toBe("products");
    expect(returned.get("offering")).toBe(INSTALLATION);
  });

  it("opening a product from an offering link moves the URL off the offering, and Back returns to it", async () => {
    const preview = createPreviewRequest("business", { installedStaffRequest: true });
    // Hold the offering list in its loading state so the product rows are what the person can choose.
    const request = ((input: RequestInfo | URL, init?: RequestInit) => new URL(String(input), "https://preview.invalid").pathname === "/api/offerings" ? new Promise<Response>(() => undefined) : preview(input, init)) as typeof fetch;
    window.history.replaceState(null, "", `/workspace?workspaceId=${BUSINESS}&view=products&offering=${INSTALLATION}`);
    const node = await render(request);
    await act(async () => button(node, "Documents: Start").click());
    await settle();
    expect(node.querySelector("h1")?.textContent).toBe("Documents");
    const product = new URLSearchParams(window.location.search);
    expect(product.get("view")).toBe("products");
    expect(product.has("offering")).toBe(false);

    await back();
    expect(new URLSearchParams(window.location.search).get("offering")).toBe(INSTALLATION);
  });
});
