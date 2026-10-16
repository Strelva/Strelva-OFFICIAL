// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { StHold } from "@/components/ui/strelva/Kit";

let node: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); });

// October 16: one yes gesture product-wide. StHold is a deprecated wrapper around XaYes.
it("is one click, with the Hold to prefix dropped and the current callback", async () => {
  const old = vi.fn(), current = vi.fn();
  await act(async () => root.render(<StHold label="Hold to make it live" aria-label="Hold to make it live: Fees" onAccept={old} />));
  const button = node.querySelector("button")!;
  expect(button.textContent).toContain("Make it live");
  expect(button.textContent).not.toContain("Hold");
  expect(button.getAttribute("aria-label")).toBe("Make it live: Fees");
  await act(async () => root.render(<StHold label="Hold to make it live" onAccept={current} />));
  await act(async () => node.querySelector("button")!.click());
  expect(old).not.toHaveBeenCalled(); expect(current).toHaveBeenCalledTimes(1);
  // The pill comes back ready rather than staying pressed.
  expect(node.querySelector("button")!.disabled).toBe(false);
});

it("does nothing while disabled", async () => {
  const accept = vi.fn();
  await act(async () => root.render(<StHold label="Hold to confirm" onAccept={accept} disabled />));
  await act(async () => node.querySelector("button")!.click());
  expect(accept).not.toHaveBeenCalled();
  expect(node.querySelector("button")!.disabled).toBe(true);
});

it("press-and-hold is gone from the kit", () => {
  const source = readFileSync("src/components/ui/strelva/Kit.tsx", "utf8");
  expect(source).not.toMatch(/onPointerDown/);
  expect(source).toMatch(/<XaYes/);
});
