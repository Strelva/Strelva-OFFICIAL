// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import type { OwnerBrand } from "@/platform/infra/agency-brand";
const one = "11111111-1111-4111-8111-111111111111", two = "22222222-2222-4222-8222-222222222222";
const brand: OwnerBrand = { agencyId: two, name: "Original Studio", accentColor: "#447a4f", logoUrl: null, replyTo: null, credit: "runs_on_strelva" };
let root: Root, container: HTMLDivElement;
let calls: Array<{ resolve: (value: Response) => void; reject: (reason: unknown) => void; init?: RequestInit }>;
async function render(workspaceId = one, appBase = "") {
  await act(async () => root.render(<StrelvaShell workspaceId={workspaceId} workspaceName="Harbor Dental" appBase={appBase} signOut={null}>Work</StrelvaShell>));
}
async function resolve(index: number, body: unknown, status = 200) {
  await act(async () => calls[index]!.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })));
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  calls = [];
  vi.stubGlobal("fetch", (_url: unknown, init?: RequestInit) => new Promise<Response>((resolve, reject) => calls.push({ resolve, reject, init })));
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
describe("workspace brand reads", () => {
  it.each([403, 503])("keeps a failed %s lookup neutral with the business still named", async status => {
    await render(); await resolve(0, { error: "Unavailable" }, status);
    expect(container.textContent).toContain("Harbor Dental");
    expect(container.textContent).not.toContain("Runs on Strelva");
    expect(container.querySelector("aside")?.innerHTML).not.toContain(">Strelva<");
  });
  it("clears another workspace's brand and ignores its late response", async () => {
    await render(one); await render(two);
    expect(calls[0]!.init?.signal?.aborted).toBe(true);
    await resolve(1, { brand: { ...brand, name: "Current Studio" } }); await resolve(0, { brand });
    expect(container.textContent).toContain("Current Studio"); expect(container.textContent).not.toContain("Original Studio");
  });
  it("does not carry a prior origin's brand when the same workspace changes presentation origin", async () => {
    await render(); await resolve(0, { brand });
    expect(container.textContent).toContain("Original Studio");
    await render(one, "/another-origin");
    expect(container.textContent).not.toContain("Original Studio");
    await act(async () => calls[1]!.reject(new Error("Offline")));
    expect(container.textContent).not.toContain("Runs on Strelva");
  });
});
