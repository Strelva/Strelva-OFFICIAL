// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { XaButton, XaComposer, XaEmpty, XaSegmented, XaStatus, XaSystemTile, XaUndo, XaYes, xaSystemKind } from "@/components/ui/strelva/Xa";

const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });

async function mount(element: ReactElement) {
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(element));
  return { node, render: (next: ReactElement) => act(async () => root.render(next)) };
}

describe("XA kit", () => {
  it("marks exactly the primary pill and keeps buttons from deciding authority", () => {
    const html = renderToStaticMarkup(createElement("div", null, createElement(XaButton, { variant: "primary" }, "Put it live"), createElement(XaButton, null, "See the page"), createElement(XaButton, { variant: "quiet" }, "Not yet")));
    expect(html.match(/data-xa-primary/g)).toHaveLength(1);
    expect(html).toContain('type="button"');
  });

  it("presses the waiting yes with Command or Control and Enter, once, and only for the newest yes", async () => {
    const first = vi.fn(); const second = vi.fn();
    await mount(createElement("div", null, createElement(XaYes, { state: "waiting", onYes: first }), createElement(XaYes, { state: "waiting", onYes: second, onNotYet: vi.fn() })));
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true })); });
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Put it live");
    expect(document.body.textContent).toContain("Not yet");
  });

  it("does not answer the shortcut while blocked, and says why", async () => {
    const onYes = vi.fn();
    const { node } = await mount(createElement(XaYes, { state: "waiting", onYes, disabledReason: "Only Dr. Lin can put this live." }));
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true })); });
    expect(onYes).not.toHaveBeenCalled();
    expect(node.querySelector("button[data-xa-primary]")?.hasAttribute("disabled")).toBe(true);
    expect(node.textContent).toContain("Only Dr. Lin can put this live.");
  });

  it("shows the real steps while going, and Pebble with one way forward when it fails", async () => {
    const steps = [{ id: "a", label: "Closed Thu and Fri", state: "done" as const }, { id: "b", label: "Reading it back", state: "active" as const }, { id: "c", label: "Phone check", state: "pending" as const }];
    const { node, render } = await mount(createElement(XaYes, { state: "going", onYes: vi.fn(), working: { title: "Putting it live", steps } }));
    expect(node.querySelectorAll("li")).toHaveLength(2);
    expect(node.textContent).toContain("Reading it back, in progress");
    await render(createElement(XaYes, { state: "failed", onYes: vi.fn(), failure: "The booking page did not answer. Nothing changed." }));
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("Nothing changed.");
    expect(node.querySelector("img[src='/xa/pebble-avatar.webp']")).not.toBeNull();
    expect(node.textContent).toContain("Try again");
  });

  it("drains the Undo window, then reports expiry; ⌘Z presses Undo", async () => {
    const onUndo = vi.fn(); const onExpire = vi.fn();
    const { node } = await mount(<XaUndo onUndo={onUndo} onExpire={onExpire} windowMs={5000} shortcut>Live on your booking page</XaUndo>);
    const bar = node.querySelector<HTMLElement>("[aria-hidden='true'][style]")!;
    expect(bar.style.animationDuration).toBe("5000ms");
    // jsdom has no AnimationEvent, so React listens under the vendor name there.
    await act(async () => { for (const name of ["animationend", "webkitAnimationEnd"]) bar.dispatchEvent(new Event(name, { bubbles: true })); });
    expect(onExpire).toHaveBeenCalledOnce();
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true, bubbles: true })); });
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it("sends with Enter, keeps Shift+Enter for a new line, and draws no dead controls", async () => {
    const onSubmit = vi.fn();
    const { node } = await mount(createElement(XaComposer, { value: "Close Thanksgiving", onChange: vi.fn(), onSubmit, placeholder: "Ask Strelva for anything" }));
    const input = node.querySelector("textarea")!;
    await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true })); });
    expect(onSubmit).not.toHaveBeenCalled();
    await act(async () => { node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(node.querySelector('[aria-label="Add a file or a page"]')).toBeNull();
    expect(node.querySelector('[aria-label="Say it instead"]')).toBeNull();
  });

  it("carries one waiting item with whoever acted, and a scope chip", () => {
    const html = renderToStaticMarkup(createElement(XaComposer, { value: "", onChange: vi.fn(), onSubmit: vi.fn(), placeholder: "Ask Strelva for anything", scope: { label: "Harbor Dental", state: "live" }, waiting: { kicker: "Waits for you · from Maya", title: "Close online booking", from: { name: "Maya" }, action: createElement(XaButton, { size: "sm" }, "Review") } }));
    expect(html).toContain("Waits for you · from Maya");
    expect(html).toContain("Harbor Dental");
    expect(html).toContain('data-shape="card"');
  });

  it("moves the segmented choice with arrow keys", async () => {
    const onChange = vi.fn();
    const { node } = await mount(createElement(XaSegmented, { label: "Which version", value: "now", onChange, options: [{ value: "now", label: "Your page now" }, { value: "after", label: "After your yes" }] }));
    const current = node.querySelector<HTMLButtonElement>('[aria-checked="true"]')!;
    await act(async () => { current.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    expect(onChange).toHaveBeenCalledWith("after");
  });

  it("maps every System and product kind to a clay, and keeps Pebble at work in empty states", () => {
    for (const [kind, clay] of [["scheduling", "bookings"], ["inquiries", "inbox"], ["app", "form"], ["home_finder", "listing"], [undefined, "form"]] as const) expect(xaSystemKind(kind)).toBe(clay);
    expect(renderToStaticMarkup(createElement(XaSystemTile, { kind: "website" }))).toContain("/xa/system-website.webp");
    const empty = renderToStaticMarkup(createElement(XaEmpty, { pose: "waving", title: "Nothing is running yet.", job: "Pebble read harbordental.com" }));
    expect(empty).toContain("/xa/pose-waving.webp");
    expect(empty).toContain("Pebble read harbordental.com");
    expect(renderToStaticMarkup(<XaStatus kind="waits">Waits for you</XaStatus>)).toContain('data-kind="waits"');
  });

  it("uses no monospace and only ladder timings in the kit", () => {
    const css = readFileSync("src/components/ui/strelva/xa/xa.module.css", "utf8") + readFileSync("src/app/styles/workspace-xa.css", "utf8") + readFileSync("src/components/ui/strelva/kit.module.css", "utf8");
    expect(css).not.toMatch(/font(-family)?:[^;}]*(mono|Geist Mono)/i);
    expect(css).not.toMatch(/var\(--st-font-mono\)/);
    expect(css).not.toMatch(/text-transform:\s*uppercase/);
    for (const file of ["actions", "characters", "composer", "inputs", "motion", "state", "surfaces", "working", "yes"]) {
      expect(readFileSync(`src/components/ui/strelva/xa/${file}.tsx`, "utf8")).not.toMatch(/—|seamless|effortless|supercharge|unlock|AI-powered/i);
    }
  });
});
