// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AskStrelva } from "@/experience/ask/AskStrelva";

it("shows this business's server prompts and selecting one only prefills the composer", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const oldScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
  const request = vi.fn<typeof fetch>(async () => Response.json({ conversations: [], suggestions: ["Draft a clearer explanation of our Dental cleaning service."] }));
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<AskStrelva workspaceId="11111111-1111-4111-8111-111111111111" businessName="Harbor Dental" request={request} />));
    const prompt = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Dental cleaning"))!;
    expect(prompt).toBeDefined();
    await act(async () => prompt.click());
    expect(container.querySelector("textarea")?.value).toBe("Draft a clearer explanation of our Dental cleaning service.");
    expect(document.activeElement).toBe(container.querySelector("textarea"));
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]![1]?.method).toBeUndefined();
    expect(container.textContent).not.toContain("estate planning");
  } finally {
    await act(async () => root.unmount()); container.remove();
    if (oldScroll) Object.defineProperty(HTMLElement.prototype, "scrollTo", oldScroll); else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
    vi.unstubAllGlobals();
  }
});
