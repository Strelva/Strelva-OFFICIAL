// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { WebsiteConnections } from "@/experience/websites/WebsiteConnections";
import type { WebsiteRecord } from "@/products/websites/contracts";

const record: WebsiteRecord = {
  workId: "22222222-2222-4222-8222-222222222222", workspaceId: "11111111-1111-4111-8111-111111111111",
  createdAt: "2026-09-20T00:00:00Z", updatedAt: "2026-09-20T00:00:00Z",
  website: { version: 1, revision: 2, title: "Juniper", brief: { businessName: "Juniper", description: "Local bread.", primaryCallToAction: "Contact us" }, status: "draft", candidate: null, approvedCandidateRevision: null, launch: { status: "not_requested", candidateRevision: null, receipt: null, failure: null }, lastError: null, createdBy: "owner", createdAt: "2026-09-20T00:00:00Z", history: [] },
};
const options = { tenants: [
  { tenantId: "first", siteName: "First location", inquiry: [{ capabilityId: "orders", version: 1, name: "Order requests" }], booking: [] },
  { tenantId: "second", siteName: "Second location", inquiry: [{ capabilityId: "catering", version: 3, name: "Catering requests" }], booking: [] },
] };
function button(container: HTMLElement, label: string) { return Array.from(container.querySelectorAll("button")).find(item => item.textContent?.includes(label))!; }
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; });

it("requires an explicit website and form selection before updating the preview", async () => {
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => Response.json(init?.method === "POST" ? record : options));
  vi.stubGlobal("fetch", fetcher);
  const saved = vi.fn();
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  await act(async () => root.render(createElement(WebsiteConnections, { record, disabled: false, onSaved: saved })));
  expect(fetcher).not.toHaveBeenCalled();
  await act(async () => button(container, "Choose forms").click());
  const selects = container.querySelectorAll("select");
  expect(selects[0]?.value).toBe("");
  expect(button(container, "Update website preview").disabled).toBe(true);
  await act(async () => { selects[0]!.value = "second"; selects[0]!.dispatchEvent(new Event("change", { bubbles: true })); });
  const inquiry = container.querySelectorAll("select")[1]!;
  await act(async () => { inquiry.value = "catering"; inquiry.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => button(container, "Update website preview").click());
  const mutation = fetcher.mock.calls.find(([, init]) => init?.method === "POST");
  expect(JSON.parse(String(mutation?.[1]?.body))).toEqual({ expectedRevision: 2, selection: { tenantId: "second", inquiryCapabilityId: "catering" } });
  expect(saved).toHaveBeenCalledWith(record);
  act(() => root.unmount());
});

it("preserves the entered selection on a failed write and permits retry", async () => {
  let attempts = 0;
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method !== "POST") return Response.json(options);
    attempts += 1;
    return attempts === 1 ? Response.json({ error: "Connection changed. Reload available forms." }, { status: 409 }) : Response.json(record);
  });
  vi.stubGlobal("fetch", fetcher);
  const saved = vi.fn(); const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  await act(async () => root.render(createElement(WebsiteConnections, { record, disabled: false, onSaved: saved })));
  await act(async () => button(container, "Choose forms").click());
  const source = container.querySelector("select")!;
  await act(async () => { source.value = "second"; source.dispatchEvent(new Event("change", { bubbles: true })); });
  const inquiry = container.querySelectorAll("select")[1]!;
  await act(async () => { inquiry.value = "catering"; inquiry.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => button(container, "Update website preview").click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Connection changed");
  expect(inquiry.value).toBe("catering"); expect(saved).not.toHaveBeenCalled();
  await act(async () => button(container, "Update website preview").click());
  expect(saved).toHaveBeenCalledWith(record);
  act(() => root.unmount());
});

it("shows empty availability and prevents writes for read-only access", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ tenants: [] })));
  const saved = vi.fn(); const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  await act(async () => root.render(createElement(WebsiteConnections, { record, disabled: false, onSaved: saved })));
  await act(async () => button(container, "Choose forms").click());
  expect(container.textContent).toContain("No published forms are available");
  expect(button(container, "Update website preview")).toBeUndefined();
  await act(async () => root.render(createElement(WebsiteConnections, { key: "readonly", record, disabled: true, onSaved: saved })));
  expect(button(container, "Choose forms").disabled).toBe(true);
  expect(saved).not.toHaveBeenCalled();
  act(() => root.unmount());
});

it("keeps the saved website when a connection response belongs to another work item", async () => {
  const selected = { ...record, website: { ...record.website, publishedCapabilitySelection: { tenantId: "second", inquiryCapabilityId: "catering" } } };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...record, workId: "another-work" })));
  const saved = vi.fn(); const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  await act(async () => root.render(createElement(WebsiteConnections, { record: selected, disabled: false, onSaved: saved })));
  await act(async () => button(container, "Remove forms from this draft").click());
  expect(saved).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("different website");
  act(() => root.unmount());
});
