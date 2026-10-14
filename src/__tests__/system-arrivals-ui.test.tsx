// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BusinessArrivals } from "@/experience/systems/BusinessArrivals";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
const workspaceId = "61000000-0000-4000-8000-000000000003";
const otherId = "61000000-0000-4000-8000-000000000004";
let root: ReturnType<typeof createRoot>;
let node: HTMLDivElement;
const payload = (id = workspaceId) => ({ workspaceId: id, readAt: "2026-10-14T12:00:00Z", sources: ["bookings", "inquiries"], unavailable: [], items: [{ id: "one", kind: "booking", title: "Consultation", detail: "Confirmed", href: `/workspace/bookings?workspaceId=${id}` }] });
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); node = document.createElement("div"); document.body.appendChild(node); root = createRoot(node); });
afterEach(async () => { await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
const render = (request: typeof fetch, id = workspaceId) => act(async () => root.render(createElement(WorkspaceRequestContext.Provider, { value: request }, createElement(BusinessArrivals, { workspaceId: id }))));
it("renders recorded arrivals with scoped links and refreshes on focus", async () => {
  const request = vi.fn().mockResolvedValue(Response.json(payload()));
  await render(request);
  expect(node.textContent).toContain("Consultation");
  expect(node.querySelector('a')?.getAttribute("href")).toContain(workspaceId);
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(request).toHaveBeenCalledTimes(2);
});
it("distinguishes incomplete reads from an empty inbox and offers retry", async () => {
  const request = vi.fn().mockResolvedValueOnce(Response.json({ ...payload(), items: [], unavailable: ["inquiries"] }))
    .mockResolvedValueOnce(Response.json({ ...payload(), items: [] }));
  await render(request);
  expect(node.textContent).toContain("full count is unknown");
  expect(node.textContent).not.toContain("No recent inquiries");
  await act(async () => node.querySelector("button")!.click());
  expect(node.textContent).toContain("No recent inquiries or upcoming bookings are recorded");
});
it("hides release-off and permission failures without exposing records", async () => {
  for (const status of [401, 403, 503]) {
    await render(vi.fn().mockResolvedValue(Response.json({ code: "not_released" }, { status })));
    expect(node.textContent).toBe("");
  }
});
it("never displays the previous business during a switch or a late response", async () => {
  let finish: ((value: Response) => void) | undefined;
  const request = vi.fn().mockResolvedValueOnce(Response.json(payload())).mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
  await render(request);
  expect(node.textContent).toContain("Consultation");
  await render(request, otherId);
  expect(node.textContent).not.toContain("Consultation");
  await act(async () => finish!(Response.json(payload())));
  expect(node.textContent).not.toContain("Consultation");
  expect(node.textContent).toContain("could not be checked");
});
it("shows a recoverable error on transport failure", async () => {
  await render(vi.fn().mockRejectedValue(new Error("offline")));
  expect(node.textContent).toContain("Customer activity could not be checked");
  expect(node.querySelector("button")?.textContent).toBe("Check again");
});

it("does not mistake a storage outage for a disabled release", async () => {
  await render(vi.fn().mockResolvedValue(Response.json({ error: "Read failed" }, { status: 503 })));
  expect(node.textContent).toContain("Customer activity could not be checked");
});
it("ignores a superseded release response whose JSON arrives after a successful refresh", async () => {
  let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
  const delayed = new Response(new ReadableStream<Uint8Array>({ start(controller) { stream = controller; } }), { status: 503 });
  const request = vi.fn().mockResolvedValueOnce(delayed).mockResolvedValueOnce(Response.json(payload()));
  await render(request);
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(node.textContent).toContain("Consultation");
  await act(async () => { stream!.enqueue(new TextEncoder().encode(JSON.stringify({ code: "not_released" }))); stream!.close(); });
  expect(node.textContent).toContain("Consultation");
});

it("does not claim to have checked inquiries when that destination is still dark", async () => {
  await render(vi.fn().mockResolvedValue(Response.json({ ...payload(), sources: ["bookings"], items: [] })));
  expect(node.textContent).toContain("No upcoming bookings are recorded");
  expect(node.textContent).not.toMatch(/recent inquiries/i);
  expect([...node.querySelectorAll("a")].some(link => link.textContent === "Inquiries")).toBe(false);
});
