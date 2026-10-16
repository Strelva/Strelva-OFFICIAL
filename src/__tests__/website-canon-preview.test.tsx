// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WebsiteCanonPreview } from "@/experience/workspace/preview/WebsiteCanonPreview";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
});
const button = (name: string) => [...container.querySelectorAll("button")].find(item => item.textContent?.startsWith(name))!;
async function render(view: "review" | "published" | "history" | "pause" | "checks", state: "ready" | "permission" = "ready") {
  await act(async () => root.render(createElement(WebsiteCanonPreview, { initialView: view, state })));
}
// One yes (October 16): a single press accepts; there is no hold or separate confirm.
async function accept(name: string) {
  await act(async () => button(name).click());
}

it("makes it live with one press, records publication steps, then keeps undo as a new receipt", async () => {
  const request = vi.fn(); vi.stubGlobal("fetch", request);
  await render("review");
  await act(async () => button("Before").click()); expect(container.querySelector('[aria-label="Fees page 2026"]')).not.toBeNull();
  expect(container.querySelector("h1")?.textContent).toBe("Update the fees page for 2027");
  await accept("Make it live");
  expect(container.textContent).toContain("Rehearsing publication locally");
  for (let step = 0; step < 4; step++) await act(async () => vi.advanceTimersByTime(500));
  expect(container.querySelector("h1")?.textContent).toBe("The fees page is live");
  expect(container.textContent).toContain("What visitors see matches what you approved.");
  await act(async () => button("Undo").click());
  expect(container.querySelector('[aria-label="Fees page 2026"]')).not.toBeNull();
  expect(container.textContent).toContain("the original receipt is kept");
  await act(async () => button("History").click());
  expect(container.textContent).toContain("Earlier fees restored");
  expect(container.textContent).toContain("Fees added to the fees page");
  expect(container.textContent).toContain("Original receipt kept");
  expect(request).not.toHaveBeenCalled();
});

it("hides website content and consequential controls when access is unavailable", async () => {
  await render("review", "permission");
  expect(container.textContent).toContain("This business is unavailable to your account");
  expect(button("Make it live")).toBeUndefined();
  expect(container.querySelector('[aria-label="Fees page 2027"]')).toBeNull();
  expect(container.querySelector("textarea")?.disabled).toBe(true);
});

it("uses keyboard undo for the receipt, while leaving text editing alone", async () => {
  await render("published");
  const input = container.querySelector("textarea")!;
  await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true })));
  expect(container.querySelector("h1")?.textContent).toBe("The fees page is live");
  await act(async () => container.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true })));
  expect(container.querySelector("h1")?.textContent).toBe("Update the fees page for 2027");
});

it("preserves reservations when the fictional session form is paused and resumed", async () => {
  await render("pause"); await accept("Pause");
  expect(container.textContent).toContain("Mediation sessions are paused");
  expect(container.textContent).toContain("[Matter A], Wed Oct 14");
  await accept("Resume"); expect(button("Pause")).toBeDefined();
});

it("requires explicit acceptance before a fictional incident rollback", async () => {
  await render("checks");
  expect(container.textContent).toContain("No response from the site");
  await accept("Roll back"); expect(container.querySelector("h1")?.textContent).toBe("The last working copy is restored");
  expect(container.textContent).toContain("Fictional rollback receipt recorded");
});
