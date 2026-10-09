// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebsiteRebuildReport } from "@/experience/websites/WebsiteRebuildReport";
import type { WebsiteMonthlyReport } from "@/products/websites/client";

let root: Root | undefined, container: HTMLDivElement;
const uncaught: unknown[] = [];
const current = (): WebsiteMonthlyReport => ({
  workId: "website", workspaceId: "workspace", tenantId: null, siteName: "Fictional bakery", month: "2026-09", generatedAt: "2026-10-01T12:00:00Z",
  inquiries: { status: "available", count: 2, limitedToRecentRecords: true },
  bookings: { status: "unavailable", scheduledInPeriod: null, providerAccepted: null, providerVerified: null },
  visibility: { status: "unavailable", note: "No completed assistant citation check was saved." },
  readiness: { status: "available", passedChecks: 1, totalChecks: 2 },
  changes: [{ revision: 1, contentHash: "a".repeat(64), createdAt: "2026-09-20T12:00:00Z", createdBy: "fictional-owner", published: false }],
});
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-25T12:00:00Z")); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); uncaught.length = 0; });
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function mount(values: unknown[]) {
  const replies = [...values];
  const fetcher = vi.fn(async (_input: RequestInfo | URL, _options?: RequestInit) => {
    const reply = replies.length > 1 ? replies.shift() : replies[0];
    if (reply instanceof Error) throw reply;
    return reply instanceof Response ? reply : new Response(JSON.stringify(reply));
  });
  vi.stubGlobal("fetch", fetcher);
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container, { onUncaughtError: error => uncaught.push(error) });
  await act(async () => root!.render(createElement(WebsiteRebuildReport, { workId: "website" })));
  return fetcher;
}
function refused() {
  expect(uncaught).toEqual([]);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("monthly report");
  expect(container.querySelector("dl")).toBeNull();
  expect(Array.from(container.querySelectorAll("button")).some(button => button.textContent === "Try loading report again")).toBe(true);
}

describe("actual default monthly report HTTP consumer", () => {
  for (const kind of ["HTTP", "caught Error"] as const) for (const message of ["", "   "]) it(`gives completed ${kind} with ${message ? "whitespace" : "empty"} copy a truthful error and retry`, async () => {
    await mount([kind === "HTTP" ? new Response(JSON.stringify({ error: message }), { status: 503 }) : new Error(message)]);
    refused(); expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("refuses a fully shaped different-month reply instead of showing its counts under the selected month", async () => {
    const value = current(); value.month = "2026-08"; value.inquiries.count = 99;
    await mount([value]);
    expect(container.querySelector<HTMLInputElement>('input[type="month"]')?.value).toBe("2026-09");
    expect(container.querySelector("dl")?.textContent ?? "").not.toContain("99"); refused();
  });
  it("refuses a fully shaped different-work reply", async () => {
    const value = current(); value.workId = "other-website"; value.inquiries.count = 99;
    await mount([value]); expect(container.querySelector("dl")?.textContent ?? "").not.toContain("99"); refused();
  });
  it("keeps malformed rendered counts out of React instead of crashing the report", async () => {
    const value = current(); await mount([{ ...value, inquiries: { ...value.inquiries, count: { invalid: true } } }]); refused();
  });
  it("refuses malformed rendered change rows", async () => {
    await mount([{ ...current(), changes: [{ revision: 1, published: true, createdAt: "not-a-date", contentHash: { invalid: true } }] }]); refused();
  });
  it("refuses malformed citation booleans rather than interpreting a string as a named business", async () => {
    await mount([{ ...current(), visibility: { status: "available", checkedAt: "2026-09-20T12:00:00Z", mentioned: "false", recommended: false, note: "One fictional saved check." } }]); refused();
  });
  it("preserves deliberately outside focus when retry is invoked without owning focus", async () => {
    const wrong = current(); wrong.workId = "other-website";
    await mount([wrong, current()]); refused();
    const outside = document.createElement("button"); outside.textContent = "Outside report control"; document.body.append(outside); outside.focus();
    const retry = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Try loading report again")!;
    await act(async () => retry.click());
    expect(document.activeElement).toBe(outside); expect(container.querySelector("dl")).not.toBeNull(); outside.remove();
  });
  it("hides prior-work metrics, aborts superseded reads and never adopts their late result or steals picker focus", async () => {
    const fetcher = await mount([current()]);
    let deliverFirst!: (response: Response) => void, deliverCurrent!: (response: Response) => void;
    fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => { deliverFirst = resolve; }));
    fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => { deliverCurrent = resolve; }));
    const input = container.querySelector<HTMLInputElement>('input[type="month"]')!; input.focus();
    await act(async () => root!.render(createElement(WebsiteRebuildReport, { workId: "next-website" })));
    expect(container.querySelector("dl")).toBeNull();
    await act(async () => root!.render(createElement(WebsiteRebuildReport, { workId: "website" })));
    expect(fetcher.mock.calls[1]![1]!.signal!.aborted).toBe(true);
    await act(async () => deliverFirst(new Response(JSON.stringify({ ...current(), workId: "next-website", inquiries: { status: "available", count: 99, limitedToRecentRecords: true } }))));
    expect(container.querySelector("dl")).toBeNull(); expect(container.querySelector('[role="alert"]')).toBeNull();
    await act(async () => deliverCurrent(new Response(JSON.stringify({ ...current(), workId: "website" }))));
    expect(container.querySelector("dl")).not.toBeNull(); expect(container.textContent).not.toContain("99");
    expect(document.activeElement).toBe(input);
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual(["/api/websites/website/report?month=2026-09", "/api/websites/next-website/report?month=2026-09", "/api/websites/website/report?month=2026-09"]);
  });
  it("shows a legitimate current report, unavailable counts and a saved negative citation separately", async () => {
    const value = current(); value.inquiries = { status: "unavailable", count: null, limitedToRecentRecords: true };
    value.visibility = { status: "available", checkedAt: "2026-09-20T12:00:00Z", mentioned: false, recommended: false, note: "Not named in one saved fictional answer." };
    await mount([value]);
    expect(uncaught).toEqual([]); expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain("Unavailable"); expect(container.textContent).toContain("Not named in check");
    expect(container.textContent).toContain("Not recommended in this saved check"); expect(container.textContent).toContain("1 of 2 passed");
  });
  it("retries only the selected current read and recovers after a mismatched receipt", async () => {
    const wrong = current(); wrong.month = "2026-08";
    const fetcher = await mount([wrong, current()]); refused();
    const retry = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Try loading report again")!;
    retry.focus();
    await act(async () => retry.click());
    expect(document.activeElement).toBe(container.querySelector("h2"));
    expect(container.querySelector('[role="alert"]')).toBeNull(); expect(container.querySelector("dl")).not.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [url, options] of fetcher.mock.calls) {
      expect(url).toBe("/api/websites/website/report?month=2026-09");
      expect(options).toMatchObject({ cache: "no-store", credentials: "same-origin" }); expect(options?.method).toBeUndefined();
    }
  });
});
