// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { WebsiteChangeAsk } from "@/experience/systems/WebsiteChangeAsk";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";

const roots: Root[] = [];
const requestId = "33333333-3333-4333-8333-333333333333";
function mount(request: typeof fetch) {
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container); roots.push(root);
  const filed = vi.fn(), closed = vi.fn();
  act(() => root.render(createElement(WorkspaceRequestContext.Provider, { value: request }, createElement(WebsiteChangeAsk, { workspaceId: "business", systemId: "website", siteName: "Fictional bakery", onFiled: filed, onClose: closed }))));
  return { container, filed, closed };
}
function write(container: HTMLElement, words: string) {
  const input = container.querySelector("textarea")!;
  act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, words); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function submit(container: HTMLElement) { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
afterEach(() => { act(() => roots.splice(0).forEach(root => root.unmount())); document.body.innerHTML = ""; });

it("allows exactly one pending dispatch even for submissions in the same React batch", async () => {
  let resolve!: (response: Response) => void;
  const request = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>(done => { resolve = done; }));
  const { container, filed } = mount(request); write(container, "Change the opening hours.");
  act(() => { const form = container.querySelector("form")!; form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(request).toHaveBeenCalledTimes(1); expect(container.querySelector("textarea")!.value).toBe("Change the opening hours.");
  await act(async () => resolve(Response.json({ requestId }, { status: 201 })));
  expect(filed).toHaveBeenCalledTimes(1); expect(filed).toHaveBeenCalledWith(requestId);
});

it.each(["network", "malformed", "readback", "denial"])("preserves an unconfirmed %s attempt and explicitly checks the identical body", async reason => {
  const request = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
    if (request.mock.calls.length === 1) {
      if (reason === "network") throw new Error("Connection lost after commit");
      if (reason === "malformed") return Response.json({ requestId: { unexpected: true } }, { status: 201 });
      return Response.json({ error: "Request list could not be read." }, { status: reason === "denial" ? 403 : 503 });
    }
    return Response.json({ requestId }, { status: 201 });
  });
  const { container, filed } = mount(request); write(container, "Change the opening hours."); await submit(container);
  expect(filed).not.toHaveBeenCalled(); expect(request).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("couldn't be confirmed");
  expect(container.textContent).not.toContain("Nothing was sent");
  expect(container.querySelector("textarea")!.disabled).toBe(true);
  write(container, "Different words must not change an unconfirmed attempt."); await submit(container);
  expect(request).toHaveBeenCalledTimes(2); expect(request.mock.calls[1]?.[1]?.body).toBe(request.mock.calls[0]?.[1]?.body);
  expect(filed).toHaveBeenCalledWith(requestId); expect(container.querySelector("textarea")!.value).toBe("");
});

it("keeps an originally unconfirmed attempt locked after a retry is denied", async () => {
  const request = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json({ error: "Try again after signing in." }, { status: request.mock.calls.length === 1 ? 503 : 401 }));
  const { container } = mount(request); write(container, "Change the opening hours."); await submit(container); await submit(container);
  expect(container.querySelector("textarea")!.disabled).toBe(true); expect(container.textContent).toContain("Check this request");
  expect(request.mock.calls[1]?.[1]?.body).toBe(request.mock.calls[0]?.[1]?.body);
});

it("allows correction after an initial route validation refusal with a fresh key", async () => {
  const request = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => request.mock.calls.length === 1 ? Response.json({ error: "Description is invalid." }, { status: 400 }) : Response.json({ requestId }, { status: 201 }));
  const { container, filed } = mount(request); write(container, "First words"); await submit(container);
  expect(container.querySelector("textarea")!.disabled).toBe(false); expect(container.querySelector("textarea")!.value).toBe("First words");
  write(container, "Corrected words"); await submit(container);
  const first = JSON.parse(String(request.mock.calls[0]?.[1]?.body)), next = JSON.parse(String(request.mock.calls[1]?.[1]?.body));
  expect(next.request).toBe("Corrected words"); expect(next.idempotencyKey).not.toBe(first.idempotencyKey); expect(filed).toHaveBeenCalledWith(requestId);
});
