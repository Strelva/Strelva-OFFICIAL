// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StHead, StHold, StPill, StTextButton } from "@/components/ui/strelva/Kit";

let node: HTMLDivElement;
let root: Root;
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
  frames = new Map(); nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); });
function key(key: string, ctrlKey = false, repeat = false) {
  node.querySelector("button")!.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey, repeat, bubbles: true, cancelable: true }));
}
it("preserves focus destinations and external link attributes", async () => {
  const heading = createRef<HTMLHeadingElement>(), pill = createRef<HTMLButtonElement>(), text = createRef<HTMLButtonElement>();
  await act(async () => root.render(<><StHead title="Website" headingRef={heading} /><StPill ref={pill}>Reload</StPill><StTextButton ref={text}>Check</StTextButton><StTextButton href="https://example.test" target="_blank" rel="noreferrer">Visit site</StTextButton></>));
  heading.current!.focus(); expect(document.activeElement).toBe(heading.current);
  pill.current!.focus(); expect(document.activeElement).toBe(pill.current);
  text.current!.focus(); expect(document.activeElement).toBe(text.current);
  expect(node.querySelector("a")?.target).toBe("_blank"); expect(node.querySelector("a")?.rel).toBe("noreferrer");
});
it("cancels a pending acceptance when permission disables the control", async () => {
  const accept = vi.fn();
  await act(async () => root.render(<StHold label="Publish" onAccept={accept} />));
  await act(async () => key(" ")); const callback = [...frames.values()][0]!;
  await act(async () => root.render(<StHold label="Publish" onAccept={accept} disabled />));
  await act(async () => callback(performance.now() + 1000)); expect(accept).not.toHaveBeenCalled(); expect(frames.size).toBe(0);
});
it("the shortcut cancels a concurrent hold and ignores held-key repeats", async () => {
  const accept = vi.fn(); await act(async () => root.render(<StHold label="Publish" onAccept={accept} />));
  await act(async () => key(" ")); expect(frames.size).toBe(1);
  await act(async () => { key("Enter", true); key("Enter", true, true); });
  expect(accept).toHaveBeenCalledTimes(1); expect(frames.size).toBe(0);
  expect(node.querySelector("button")?.getAttribute("aria-label")).toBe("Publish");
});
it("leaving the focused control cancels keyboard acceptance", async () => {
  const accept = vi.fn(); await act(async () => root.render(<StHold label="Publish" onAccept={accept} />));
  const button = node.querySelector("button")!; button.focus();
  await act(async () => key("Enter")); expect(frames.size).toBe(1);
  await act(async () => button.blur()); expect(frames.size).toBe(0); expect(accept).not.toHaveBeenCalled();
});
