// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { StComposerDock } from "@/components/ui/strelva/Kit";
import { AppFrame } from "@/experience/app-frame/AppFrame";
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
] as const)("puts the %s composer outside the scrolling work", async (_page, element) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(Response.json({}))));
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(element));
    const dock = host.querySelector("[data-st-composer-dock]")!;
    expect(dock.parentElement).toBe(host.querySelector("[data-frame-composer]"));
    expect(dock.closest("[data-workspace-scroll], [data-frame-main]")).toBeNull();
    expect(host.querySelector("[data-frame-main]")?.querySelector("[data-st-composer-dock]")).toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it("retains editor state while growing and releases the footer when permission removes the dock", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const page = (allowed: boolean) => <AppFrame><div data-workspace-scroll><button>Last primary action</button>{allowed ? <StComposerDock><textarea aria-label="Ask" defaultValue="Keep this draft" /></StComposerDock> : <p>Only the owner can ask here.</p>}</div></AppFrame>;
  try {
    await act(async () => root.render(page(true)));
    const editor = host.querySelector("textarea")!;
    editor.value = "Long draft\n".repeat(30);
    await act(async () => root.render(page(true)));
    expect(host.querySelector("textarea")).toBe(editor);
    expect(editor.value).toContain("Long draft");
    expect(host.querySelector("[data-frame-main]")?.textContent).toContain("Last primary action");
    await act(async () => root.render(page(false)));
    expect(host.querySelector("[data-frame-composer]")?.childElementCount).toBe(0);
    expect(host.querySelector("[data-frame-main]")?.textContent).toContain("Only the owner");
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it("keeps a standalone dock in normal flow with no sticky or negative-margin geometry", () => {
  const kit = readFileSync("src/components/ui/strelva/kit.module.css", "utf8");
  const frame = readFileSync("src/experience/app-frame/app-frame.module.css", "utf8");
  const shell = readFileSync("src/experience/app-frame/strelva-shell.module.css", "utf8");
  const dockRules = kit.match(/\.composerDock\s*\{[^}]+\}/g)!.join("\n");
  expect(dockRules).not.toMatch(/position:|margin-bottom:/);
  expect(frame).toContain(".composerSlot:empty { display: none; }");
  expect(frame).toMatch(/\.composerSlot\s*\{[^}]+max-height: 50%;[^}]+overflow-y: auto;/);
  expect(kit).toContain("calc(16px + var(--st-phone-navigation-height, 0px) + var(--st-workspace-safe-area, 0px))");
  expect(shell).toContain("--st-phone-navigation-height: 64px");
  expect(shell).toContain("--st-workspace-safe-area: env(safe-area-inset-bottom, 0px)");
});
