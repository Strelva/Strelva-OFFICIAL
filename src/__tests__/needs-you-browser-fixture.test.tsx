// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const http = vi.hoisted(() => { const request = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", request); return { request }; });
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not-found"); }, useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/preview/strelva/needs-you-recovery", useSearchParams: () => new URLSearchParams() }));
import Page from "@/app/preview/strelva/needs-you-recovery/page";
import { NeedsYouRecoveryPreview } from "@/experience/workspace/preview/NeedsYouRecoveryPreview";
import { needsYouBrowserRead, workspaceId } from "../../tests/support/needs-you-browser-fixture";
let root: Root | undefined; let node: HTMLDivElement | undefined;
afterEach(async () => { await act(async () => root?.unmount()); node?.remove(); root = undefined; node = undefined; http.request.mockReset(); vi.unstubAllEnvs(); });
it.each(["home", "needs-you"] as const)("uses the real default HTTP hook/caller in closed %s preview", async view => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let state: "partial" | "complete" = "partial";
  http.request.mockImplementation(async input => String(input) === `/api/workspace/needs-you?workspaceId=${workspaceId}` ? Response.json(needsYouBrowserRead(state)) : Response.json({ error: "Unrelated fictional source unavailable." }, { status: 503 }));
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
  await act(async () => root!.render(<NeedsYouRecoveryPreview view={view} />));
  expect(node.textContent).toContain("Fictional decision recovery · no Auth, provider delivery or native proof");
  expect(node.textContent).toContain("Some decisions could not be checked."); expect(node.textContent).not.toMatch(/Nothing needs you|Nothing is waiting on you/);
  const initial = [...node.querySelectorAll("button")].find(b => b.textContent === "Check again")!; initial.focus(); state = "complete";
  await act(async () => initial.click());
  expect(node.textContent).toContain(view === "home" ? "Nothing needs you right now." : "Nothing needs you.");
  expect(document.activeElement).toBe(node.querySelector(view === "home" ? "#home-attention" : "h1"));
  const reads = http.request.mock.calls.filter(([url]) => String(url).startsWith("/api/workspace/needs-you")); expect(reads).toHaveLength(2);
  for (const [url, init] of reads) { expect(String(url)).toBe(`/api/workspace/needs-you?workspaceId=${workspaceId}`); expect(init?.cache).toBe("no-store"); expect(init?.method ?? "GET").toBe("GET"); }
  expect(http.request.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
});
it.each(["home", "needs-you"] as const)("opens only explicit development preview %s", async view => {
  vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("STRELVA_UI_PREVIEW", "1");
  expect((await Page({ searchParams: Promise.resolve({ view }) })).props.view).toBe(view);
});
it.each([{}, { view: "other" }, { view: "home", workspaceId: "foreign" }, { view: "home", actor: "owner" }])("refuses missing, unbounded or authority-bearing preview query %j", async params => {
  vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("STRELVA_UI_PREVIEW", "1");
  await expect(Page({ searchParams: Promise.resolve(params) })).rejects.toThrow("not-found");
});
it.each(["production", "test"])("refuses recovery outside development even with hosted preview gate in %s", async environment => {
  vi.stubEnv("NODE_ENV", environment); vi.stubEnv("STRELVA_UI_PREVIEW", "1"); vi.stubEnv("VERCEL_ENV", "preview");
  await expect(Page({ searchParams: Promise.resolve({ view: "home" }) })).rejects.toThrow("not-found");
});
it("refuses development without explicit preview flag", async () => {
  vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("STRELVA_UI_PREVIEW", "0");
  await expect(Page({ searchParams: Promise.resolve({ view: "home" }) })).rejects.toThrow("not-found");
});
it("keeps supplied fictional asks fully reviewable and delivery unavailable without treating partial discovery as handled failure", () => {
  expect(needsYouBrowserRead("partial")).toMatchObject({ items: [], complete: false, handledAvailable: false });
  expect(needsYouBrowserRead("known")).toMatchObject({ complete: false, handledAvailable: true, items: [{ workspaceId, review: ["Complete fictional reply."], deliveryState: "suppressed" }] });
  expect(needsYouBrowserRead("complete")).toMatchObject({ items: [], complete: true, handledAvailable: true });
});
