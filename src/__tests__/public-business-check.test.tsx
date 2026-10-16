// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebsiteAuditPage } from "@/products/website-audit/WebsiteAuditPage";
import { businessCheckHref, runPublicBusinessCheck } from "@/products/website-audit/business-check";

const reportId = `audit_${"a".repeat(32)}`;
const scanId = `scan_${"b".repeat(32)}`;
const agency = { workspaceId: "agency-id", slug: "fictional-studio", name: "Fictional Studio", contactUrl: "https://studio.example", brand: { logoUrl: null, accentColor: null } };
const website = { url: "https://bakery.example/", scannedAt: "2026-10-12T12:00:00Z", overallScore: 80, grade: "B", categories: [], reportId };
const ai = { business: "Fictional Bakery", url: "https://bakery.example", score: 70, grade: "C", verdict: "Website measured.", signals: [], citation: { probed: true, mentioned: true, recommended: false, note: "Gemini named Fictional Bakery." }, topFix: "Add opening hours.", scanId, measurementStatus: "measured" };
const pair = (website: unknown, ai: unknown, websiteStatus = 200, aiStatus = 200) => ({ website: { status: websiteStatus, data: website }, ai: { status: aiStatus, data: ai } });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.history.replaceState({}, "", "/audit?utm_source=fixture&agency=fictional-studio");
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function submit() { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }

describe("one public business check", () => {
  it("preserves acquisition, repeated and agency parameters on old entry links", () => {
    expect(businessCheckHref({ agency: "fictional-studio", url: "https://bakery.example", utm_source: "campaign", tag: ["a", "b"], ignored: undefined })).toBe("/audit?agency=fictional-studio&url=https%3A%2F%2Fbakery.example&utm_source=campaign&tag=a&tag=b");
    expect(businessCheckHref({})).toBe("/audit");
  });
  it("requires business name before any scan, and places Check after all fields", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await act(async () => root.render(createElement(WebsiteAuditPage, { initialUrl: "bakery.example" })));
    await submit();
    const name = container.querySelector<HTMLInputElement>("#business-name")!;
    expect(name.required).toBe(true);
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(container.textContent).toContain("Enter your business name");
    expect(document.activeElement).toBe(name);
    expect(Array.from(container.querySelectorAll("input, button[type=submit]")).at(-1)?.textContent).toBe("Check");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("runs both existing contracts with attribution and keeps both retained IDs and combined share link", async () => {
    const fetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>().mockImplementation(() => Promise.resolve(response(pair({ ...website, agency }, { ...ai, agency }))));
    vi.stubGlobal("fetch", fetch);
    const clipboard = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: clipboard } });
    await act(async () => root.render(createElement(WebsiteAuditPage, { initialUrl: "bakery.example", initialBusiness: "Fictional Bakery", agency, workspaceEnabled: true })));
    await submit();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({ url: "bakery.example", agency: agency.slug });
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({ business: "Fictional Bakery", agency: agency.slug, source: "fixture" });
    expect(container.textContent).toContain("Gemini named Fictional Bakery.");
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelectorAll("[data-agency-brand]")).toHaveLength(1);
    expect(container.textContent).toContain("recurring Gemini checks");
    expect(window.location.search).toContain(`report=${reportId}`);
    expect(window.location.search).toContain(`scan=${scanId}`);
    const share = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Send this to whoever runs your site")!;
    await act(async () => share.click());
    expect(clipboard).toHaveBeenCalledWith(`${window.location.origin}/audit?scan=${scanId}&report=${reportId}&agency=${agency.slug}`);
  });
  it("keeps the retained scan's email request action in the combined result", async () => {
    const fetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>().mockImplementation((path: string) => Promise.resolve(response(path === "/api/audit/check" ? pair(website, ai) : {})));
    vi.stubGlobal("fetch", fetch);
    await act(async () => root.render(createElement(WebsiteAuditPage, { initialUrl: "bakery.example", initialBusiness: "Fictional Bakery" })));
    await submit();
    const email = container.querySelector<HTMLInputElement>('input[type="email"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(email, "owner@example.invalid");
      email.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await submit();
    expect(fetch.mock.calls[1]?.[0]).toBe(`/api/ai-visibility/${scanId}/monitor`);
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({ email: "owner@example.invalid" });
    expect(container.textContent).toContain("Your interest is saved.");
  });
  it("admits one pair of scans even when submit events repeat while pending", async () => {
    const finishes: ((response: Response) => void)[] = [];
    const fetch = vi.fn(() => new Promise<Response>(resolve => finishes.push(resolve))); vi.stubGlobal("fetch", fetch);
    await act(async () => root.render(createElement(WebsiteAuditPage, { initialUrl: "bakery.example", initialBusiness: "Fictional Bakery" })));
    const form = container.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { finishes[0]?.(response(pair(website, ai))); });
    expect(container.textContent).toContain("Your website check");
  });
  it("retains successful website findings when Gemini fails, with no fabricated result", async () => {
    vi.stubGlobal("fetch", vi.fn<(path: string, init?: RequestInit) => Promise<Response>>().mockImplementation(() => Promise.resolve(response(pair(website, { error: "Provider unavailable." }, 200, 503)))));
    await act(async () => root.render(createElement(WebsiteAuditPage, { initialUrl: "bakery.example", initialBusiness: "Fictional Bakery" })));
    await submit();
    expect(container.textContent).toContain("Your website check");
    expect(container.textContent).toContain("Gemini check unavailable: Provider unavailable.");
    expect(container.textContent).not.toContain("Gemini named");
    expect(container.textContent).toContain("Save as PDF");
  });
  it("retains Gemini findings when website health fails", async () => {
    vi.stubGlobal("fetch", vi.fn<(path: string, init?: RequestInit) => Promise<Response>>().mockImplementation(() => Promise.resolve(response(pair({ error: "Site unavailable." }, ai, 503)))));
    await act(async () => root.render(createElement(WebsiteAuditPage, { initialUrl: "bakery.example", initialBusiness: "Fictional Bakery" })));
    await submit();
    expect(container.textContent).toContain("Website check unavailable: Site unavailable.");
    expect(container.textContent).toContain("Gemini named Fictional Bakery.");
    expect(container.textContent).not.toContain("80/100");
  });
  it("refuses silent attribution loss and unreadable provider responses", async () => {
    vi.stubGlobal("fetch", vi.fn<(path: string, init?: RequestInit) => Promise<Response>>().mockImplementation(() => Promise.resolve(response(pair(website, { agency })))));
    const result = await runPublicBusinessCheck({ url: "bakery.example", business: "Fictional Bakery", agency });
    expect(result.website).toBeNull(); expect(result.ai).toBeNull();
    expect(result.websiteError).toContain("agency identity could not be confirmed");
    expect(result.aiError).toContain("unreadable result");
  });
  it("blocks an unavailable agency entry without an unattributed action", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await act(async () => root.render(createElement(WebsiteAuditPage, { attributionError: "Agency checks are not available yet." })));
    expect(container.textContent).toContain("Ask the agency for a working check link.");
    expect(container.querySelector("form")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("never auto-runs a missing Gemini section on an old saved report", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await act(async () => root.render(createElement(WebsiteAuditPage, { initialResult: { ...website, grade: "B" }, saved: true })));
    expect(container.textContent).toContain("not included in this saved report");
    expect(container.textContent).toContain("Saved privately for your business");
    expect(fetch).not.toHaveBeenCalled();
  });
});
