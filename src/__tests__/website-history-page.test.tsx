import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({ activity: vi.fn(), snapshots: vi.fn(), events: vi.fn(), history: vi.fn(), summary: vi.fn() }));
vi.mock("@/lib/dashboard-auth", () => ({ requireDashboardView: async () => ({ tenant: "gldf", clientFallbackRoot: null }) }));
vi.mock("@/lib/storage", () => ({ getActivity: reads.activity, getSiteSnapshots: reads.snapshots }));
vi.mock("@/lib/events", () => ({ getEvents: reads.events }));
vi.mock("@/lib/scan-store", () => ({ getScanHistory: reads.history, getScanSummary: reads.summary }));
vi.mock("@/components/dashboard/SiteSafetyPanel", () => ({ SiteSafetyPanel: () => <p>Saved versions are available.</p> }));
import SiteHistoryPage from "@/app/dashboard/history/page";

beforeEach(() => {
  vi.resetAllMocks();
  reads.activity.mockResolvedValue([]);
  reads.snapshots.mockResolvedValue([]);
  reads.events.mockResolvedValue([]);
  reads.history.mockResolvedValue([]);
  reads.summary.mockResolvedValue(null);
});

describe("website history availability", () => {
  it("shows an unavailable request read without claiming no requests exist", async () => {
    reads.events.mockRejectedValue(new Error("offline"));
    const html = renderToStaticMarkup(await SiteHistoryPage({ searchParams: Promise.resolve({ request: "evt_saved_request" }) }));
    expect(html).toContain("Website request history is temporarily unavailable.");
    expect(html).not.toContain("No website requests have been recorded yet");
    expect(html).toContain("Reload history");
    expect(html).toContain('/dashboard/history?request=evt_saved_request');
  });

  it("keeps failed scan reads distinct from a confirmed empty scan history", async () => {
    reads.history.mockRejectedValue(new Error("offline"));
    reads.summary.mockRejectedValue(new Error("offline"));
    const html = renderToStaticMarkup(await SiteHistoryPage({}));
    expect(html).toContain("Site check history is temporarily unavailable.");
    expect(html).not.toContain("No canonical site check has been recorded yet");
    expect(html).toContain("No website requests have been recorded yet");
  });

  it("does not offer backup or activity empty states after those reads fail", async () => {
    reads.snapshots.mockRejectedValue(new Error("offline"));
    reads.activity.mockRejectedValue(new Error("offline"));
    const html = renderToStaticMarkup(await SiteHistoryPage({}));
    expect(html).toContain("Saved versions are temporarily unavailable.");
    expect(html).toContain("Recent changes are temporarily unavailable.");
    expect(html).not.toContain("Saved versions are available.");
    expect(html).not.toContain("No updates yet");
  });
});
