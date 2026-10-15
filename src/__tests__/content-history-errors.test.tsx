// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Stable identity: ContentHistory reloads whenever dashboardHref changes.
const dashboard = vi.hoisted(() => ({ dashboardHref: (p: string) => p }));
vi.mock("@/components/dashboard/DashboardContext", () => ({ useDashboard: () => dashboard }));

import { ContentHistory } from "@/components/dashboard/ContentHistory";

const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});
async function render() {
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  roots.push(root);
  await act(async () => root.render(createElement(ContentHistory, { section: "hero", onRestored: vi.fn() })));
  return node;
}

it("says History couldn't load when both reads fail, and Try again refetches", async () => {
  const fetchMock = vi.fn(async () => Response.json({ error: "down" }, { status: 503 }));
  vi.stubGlobal("fetch", fetchMock);
  const node = await render();
  expect(node.textContent).toContain("History couldn't load");
  expect(node.textContent).not.toContain("No History yet");
  const calls = fetchMock.mock.calls.length;
  const retry = [...node.querySelectorAll("button")].find((b) => b.textContent === "Try again")!;
  await act(async () => retry.click());
  expect(fetchMock.mock.calls.length).toBeGreaterThan(calls);
});

it("still says No History yet when both reads succeed empty", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
  const node = await render();
  expect(node.textContent).toContain("No History yet");
  expect(node.textContent).not.toContain("couldn't load");
});
