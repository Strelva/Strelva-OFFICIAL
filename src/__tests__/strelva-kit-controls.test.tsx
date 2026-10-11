// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { StSegmented } from "@/components/ui/strelva/Kit";

it("arrow keys skip forbidden choices and keep focus with the selected route", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container);
  const change = vi.fn();
  try {
    await act(async () => root.render(createElement(StSegmented, { value: "reviews", options: [{ value: "handle", label: "Handles" }, { value: "reviews", label: "Reviews" }, { value: "ask", label: "Ask" }], disabledValues: ["handle"], disabledReason: "Looser than allowed", label: "Who decides", onChange: change })));
    const [forbidden, current, next] = container.querySelectorAll("button");
    if (!forbidden || !current || !next) throw new Error("Expected all three policy choices");
    expect(forbidden.disabled).toBe(true);
    expect(forbidden.title).toBe("Looser than allowed");
    expect(current.tabIndex).toBe(0);
    expect(next.tabIndex).toBe(-1);
    await act(async () => { current.focus(); current.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })); });
    expect(change).toHaveBeenCalledWith("ask");
    expect(document.activeElement).toBe(next);
    await act(async () => next.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })));
    expect(change).toHaveBeenLastCalledWith("reviews");
    expect(document.activeElement).toBe(current);
  } finally { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
});
