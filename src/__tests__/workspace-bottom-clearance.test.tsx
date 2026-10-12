// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { StComposerDock } from "@/components/ui/strelva/Kit";
import { OwnerDecisionPreview } from "@/experience/workspace/preview/OwnerDecisionPreview";
import { PublishingPreviewFrame } from "@/experience/workspace/preview/PublishingPreviewFrame";
import { AgencyLibraryCanonPreview } from "@/experience/workspace/preview/AgencyLibraryCanonPreview";
import { AgencyPeoplePreview } from "@/experience/workspace/preview/AgencyPeoplePreview";
import { OwnerConversationPreview } from "@/experience/workspace/preview/OwnerConversationPreview";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

afterEach(() => vi.unstubAllGlobals());

it.each([
  ["owner-decision", createElement(OwnerDecisionPreview, { state: "ready", dark: false })],
  ["publishing", <PublishingPreviewFrame key="publishing" place="Website content"><button>Make it live</button></PublishingPreviewFrame>],
  ["agency-library", createElement(AgencyLibraryCanonPreview, { surface: "library", state: "ready", mode: "light" })],
  ["agency-verification", createElement(AgencyPeoplePreview, { surface: "verification", state: "unverified" })],
  ["owner-conversation", createElement(OwnerConversationPreview, { frame: "Y2Tn3F", state: "ready" })],
] as const)("reserves space on the actual %s scroll owner", async (_page, element) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(Response.json({}))));
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ height: 176 } as DOMRect);
  try {
    await act(async () => root.render(element));
    const dock = host.querySelector("[data-st-composer-dock]")!;
    const scroll = dock.closest<HTMLElement>("[data-st-composer-clearance]")!;
    expect(scroll).not.toBeNull();
    expect(scroll.style.getPropertyValue("--st-composer-clearance")).toBe("176px");
    expect(scroll.matches(_page === "owner-conversation" ? "[data-workspace-scroll]" : "[data-frame-main]")).toBe(true);
  } finally {
    bounds.mockRestore();
    await act(async () => root.unmount());
    host.remove();
  }
});

it("reserves the dock's complete height in its nearest scroll owner and updates for wrapped content", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let resize: ResizeObserverCallback | undefined;
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { resize = callback; }
    observe = vi.fn();
    disconnect = disconnect;
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ height: 176 } as DOMRect);
  try {
    await act(async () => root.render(createElement("main", { "data-frame-main": true },
      createElement("div", { "data-workspace-scroll": true },
        createElement("button", null, "Last primary action"),
        createElement(StComposerDock, null, createElement("textarea", { "aria-label": "Ask" }))))));
    const scroll = host.querySelector<HTMLElement>("[data-workspace-scroll]")!;
    const frame = host.querySelector<HTMLElement>("[data-frame-main]")!;
    expect(scroll.style.getPropertyValue("--st-composer-clearance")).toBe("176px");
    expect(scroll.hasAttribute("data-st-composer-clearance")).toBe(true);
    expect(frame.style.getPropertyValue("--st-composer-clearance")).toBe("");
    bounds.mockReturnValue({ height: 240 } as DOMRect);
    await act(async () => resize?.([], {} as ResizeObserver));
    expect(scroll.style.getPropertyValue("--st-composer-clearance")).toBe("240px");
    await act(async () => root.render(createElement("main", { "data-frame-main": true }, createElement("div", { "data-workspace-scroll": true }))));
    expect(disconnect).toHaveBeenCalled();
    expect(scroll.style.getPropertyValue("--st-composer-clearance")).toBe("");
    expect(scroll.hasAttribute("data-st-composer-clearance")).toBe(false);
  } finally {
    bounds.mockRestore();
    await act(async () => root.unmount());
    host.remove();
  }
});

it("keeps phone tabs, safe area, and composer clearance in one shared scrolling contract", () => {
  const kit = readFileSync("src/components/ui/strelva/kit.module.css", "utf8");
  const shell = readFileSync("src/experience/app-frame/strelva-shell.module.css", "utf8");
  const nav = readFileSync("src/experience/workspace/owner-phone-navigation.module.css", "utf8");
  expect(kit).toContain("padding-bottom: var(--st-composer-clearance)");
  expect(kit).toContain("scroll-padding-bottom: var(--st-composer-clearance)");
  expect(kit).toContain("margin-bottom: calc(-1 * var(--st-composer-clearance, 0px))");
  expect(kit).toContain("calc(16px + var(--st-phone-navigation-height, 0px) + var(--st-workspace-safe-area, 0px))");
  expect(shell).toContain("--st-phone-navigation-height: 64px");
  expect(shell).toContain("--st-workspace-safe-area: env(safe-area-inset-bottom, 0px)");
  expect(shell).toMatch(/\.root\[data-workspace-theme="linen"\] :global\(\[data-frame-main\]\)\s*\{\s*overflow-y: auto;/);
  expect(nav).toContain("height: calc(var(--st-phone-navigation-height, 64px) + var(--st-workspace-safe-area, 0px))");
});
