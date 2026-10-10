// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiVisibilityPage } from "@/products/ai-visibility/AiVisibilityPage";
import { WebsiteAuditPage } from "@/products/website-audit/WebsiteAuditPage";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function input(selector: string, value: string) {
  const field = container.querySelector<HTMLInputElement>(selector)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () => {
    container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}
describe("public audit feedback", () => {
  it("associates the AI audit's missing name error with the required field", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await act(async () => root.render(createElement(AiVisibilityPage)));
    await submit();
    const field = container.querySelector<HTMLInputElement>("#business-name")!;
    expect(field.required).toBe(true);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(field.getAttribute("aria-describedby")!)?.textContent).toContain("Enter your business name");
    expect(fetch).not.toHaveBeenCalled();
  });
  for (const kind of ["ai", "website"] as const) {
    it(`${kind} audit identifies an invalid URL and keeps the input`, async () => {
      const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
      await act(async () => root.render(kind === "ai" ? createElement(AiVisibilityPage) : createElement(WebsiteAuditPage)));
      if (kind === "ai") await input("#business-name", "Fictional Bakery");
      const selector = kind === "ai" ? "#website" : '[aria-label="Website address"]';
      await input(selector, "http://[");
      await submit();
      const field = container.querySelector<HTMLInputElement>(selector)!;
      expect(field.value).toBe("http://[");
      expect(field.getAttribute("aria-invalid")).toBe("true");
      expect(document.getElementById(field.getAttribute("aria-describedby")!)?.getAttribute("role")).toBe("alert");
      expect(fetch).not.toHaveBeenCalled();
    });
    it(`${kind} audit announces pending work and associates a server failure with the restored form`, async () => {
      let finish!: (response: Response) => void;
      vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
      await act(async () => root.render(kind === "ai" ? createElement(AiVisibilityPage) : createElement(WebsiteAuditPage)));
      if (kind === "ai") await input("#business-name", "Fictional Bakery");
      const selector = kind === "ai" ? "#website" : '[aria-label="Website address"]';
      await input(selector, "bakery.example");
      await submit();
      expect(container.querySelector('[role="status"]')?.textContent).toMatch(/Reading (your site|the website)/);
      expect(container.querySelector("form")).toBeNull();
      expect(document.activeElement?.tagName).toBe("H2");
      await act(async () => finish(new Response(JSON.stringify({ error: "Try again later." }), { status: 503 })));
      const field = container.querySelector<HTMLInputElement>(selector)!;
      expect(field.value).toBe("bakery.example");
      expect(field.hasAttribute("aria-invalid")).toBe(false);
      expect(document.activeElement).toBe(kind === "ai" ? container.querySelector("#business-name") : field);
      expect(document.getElementById(container.querySelector("form")!.getAttribute("aria-describedby")!)?.textContent).toBe("Try again later.");
    });
  }
});
