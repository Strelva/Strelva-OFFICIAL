// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditList } from "@/app/admin/audit/AuditList";
import { SiteAuditsBoard } from "@/app/admin/audit/SiteAuditsBoard";
import { MaintenanceDigests } from "@/app/admin/digests/MaintenanceDigests";
import { PortfolioActionsClient } from "@/app/admin/actions/PortfolioActionsClient";
import { PortfolioOpportunitiesClient } from "@/app/admin/actions/PortfolioOpportunitiesClient";
import type { PortfolioActionsSnapshot } from "@/app/admin/actions/portfolio-actions";
import type { MaintenanceDigest } from "@/lib/maintenance-digest";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), resolve: vi.fn(), escalate: vi.fn(), draft: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/admin/actions/actions", () => ({ resolvePortfolioActions: mocks.resolve, escalatePortfolioActions: mocks.escalate, draftPortfolioOpportunity: mocks.draft }));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.clearAllMocks(); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function click(label: string) { const button = [...container.querySelectorAll("button")].find(button => button.textContent === label); expect(button).toBeDefined(); await act(async () => button!.click()); }
const snapshot: PortfolioActionsSnapshot = { groups: [{ tenantId: "sample", siteName: "Sample site", capped: false, items: [{ id: "edit-1", tenantId: "sample", label: "Content update", title: "Update opening hours", createdAt: "2026-10-09T12:00:00Z", type: "content_update" }] }], totalItems: 1, totalClients: 1, availability: "complete", incomplete: [] };
const digest: MaintenanceDigest = { tenant: "sample", siteName: "Sample site", weekOf: "2026-10-05", status: "pending", createdAt: "2026-10-05T12:00:00Z", items: [{ id: "health-1", type: "health", title: "Improve page speed", detail: "The saved check found slow page response.", action: "prompt:Review page speed" }] };

describe("operator depth review", () => {
  it("keeps incomplete approval reads from claiming the portfolio is clear", () => {
    act(() => root.render(createElement(PortfolioActionsClient, { snapshot: { ...snapshot, groups: [], totalItems: 0, totalClients: 0, availability: "unavailable", incomplete: [{ source: "client_directory" }] } })));
    expect(container.textContent).toContain("This portfolio view is incomplete");
    expect(container.textContent).toContain("No verified approvals");
    expect(container.textContent).not.toContain("Portfolio is clear");
  });
  it("retains the deliberate bulk confirmation and leaves refused approvals waiting", async () => {
    const resolveActions = vi.fn().mockResolvedValue({ ok: false, results: [] });
    act(() => root.render(createElement(PortfolioActionsClient, { snapshot, resolveActions })));
    await click("Approve all 1");
    expect(resolveActions).not.toHaveBeenCalled();
    await click("Confirm — publish 1 across all clients?");
    expect(resolveActions).toHaveBeenCalledWith([{ tenantId: "sample", eventId: "edit-1" }]);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Operator permission could not be confirmed");
    expect(container.textContent).toContain("Update opening hours");
  });
  it("keeps a per-item external failure visible in the pending row", async () => {
    const resolveActions = vi.fn().mockResolvedValue({ ok: true, results: [{ eventId: "edit-1", changed: false, reason: "gbp_hours_failed" }] });
    act(() => root.render(createElement(PortfolioActionsClient, { snapshot, resolveActions })));
    await click("Approve");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Hours update failed. Still pending");
    expect(container.textContent).toContain("Update opening hours");
  });
  it("reports denied drafting without claiming a draft was created", async () => {
    const draftOpportunity = vi.fn().mockResolvedValue({ ok: false, results: [] });
    act(() => root.render(createElement(PortfolioOpportunitiesClient, { snapshot: { groups: [{ kind: "low_health", title: "Site health", summary: "A client has an unresolved check.", actionLabel: "Draft fixes", clients: [{ tenantId: "sample", siteName: "Sample site", detail: "Grade D" }] }], totalOpportunities: 1, availability: "complete", incomplete: [] }, draftOpportunity })));
    await click("Draft fixes");
    expect(draftOpportunity).toHaveBeenCalledWith("low_health", ["sample"]);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("No draft has been confirmed");
    expect(container.textContent).not.toContain("AI");
  });
  it("retains previous audit measurements when scan permission is denied", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ error: "Operator access required" }, { status: 403 }));
    act(() => root.render(createElement(SiteAuditsBoard, { initialRows: [{ id: "sample", siteName: "Sample site", url: "https://sample.example", grade: "D", score: 45, issues: 3, high: 1, scannedAt: "2026-10-01T12:00:00Z" }], request })));
    await click("Scan");
    expect(request).toHaveBeenCalledWith("/api/admin/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenant: "sample" }) });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Previous audit results are still shown");
    expect(container.textContent).toContain("45/100");
    expect(container.textContent).toContain("1 high · 3 to fix");
  });
  it("keeps all audit values in the responsive table and shows an honest unscanned state", () => {
    act(() => root.render(createElement(SiteAuditsBoard, { initialRows: [{ id: "sample", siteName: "Sample site", url: null, grade: null, score: null, issues: null, high: 0, scannedAt: null }] })));
    expect(container.textContent).toContain("Not scanned");
    expect(container.textContent).toContain("Not measured");
    expect(container.textContent).toContain("Not checked");
    expect(container.textContent).not.toContain("All clear");
    expect(container.querySelectorAll("tbody td")).toHaveLength(4);
  });
  it("filters audit activity and restores it with Clear", async () => {
    act(() => root.render(createElement(AuditList, { events: [{ id: "log-1", time: "2026-10-09T12:00:00Z", action: "content.update", targetType: "website", targetId: "page-1", actorLabel: "Named operator", tenant: "sample" }] })));
    const select = container.querySelector('select[aria-label="Filter by site"]') as HTMLSelectElement;
    const option = document.createElement("option"); option.value = "missing"; select.appendChild(option);
    await act(async () => { select.value = "missing"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.textContent).toContain("No actions match these filters");
    await click("Clear");
    expect(container.textContent).toContain("Named operator");
    expect(container.textContent).toContain("page-1");
  });
  it("keeps a digest on denial and removes it only after successful decision", async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json({ error: "Operator access required" }, { status: 403 })).mockResolvedValueOnce(Response.json({ ok: true }));
    act(() => root.render(createElement(MaintenanceDigests, { initialDigests: [digest], request })));
    await click("Approve");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Operator access required");
    expect(container.textContent).toContain("Improve page speed");
    await click("Dismiss");
    expect(request.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ tenant: "sample", decision: "dismissed" }));
    expect(container.textContent).toContain("Nothing needs review");
    expect(container.textContent).not.toContain("Improve page speed");
  });
});
