// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { WebsiteEntryPreview } from "@/experience/websites/WebsiteEntryPreview";
import Page from "@/app/preview/strelva/website-entry/page";
import { routingRecord, workspaceId, workId } from "../../tests/support/website-routing-browser-fixture";
import { entryPendingRecord, entryProgressRecord } from "../../tests/support/website-entry-browser-fixture";
import { reportBrowserFixture } from "../../tests/support/website-report-browser-fixture";
import { parseRebuildView } from "@/experience/websites/rebuild-transport";
import { siteDocumentHash } from "@/products/websites/site-document";
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not-found"); } }));
let root: Root | undefined, node: HTMLDivElement | undefined;
afterEach(async () => { await act(async () => root?.unmount()); node?.remove(); root = undefined; node = undefined; vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it.each(["progress", "pending"] as const)("mounts the actual wrapper/default HTTP consumer for closed %s mode", async recovery => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const record = routingRecord(recovery === "pending");
  const fetcher = vi.fn(async (url: RequestInfo | URL) => new Response(JSON.stringify(String(url).includes("/history") ? { revisions: [] } : String(url).includes("/domain?") ? { domain: { hostname: "published.example.test", status: "pending", checkedAt: null, records: [] } } : String(url).includes("/report?") ? reportBrowserFixture(new URL(String(url), "http://localhost").searchParams.get("month")!) : record), { status: 200 }));
  vi.stubGlobal("fetch", fetcher); node = document.createElement("div"); document.body.append(node); root = createRoot(node);
  await act(async () => root!.render(createElement(WebsiteEntryPreview, { entry: "rebuild", state: "ready", recovery })));
  expect(fetcher.mock.calls.some(([url]) => String(url) === `/api/websites/${workId}/rebuild?workspaceId=${workspaceId}`)).toBe(true);
  const select = node.querySelector<HTMLSelectElement>("select")!;
  expect(select.value).toBe(workId); expect(select.selectedOptions[0]!.textContent).toBe(`Fictional bakery · ${recovery === "pending" ? "published" : "review"}`);
  expect(node.querySelector('section[aria-label="Website rebuild"] h1')?.textContent).toBe("Fictional bakery");
  expect(node.textContent).toContain("Fictional saved-work recovery · no Auth, provider or publication proof");
});
it("parses fictional progress envelopes with work and candidate revisions distinct", () => {
  const building = parseRebuildView(entryProgressRecord(false)), review = parseRebuildView(entryProgressRecord(true));
  expect(building).toMatchObject({ revision: 3, status: "building", candidate: null });
  expect(review).toMatchObject({ revision: 4, status: "review", title: "Fictional bakery review", candidate: { revision: 2 } });
  expect(review.candidate!.contentHash).toBe(siteDocumentHash(entryProgressRecord(true).rebuild.candidate!.document));
});
it("binds reconciled current facts/hash while retaining the fictional earlier publication", () => {
  const old = parseRebuildView(entryPendingRecord(false)), next = parseRebuildView(entryPendingRecord(true));
  expect(old).toMatchObject({ revision: 3, status: "published", approved: true, candidate: { revision: 2 } });
  expect(next).toMatchObject({ revision: 4, status: "review", title: "Fictional bakery current", approved: false, candidate: { revision: 3 } });
  expect(next.candidate!.contentHash).toBe(siteDocumentHash(entryPendingRecord(true).rebuild.candidate.document));
  expect(next.candidate!.contentHash).not.toBe(old.candidate!.contentHash);
  expect(entryPendingRecord(true).rebuild.launch.receipt).toEqual(entryPendingRecord(false).rebuild.launch.receipt);
});
it("keeps ordinary static modes and explicitly enables only the two closed development modes", async () => {
  vi.stubEnv("STRELVA_UI_PREVIEW", "1"); vi.stubEnv("NODE_ENV", "development");
  for (const recovery of ["progress", "pending"]) {
    const page = await Page({ searchParams: Promise.resolve({ recovery }) });
    expect(page.props.children.props.recovery).toBe(recovery);
  }
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL_ENV", "preview");
  const staticPage = await Page({ searchParams: Promise.resolve({ entry: "rebuild", state: "saved" }) });
  expect(staticPage.props.children.props.recovery).toBeUndefined(); expect(staticPage.props.children.props.state).toBe("saved");
});
it("refuses recovery mode outside development or for an unknown mode", async () => {
  vi.stubEnv("STRELVA_UI_PREVIEW", "1"); vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("NODE_ENV", "production");
  await expect(Page({ searchParams: Promise.resolve({ recovery: "progress" }) })).rejects.toThrow("not-found");
  vi.stubEnv("NODE_ENV", "development");
  await expect(Page({ searchParams: Promise.resolve({ recovery: "unbounded" }) })).rejects.toThrow("not-found");
});
