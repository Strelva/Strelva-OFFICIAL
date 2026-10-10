// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccessRequestPage } from "@/components/marketing/AccessRequestPage";
import { OwnerClaimAcceptance } from "@/experience/workspace/agency/OwnerClaimAcceptance";
import { WebsiteAuditPage } from "@/products/website-audit/WebsiteAuditPage";
import type { AuditResult } from "@/lib/audit/types";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation, useSearchParams: () => new URLSearchParams("ref=preview-source") }));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  navigation.push.mockReset();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function input(selector: string, value: string) {
  const field = container.querySelector<HTMLInputElement>(selector)!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function click(text: string) {
  const button = Array.from(container.querySelectorAll("button")).find(value => value.textContent === text)!;
  expect(button).toBeTruthy(); await act(async () => button.click());
}
const preview = { workspaceName: "Fictional business", agencyName: "Fictional studio", recipientEmail: "owner@example.invalid", status: "pending", expiresAt: "2026-10-16T12:00:00Z" };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("L13 retained entry and report actions", () => {
  it("keeps intake details on failure and preserves the existing trimmed API input", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ error: "Please try again later." }, 503)); vi.stubGlobal("fetch", fetch);
    await act(async () => root.render(createElement(AccessRequestPage)));
    await input("#business-name", " Fictional business "); await input("#email", " OWNER@example.invalid ");
    await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(fetch).toHaveBeenCalledWith("/api/access-request/intake", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toMatchObject({ businessName: "Fictional business", email: "owner@example.invalid", referredBy: "preview-source", description: "Build request." });
    expect(container.querySelector<HTMLInputElement>("#business-name")?.value).toBe(" Fictional business ");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Please try again later.");
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
  });

  it("sends unsigned owner claims to the same sign-in continuation without claiming", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({ claim: preview })).mockResolvedValueOnce(response({}, 401)); vi.stubGlobal("fetch", fetch);
    await act(async () => root.render(createElement(OwnerClaimAcceptance, { token: "test-token" })));
    await click("Become the owner");
    expect(navigation.push).toHaveBeenCalledWith("/sign-in?next=%2Fworkspace%2Fclaim%2Ftest-token");
    expect(fetch.mock.calls[1]).toEqual(["/api/workspace-claims/test-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }]);
    expect(container.textContent).not.toContain("is yours");
  });

  it("keeps the owner decision available after a permission failure", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({ claim: preview })).mockResolvedValueOnce(response({ error: "Use the verified invited account." }, 403)); vi.stubGlobal("fetch", fetch);
    await act(async () => root.render(createElement(OwnerClaimAcceptance, { token: "test-token" })));
    await click("Become the owner");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Use the verified invited account.");
    expect(container.textContent).toContain("Become the owner");
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("never offers a claim action for an expired link", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ claim: { ...preview, status: "expired" } })); vi.stubGlobal("fetch", fetch);
    await act(async () => root.render(createElement(OwnerClaimAcceptance, { token: "expired-token" })));
    expect(container.textContent).toContain("This link expired");
    expect(Array.from(container.querySelectorAll("button")).some(button => button.textContent === "Become the owner")).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("uses allowed screen wording while exporting the exact original audit payload", async () => {
    const audit: AuditResult = { url: "https://example.invalid", scannedAt: "2026-10-09T14:44:00Z", overallScore: 60, grade: "C", categories: [{ name: "AI readability", slug: "ai-readability", score: 60, weight: 1, checks: [{ name: "AI readiness", status: "warn", score: 60, message: "AI cannot read these pages.", impact: "AI agents need readable content for this workflow task." }] }] };
    const fetch = vi.fn().mockResolvedValue(new Response("<html>Fictional report</html>")); vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => "blob:fixture"); static revokeObjectURL = vi.fn(); });
    vi.spyOn(window, "open").mockReturnValue(window);
    await act(async () => root.render(createElement(WebsiteAuditPage, { initialResult: audit })));
    await click("See checks");
    expect(container.textContent).not.toMatch(/\b(?:AI|agent|automation|workflow|task)\b/i);
    expect(container.querySelector('[aria-expanded="true"]')).not.toBeNull();
    await click("Save as PDF");
    expect(fetch.mock.calls[0]![0]).toBe("/api/audit/report");
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual(audit);
  });
});
