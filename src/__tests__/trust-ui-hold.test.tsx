// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { StHold } from "@/components/ui/strelva/Kit";

let node: HTMLDivElement;
let root: Root;
let tick: FrameRequestCallback;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { tick = callback; return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); });

it("click-only activation requires a separate confirmation and preserves the current callback", async () => {
  const old = vi.fn(), current = vi.fn();
  await act(async () => root.render(<StHold label="Hold to make it live" aria-label="Make it live: Fees" onAccept={old} />));
  await act(async () => node.querySelector("button")!.click());
  expect(old).not.toHaveBeenCalled();
  expect(node.textContent).toContain("Confirm make it live?");
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Confirm: Make it live: Fees");
  await act(async () => root.render(<StHold label="Hold to make it live" aria-label="Make it live: Fees" onAccept={current} />));
  await act(async () => node.querySelector("button")!.click());
  expect(old).not.toHaveBeenCalled(); expect(current).toHaveBeenCalledTimes(1);
});

it("cancels click confirmation without acting and closes when access is revoked", async () => {
  const accept = vi.fn();
  await act(async () => root.render(<StHold label="Hold to confirm" onAccept={accept} />));
  await act(async () => node.querySelector("button")!.click());
  await act(async () => node.querySelectorAll("button")[1]!.click());
  expect(node.textContent).not.toContain("Confirm confirm?");
  expect(document.activeElement).toBe(node.querySelector("button"));
  await act(async () => node.querySelector("button")!.click());
  const staleConfirm = node.querySelector("button")!;
  await act(async () => root.render(<StHold label="Hold to confirm" onAccept={accept} disabled />));
  await act(async () => staleConfirm.click());
  expect(accept).not.toHaveBeenCalled();
  expect(node.querySelector("button")!.disabled).toBe(true);
});

it("a completed hold consumes its follow-up click without a second acceptance", async () => {
  const accept = vi.fn();
  await act(async () => root.render(<StHold label="Hold to make it live" onAccept={accept} />));
  const button = node.querySelector("button")!;
  await act(async () => button.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true })));
  await act(async () => tick(performance.now() + 900));
  await act(async () => button.click());
  expect(accept).toHaveBeenCalledTimes(1);
  expect(node.querySelector('[role="group"]')).toBeNull();
});

it("reduced-motion progress is static while the same timed hold remains", () => {
  const css = readFileSync("src/components/ui/strelva/kit.module.css", "utf8");
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.holdFill \{ transform: none; transition: none; opacity: 0; \}\s*\.hold\[data-holding="true"\] \.holdFill \{ opacity: 1; \}/);
});
