// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DraftChangePreview } from "@/app/admin/drafts/DraftChangePreview";
import { DraftActions } from "@/app/admin/drafts/DraftActions";
import { LeadRows } from "@/app/admin/leads/LeadRows";
import { RetryRevalidationButton } from "@/app/admin/ops/RetryRevalidationButton";
import { OpsView } from "@/app/admin/ops/OpsView";
import type { DeliveryLead } from "@/lib/access-request-delivery";
import type { OpsReport } from "@/lib/ops";
import type { HealthReport } from "@/lib/health";

const navigation = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); vi.clearAllMocks(); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function click(label: string) { const button = [...container.querySelectorAll("button")].find(item => item.textContent === label); expect(button).toBeDefined(); await act(async () => button!.click()); }
const lead: DeliveryLead = { businessName: "Test business", email: "owner@example.test", statusToken: "test-token", deliveryStatus: "received", submittedAt: "2026-10-01T12:00:00Z", statusUpdatedAt: "2026-10-01T12:00:00Z" };

describe("paper operator records", () => {
  it("shows complete field differences without any operator decision controls", () => {
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    act(() => root.render(createElement(DraftActions, { tenant: "test", section: "hero", preview: { type: "content_update", metadata: { diffs: [{ field: "Headline", type: "changed", before: "Old title", after: "New title" }] } } })));
    expect(container.textContent).toContain("Old title"); expect(container.textContent).toContain("New title");
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector('a[href="/workspace"]')?.textContent).toBe("Open business workspace");
    expect(request).not.toHaveBeenCalled();
  });
  it("keeps the exact Google draft destination and formats proposed hours without inventing prior hours", () => {
    act(() => root.render(createElement(DraftChangePreview, {event:{type:"content_update",metadata:{kind:"gbp_post_draft",summary:"A proposed post",ctaUrl:"https://example.test/contact"}}})));
    expect(container.textContent).toContain("A proposed post"); expect(container.textContent).toContain("https://example.test/contact");
    act(() => root.render(createElement(DraftChangePreview, {event:{type:"content_update",metadata:{kind:"gbp_hours_draft",hours:[null,{day:"MONDAY",open:"09:00",close:"17:30"}]}}})));
    expect(container.textContent).toContain("Monday"); expect(container.textContent).toContain("9:00 AM – 5:30 PM"); expect(container.textContent).not.toContain("Removed");
    act(() => root.render(createElement(DraftChangePreview, {event:{type:"unrelated",metadata:{kind:"gbp_post_draft",summary:"Do not approve this"}}})));
    expect(container.textContent).toBe("");
  });
  it("explains that inspection grants no content authority", () => {
    act(() => root.render(createElement(DraftActions, { tenant: "test", section: "hero" })));
    expect(container.textContent).toContain("Platform support cannot approve or reject client content");
    expect(navigation.refresh).not.toHaveBeenCalled();
  });
  it("keeps leads in place when conversion admission fails", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ error: "Denied" }, { status: 403 })); vi.stubGlobal("fetch", request);
    act(() => root.render(createElement(LeadRows, { leads: [lead], initialWorkflow: {} })));
    await click("Convert"); expect(navigation.push).not.toHaveBeenCalled(); expect(container.querySelector('[role="alert"]')?.textContent).toContain("Couldn't update that lead");
    expect(request).toHaveBeenCalledWith("/api/admin/leads/test-token/workflow", expect.objectContaining({ body: JSON.stringify({ status: "converting" }) }));
  });
  it("restores the existing client stage after a failed optimistic change", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { status: 500 })));
    act(() => root.render(createElement(LeadRows, { leads: [lead], initialWorkflow: {} })));
    const select = container.querySelector("select")!;
    await act(async () => { select.value = "drafting"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(select.value).toBe("received"); expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });
  it("requires confirmation for a revalidation retry and retains provider errors", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ error: "Denied" }, { status: 403 })); vi.stubGlobal("fetch", request);
    act(() => root.render(createElement(RetryRevalidationButton, { tenantId: "test" })));
    await click("Retry"); expect(request).not.toHaveBeenCalled(); await click("Yes, retry");
    expect(request).toHaveBeenCalledWith("/api/admin/ops/retry-revalidation", expect.objectContaining({ body: JSON.stringify({ tenantId: "test" }) }));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Denied");
  });
  it("disables every mutation in the provider-disabled preview", () => {
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    act(() => root.render(createElement("div", null, createElement(DraftActions, { tenant: "test", section: "hero", readOnly: true }), createElement(LeadRows, { leads: [lead], initialWorkflow: {}, readOnly: true }), createElement(RetryRevalidationButton, { tenantId: "test", readOnly: true }))));
    for (const control of container.querySelectorAll<HTMLButtonElement>("button")) if (["Approve", "Reject", "Convert", "Retry"].includes(control.textContent ?? "")) expect(control.disabled).toBe(true);
    expect(container.querySelector<HTMLSelectElement>("select")?.disabled).toBe(true); expect(container.querySelector<HTMLTextAreaElement>("textarea")?.disabled).toBe(true); expect(request).not.toHaveBeenCalled();
  });
  it("keeps missing configuration neutral and uses native drilldown anchors", () => {
    const report: OpsReport = { timestamp: "2026-10-09T12:00:00Z", activeTenants: 0, revalidationFailures: [], metrics: { webhookFailures: 0, revalidationFailures: 0, pendingEvents: {}, totalPendingEvents: 0, failedAiWrites: 0, tenantDomainDrift: [] } };
    const health: HealthReport = { status: "healthy", version: "1", timestamp: report.timestamp, checks: { redis: { status: "not configured", responseMs: 0 }, supabase: { status: "ok", responseMs: 5 }, stripe: { status: "not configured", responseMs: 0 }, gemini: { status: "not configured", responseMs: 0 } } };
    act(() => root.render(createElement(OpsView, { report, health })));
    expect(container.textContent).toContain("Not fully configured"); expect(container.textContent).not.toContain("All clear"); expect(container.textContent).not.toContain("AI");
    health.status = "down"; act(() => root.render(createElement(OpsView, { report, health })));
    expect(container.textContent).toContain("Service checks need attention"); expect(container.textContent).not.toContain("All clear");
    report.metrics.revalidationFailures = 1; act(() => root.render(createElement(OpsView, { report, health })));
    expect(container.querySelector('a[href="#revalidation-failures"]')?.getAttribute("href")).toBe("#revalidation-failures");
  });
});
