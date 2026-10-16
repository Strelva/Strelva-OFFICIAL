// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhotoLibrary } from "@/components/dashboard/PhotoLibrary";
import { BrandKitPanel } from "@/components/dashboard/BrandKitPanel";
import { CollectionsManager } from "@/components/dashboard/CollectionsManager";

const context = vi.hoisted(() => ({ readOnly: false, dashboardHref: (path: string) => `/client/example${path}` }));
vi.mock("@/components/dashboard/DashboardContext", () => ({ useDashboard: () => context, useDashboardOptional: () => context }));
vi.mock("@/components/dashboard/AssetPickerModal", () => ({ AssetPickerModal: () => null }));
vi.mock("@/components/dashboard/PhotoDetail", () => ({ PhotoDetail: () => null }));
const roots: Root[] = [];
async function mount(component: Parameters<Root["render"]>[0]) {
  const node = document.createElement("div"); document.body.append(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(component));
  return node;
}
function change(input: HTMLInputElement, value: string) {
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
beforeEach(() => { context.readOnly = false; vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });

describe("real website library kit consumers", () => {
  it("keeps the tenant-prefixed media read and distinguishes failure from an empty library", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ error: "Unavailable" }, { status: 503 })); vi.stubGlobal("fetch", request);
    const node = await mount(createElement(PhotoLibrary));
    expect(request).toHaveBeenCalledWith("/client/example/api/media", { credentials: "same-origin" });
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("photos could not be read");
    expect(node.textContent).not.toContain("No photos yet");
  });
  it("retains multipart image upload through the same tenant path", async () => {
    const request = vi.fn<typeof fetch>(async (_url: RequestInfo | URL, init?: RequestInit) => init?.method === "POST" ? Response.json({ id: "photo", url: "https://example.com/photo.jpg", filename: "photo.jpg", width: 100, height: 100, size: 10, createdAt: "2026-10-09T12:00:00Z" }) : Response.json({ assets: [] }));
    vi.stubGlobal("fetch", request); const node = await mount(createElement(PhotoLibrary));
    const input = node.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["image"], "photo.jpg", { type: "image/jpeg" })] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(request.mock.calls[1]?.[0]).toBe("/client/example/api/media");
    expect(request.mock.calls[1]?.[1]?.method).toBe("POST");
    expect(request.mock.calls[1]?.[1]?.body).toBeInstanceOf(FormData);
    expect(node.textContent).toContain("1 uploaded, 0 failed or skipped");
  });
  it("keeps settings blur-save and all existing keys", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ ok: true })); vi.stubGlobal("fetch", request);
    const node = await mount(createElement(BrandKitPanel, { initialSettings: { siteName: "Example", brandVoice: "Plain", customKey: "retained" } }));
    const input = node.querySelector<HTMLInputElement>("input")!; change(input, "New line");
    await act(async () => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(request).toHaveBeenCalledWith("/client/example/api/content/settings", expect.objectContaining({ method: "PUT", credentials: "same-origin", body: JSON.stringify({ siteName: "Example", brandVoice: "Plain", customKey: "retained", siteTagline: "New line" }) }));
    expect(node.querySelector('[role="status"]')?.textContent).toBe("Saved");
  });
  it("keeps collection fields and the draft save contract", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ entries: [] })); vi.stubGlobal("fetch", request);
    const node = await mount(createElement(CollectionsManager, { types: ["blog"], initialType: "blog", initialEntries: [] }));
    await act(async () => [...node.querySelectorAll("button")].find(button => button.textContent?.includes("New blog post"))!.click());
    change(node.querySelector<HTMLInputElement>("input")!, "A real article");
    await act(async () => [...node.querySelectorAll("button")].find(button => button.textContent === "Save draft")!.click());
    expect(request.mock.calls[0]?.[0]).toBe("/client/example/api/collections/blog");
    const payload = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
    expect(payload.status).toBe("draft"); expect(payload.data.title).toBe("A real article"); expect(payload.data).toHaveProperty("coverImage");
  });
  it("withholds upload and settings changes for read-only access", async () => {
    context.readOnly = true; const request = vi.fn<typeof fetch>(async () => Response.json({ assets: [] })); vi.stubGlobal("fetch", request);
    const photos = await mount(createElement(PhotoLibrary));
    expect(photos.querySelector<HTMLInputElement>('input[type="file"]')!.disabled).toBe(true);
    const settings = await mount(createElement(BrandKitPanel, { initialSettings: { siteName: "Example" } }));
    expect(settings.querySelector<HTMLInputElement>("input")!.disabled).toBe(true);
  });
});
