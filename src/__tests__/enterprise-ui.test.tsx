// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Units } from "@/experience/enterprise/Units";
import { EnterprisePreview } from "@/experience/workspace/preview/EnterprisePreview";

vi.mock("@/experience/app-frame/StrelvaShell", () => ({ StrelvaShell: ({ children, notice }: { children: ReactNode; notice: ReactNode }) => createElement("main", null, notice, children) }));
const ORGANIZATION = "27500000-0000-4000-8000-000000000041";
const BUSINESS = "27500000-0000-4000-8000-000000000042";
const UNIT = "27500000-0000-4000-8000-000000000043";
const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
async function render(element: ReturnType<typeof createElement>) { const node = document.createElement("div"); document.body.append(node); const root = createRoot(node); roots.push(root); await act(async () => root.render(element)); return node; }
const view = { organizationId: ORGANIZATION, inaccessibleUnits: 1, units: [{ id: UNIT, organizationId: ORGANIZATION, businessId: BUSINESS, parentId: null, name: "Elmwood", kind: "location", status: "active", revision: 3, versionIds: [] }] };
it("keeps live hierarchy data and archived command revision without inventing clinic health", async () => {
  const request = vi.fn(async (_input: unknown, options?: RequestInit) => Response.json(options?.method === "POST" ? { ok: true } : view));
  vi.stubGlobal("fetch", request);
  const node = await render(createElement(Units, { organizationId: ORGANIZATION, businesses: [{ id: BUSINESS, name: "Clinic", role: "owner" }], canManage: true }));
  expect(node.textContent).toContain("You can't see one location. Ask the owner to add you.");
  expect(node.textContent).not.toMatch(/Structure grants no access|The organization itself/);
  expect(node.textContent).not.toContain("All live");
  await act(async () => ([...node.querySelectorAll("button")].find(button => button.textContent?.startsWith("Archive"))!).click());
  const post = request.mock.calls.find(call => call[1]?.method === "POST");
  expect(JSON.parse(String(post?.[1]?.body))).toEqual({ action: "archive", organizationId: ORGANIZATION, id: UNIT, expectedRevision: 3 });
});
it("shows permission and no hierarchy controls when live read is denied", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Denied" }, { status: 403 })));
  const node = await render(createElement(Units, { organizationId: ORGANIZATION, businesses: [], canManage: false }));
  expect(node.querySelector('[role="alert"]')).not.toBeNull();
  expect(node.textContent).toContain("The owner changes locations.");
  expect(node.querySelector("form")).toBeNull();
});
it("push fixture requires the hold control and retains local intake differences", async () => {
  const request = vi.fn(); vi.stubGlobal("fetch", request);
  const node = await render(createElement(EnterprisePreview, { view: "push", state: "ready" }));
  expect(node.textContent).toContain("Has a local question 7");
  const hold = [...node.querySelectorAll("button")].find(button => button.textContent?.includes("Send to 5"))!;
  await act(async () => hold.click());
  expect(node.querySelector('[role="status"]')?.textContent).toContain("No manager was contacted and no clinic changed");
  expect(request).not.toHaveBeenCalled();
});
it("quarterly fixture reviews one exact person with no live write", async () => {
  const request = vi.fn(); vi.stubGlobal("fetch", request);
  const node = await render(createElement(EnterprisePreview, { view: "access-review", state: "ready" }));
  await act(async () => (node.querySelector('[aria-label="Remove Pat O."]') as HTMLButtonElement).click());
  expect(node.querySelector("table")?.textContent).not.toContain("Pat O.");
  expect(node.querySelector("table")?.textContent).toContain("Sam W.");
  expect(request).not.toHaveBeenCalled();
});
it("fixture failure and empty states never show a send control", async () => {
  for (const state of ["loading", "empty", "error", "permission"]) {
    const node = await render(createElement(EnterprisePreview, { view: "push", state }));
    expect([...node.querySelectorAll("button")].some(button => button.textContent?.includes("Hold to send"))).toBe(false);
    if (state === "error" || state === "permission") expect(node.querySelector('[role="alert"]')).not.toBeNull();
  }
});
