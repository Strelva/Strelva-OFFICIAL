// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AskStrelva } from "@/experience/ask/AskStrelva";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => { await cleanup?.(); cleanup = undefined; vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("reopens the saved answer's creation action with no original words in its URL", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const scrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
  const workspaceId = "11111111-1111-4111-8111-111111111111";
  const conversationId = "22222222-2222-4222-8222-222222222222";
  const messageId = "33333333-3333-4333-8333-333333333333";
  const href = `/workspace/business/new/website?${new URLSearchParams({ workspaceId, conversationId, messageId })}`;
  const request = vi.fn<typeof fetch>(async input => {
    const url = new URL(String(input), "https://strelva.test");
    return Response.json(url.searchParams.has("conversationId")
      ? { conversation: { id: conversationId, systemId: null, mine: true, messages: [
        { id: messageId, role: "user", content: "Prepare a website with our private opening plan.", result: null },
        { id: "reply", role: "assistant", content: "This ask is saved.", result: { kind: "answer", items: [], creationAction: { kind: "website", label: "Prepare a website", href } } },
      ] } }
      : { conversations: [{ id: conversationId, systemId: null, mine: true, title: "Our new website", messageCount: 2, updatedAt: "2026-10-12T12:00:00Z" }] });
  });
  const node = document.createElement("div"); document.body.append(node); const root = createRoot(node);
  cleanup = async () => { await act(async () => root.unmount()); node.remove(); if (scrollTo) Object.defineProperty(HTMLElement.prototype, "scrollTo", scrollTo); else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo"); };
  await act(async () => root.render(<AskStrelva workspaceId={workspaceId} businessName="Juniper" request={request} />));
  await act(async () => [...node.querySelectorAll("button")].find(button => button.textContent === "Earlier conversations")!.click());
  await act(async () => [...node.querySelectorAll("button")].find(button => button.textContent === "Our new website")!.click());
  const action = [...node.querySelectorAll("a")].find(link => link.textContent === "Prepare a website")!;
  expect(action.getAttribute("href")).toBe(href);
  expect(action.getAttribute("href")).not.toContain("private");
  expect(node.textContent).toContain("our private opening plan");
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls.every(([, options]) => !options?.method)).toBe(true);
});
