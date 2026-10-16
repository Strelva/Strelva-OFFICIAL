// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StHead, StPill, StTextButton } from "@/components/ui/strelva/Kit";

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
it("preserves focus destinations and external link attributes", async () => {
  const heading = createRef<HTMLHeadingElement>(), pill = createRef<HTMLButtonElement>(), text = createRef<HTMLButtonElement>();
  await act(async () => root.render(<><StHead title="Website" headingRef={heading} /><StPill ref={pill}>Reload</StPill><StTextButton ref={text}>Check</StTextButton><StTextButton href="https://example.test" target="_blank" rel="noreferrer">Visit site</StTextButton></>));
  heading.current!.focus(); expect(document.activeElement).toBe(heading.current);
  pill.current!.focus(); expect(document.activeElement).toBe(pill.current);
  text.current!.focus(); expect(document.activeElement).toBe(text.current);
  expect(node.querySelector("a")?.target).toBe("_blank"); expect(node.querySelector("a")?.rel).toBe("noreferrer");
});
