// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { EmailConfirmPreview, EmailPreview } from "@/experience/workspace/preview/EmailPreview";
import type { EmailConfirmState } from "@/experience/workspace/preview/email-fixture";
let root: Root;
let container: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); vi.unstubAllGlobals(); });
async function mount(initialState: EmailConfirmState, context: "urgent" | "urgent-alt" | "inquiry" = "urgent") {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(createElement(EmailConfirmPreview, { initialState, context })));
}
const button = (label: string) => [...container.querySelectorAll("button")].find(b => b.textContent === label);
it("opening never sends; explicit confirmation changes only fictional state, and reload restores confirm", async () => {
  const request = vi.fn(); vi.stubGlobal("fetch", request);
  await mount("confirm");
  expect(container.textContent).toContain("Opening this link did nothing yet");
  expect(container.textContent).not.toContain("Accepted by the mail server"); expect(request).not.toHaveBeenCalled();
  await act(async () => button("Send reply")!.click());
  expect(container.textContent).toContain("Accepted by the mail server"); expect(request).not.toHaveBeenCalled();
  expect(button("Send reply")).toBeUndefined();
  await act(async () => root.unmount());
  container.remove();
  await mount("confirm");
  expect(button("Send reply")).toBeDefined(); expect(request).not.toHaveBeenCalled();
});
it.each(["handled", "expired", "changed", "permission", "error", "unverified"] as const)("%s has no send control", async state => {
  await mount(state); expect(button("Send reply")).toBeUndefined(); expect(container.textContent).toContain("Fictional preview");
});
it("not yet requires a second explicit confirmation", async () => {
  await mount("confirm"); await act(async () => button("Not yet")!.click());
  expect(container.textContent).toContain("Leave this reply unsent?");
  expect(button("Confirm not yet")).toBeDefined(); expect(container.textContent).not.toContain("Accepted by the mail server");
  await act(async () => button("Confirm not yet")!.click()); expect(container.textContent).toContain("No open decisions");
});

it("canceling an edit restores the reply that was being reviewed", async () => {
  await mount("confirm");
  await act(async () => button("Edit in Strelva")!.click());
  const input = container.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "Changed wording");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(input.value).toBe("Changed wording");
  await act(async () => button("Cancel editing")!.click());
  expect(container.textContent).not.toContain("Changed wording");
  expect(container.textContent).toContain("Hi Dana, yes, Sheri mediates");
});
it("the alternative urgent email opens Dana Ruiz, and the handled inquiry opens Priya without a send control", async () => {
  await mount("confirm", "urgent-alt");
  expect(container.textContent).toContain("Send this reply to Dana Ruiz?");
  expect(container.textContent).not.toContain("Dana Reyes");
  await act(async () => root.unmount()); container.remove();
  await mount("confirm", "inquiry");
  expect(container.textContent).toContain("Priya Shah");
  expect(container.textContent).not.toContain("Dana Reyes");
  expect(button("Send reply")).toBeUndefined();
});

it("switching a preview link resets local result state and keeps the new person’s draft", async () => {
  await mount("confirm");
  const props = { confirm: true, state: "confirm" as const, mode: "light" as const };
  await act(async () => root.render(createElement(EmailPreview, { ...props, context: "urgent" })));
  await act(async () => button("Send reply")!.click());
  expect(container.textContent).toContain("Sent to Dana Reyes");
  await act(async () => root.render(createElement(EmailPreview, { ...props, context: "urgent-alt" })));
  expect(container.textContent).toContain("Send this reply to Dana Ruiz?");
  expect(container.textContent).toContain("Hi Dana, thank you for writing");
  expect(container.textContent).not.toContain("Sent to Dana Reyes");
  expect(button("Send reply")).toBeDefined();
});
