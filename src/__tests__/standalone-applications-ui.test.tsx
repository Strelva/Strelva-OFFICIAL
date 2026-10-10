// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationUseExperience } from "@/experience/applications/ApplicationUseExperience";
import { CustomApplicationUseExperience } from "@/experience/custom-applications/CustomApplicationUseExperience";
import { L13Applications } from "@/experience/workspace/preview/L13Applications";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import type { ApplicationUseSnapshot } from "@/products/applications/client";
import { CUSTOM_APPLICATION_PARENT_CSP } from "@/products/custom-applications/client";

const workId = "11111111-1111-4111-8111-111111111111";
const fields = [{ id: "name", label: "Name", type: "text" as const, required: true }];
const snapshot: ApplicationUseSnapshot = { workId, title: "Intake", releaseVersion: 1, views: [{ kind: "form", fields }, { kind: "list", fields }], records: [],
  access: { views: ["form", "list"], recordRead: "own", recordEdit: "own", recordSubmit: true, expiresAt: "2099-01-01T00:00:00Z" } };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const button = (name: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === name)!;
async function renderNative(request: typeof fetch) {
  await act(async () => root.render(createElement(WorkspaceRequestContext.Provider, { value: request }, createElement(ApplicationUseExperience, { workId }))));
}
async function fillName(value: string) {
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Name"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}

describe("standalone recipient and delegated application surfaces", () => {
  it("keeps owner Ask fixture-only and treats a typed yes as no approval", async () => {
    const externalRequest = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", externalRequest);
    await act(async () => root.render(createElement(L13Applications, { kind: "native", state: "ready", mode: "light", ownerPreview: true })));
    expect(container.textContent).toContain("This Ask Strelva bar exists only in this preview");
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Ask Strelva"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "yes"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Send"]')!.click());
    expect(container.textContent).toContain("No change is saved or approved.");
    expect(input.value).toBe("");
    expect(externalRequest).not.toHaveBeenCalled();
  });
  it("keeps the authenticated sign-in return destination and hides recipient records", async () => {
    await renderNative(vi.fn<typeof fetch>().mockResolvedValue(json({ error: "Sign in" }, 401)));
    expect(container.textContent).toContain("This application link is unavailable");
    expect(container.querySelector("a")?.getAttribute("href")).toBe(`/sign-in?next=${encodeURIComponent(`/apps/${workId}`)}`);
    expect(container.querySelector("form")).toBeNull();
  });
  it("retains record values and exact command identity after a conflict", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(json(snapshot)).mockResolvedValue(json({ error: "Changed" }, 409));
    await renderNative(request);
    await fillName("Pending intake");
    await act(async () => button("Submit record").click());
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Name"]')?.value).toBe("Pending intake");
    expect(container.textContent).toContain("Your current draft is still here");
    expect(button("Reload application")).toBeDefined();
    const first = JSON.parse(request.mock.calls[1]![1]!.body as string);
    await act(async () => button("Submit record").click());
    const second = JSON.parse(request.mock.calls[2]![1]!.body as string);
    expect(second).toEqual(first);
    expect(first).toMatchObject({ action: "submit", input: { record: { values: { name: "Pending intake" } }, releaseVersion: 1 } });
  });
  it("clears stale records when a submit races grant revocation", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ ...snapshot, records: [{ id: "saved", values: { name: "Private record" } }] }))
      .mockResolvedValueOnce(json({ error: "Revoked" }, 403)).mockResolvedValueOnce(json({ error: "Revoked" }, 403));
    await renderNative(request);
    expect(container.textContent).toContain("Private record");
    await act(async () => button("Add a record").click());
    await fillName("Pending intake");
    await act(async () => button("Submit record").click());
    expect(container.textContent).toContain("This application link is unavailable");
    expect(container.textContent).not.toContain("Private record");
    expect(container.querySelector("form")).toBeNull();
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("preserves the custom artifact sandbox, parent CSP and no-referrer policy", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(json({ workId, title: "Planner", releaseVersion: 2, artifactDigest: "reviewed-digest", html: "<h1>Planner</h1>", grant: { expiresAt: "2099-01-01T00:00:00Z" } }));
    await act(async () => root.render(createElement(WorkspaceRequestContext.Provider, { value: request }, createElement(CustomApplicationUseExperience, { workId }))));
    expect(container.querySelector("iframe")?.getAttribute("sandbox")).toBe("allow-scripts allow-forms");
    expect(container.querySelector("iframe")?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content")).toBe(CUSTOM_APPLICATION_PARENT_CSP);
    expect(container.textContent).toContain("reviewed-digest");
    expect(container.querySelector('[aria-label="Ask Strelva"]')).toBeNull();
  });
  it.each(["native", "custom", "agency"] as const)("shows %s loading and denied states without an Ask write path", async kind => {
    await act(async () => root.render(createElement(L13Applications, { key: "loading", kind, state: "loading", mode: "dark" })));
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(container.querySelector('[data-workspace-mode="dark"]')).not.toBeNull();
    await act(async () => root.render(createElement(L13Applications, { key: "denied", kind, state: "denied", mode: "light" })));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Ask Strelva"]')).toBeNull();
  });
  it("preserves current agency records when draft editing is not granted", async () => {
    await act(async () => root.render(createElement(L13Applications, { kind: "agency", state: "read-only", mode: "light" })));
    expect(container.textContent).toContain("Read-only access");
    expect(container.textContent).toContain("Commercial lease dispute, two parties");
    expect(button("Save new draft")).toBeUndefined();
    expect(button("Publish")).toBeUndefined();
    expect(container.querySelector("form")).toBeNull();
  });
  it("limits the agency draft editor to checks and revisions and keeps save input clocks", async () => {
    await act(async () => root.render(createElement(L13Applications, { kind: "agency", state: "ready", mode: "light" })));
    expect(container.textContent).toContain("Draft editing only");
    expect(button("Check proposed change")).toBeDefined();
    expect(button("Save new draft").disabled).toBe(true);
    expect(button("Publish")).toBeUndefined();
    const name = container.querySelector<HTMLInputElement>('input[id][value="Mediation intake"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "Updated mediation intake"); name.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(button("Save new draft").disabled).toBe(false);
    await act(async () => button("Save new draft").click());
    expect(container.textContent).toContain("This fictional preview does not save changes");
    expect(container.querySelector<HTMLInputElement>('input[id][value="Updated mediation intake"]')).not.toBeNull();
  });
});
