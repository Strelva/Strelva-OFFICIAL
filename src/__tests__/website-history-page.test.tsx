import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({ activity: vi.fn(), snapshots: vi.fn(), events: vi.fn(), history: vi.fn(), summary: vi.fn(), moved: vi.fn() }));
vi.mock("@/lib/dashboard-auth", () => ({ requireDashboardView: async () => ({ tenant: "gldf", clientFallbackRoot: null }) }));
vi.mock("@/lib/storage", () => ({ getActivity: reads.activity, getSiteSnapshots: reads.snapshots }));
vi.mock("@/lib/events", () => ({ getEvents: reads.events }));
vi.mock("@/lib/scan-store", () => ({ getScanHistory: reads.history, getScanSummary: reads.summary }));
vi.mock("@/components/dashboard/SiteSafetyPanel", () => ({ SiteSafetyPanel: () => <p>Saved versions are available.</p> }));
vi.mock("@/lib/tenant", () => ({ getTenantFromHeaders: async () => "gldf" }));
vi.mock("@/platform/owner-entry/server", () => ({ redirectIfDashboardPageMoved: reads.moved }));
import { isValidElement, type ReactElement } from "react";
import SitePageModule from "@/app/dashboard/history/page";
import { SiteHistoryContent } from "@/components/dashboard/SiteHistoryContent";

/** The page renders the shared (async) history content; render that content the way the page configures it. */
async function SiteHistoryPage(input: { searchParams?: Promise<{ request?: string }> }) {
  const page = await SitePageModule(input) as ReactElement<{ children: ReactElement<Parameters<typeof SiteHistoryContent>[0]> }>;
  const child = page.props.children;
  if (!isValidElement(child)) throw new Error("history content missing");
  return <div>{await SiteHistoryContent(child.props)}</div>;
}

beforeEach(() => {
  vi.resetAllMocks();
  reads.activity.mockResolvedValue([]);
  reads.snapshots.mockResolvedValue([]);
  reads.events.mockResolvedValue([]);
  reads.history.mockResolvedValue([]);
  reads.summary.mockResolvedValue(null);
});

describe("website history availability", () => {
  it("checks first whether the page moved to the workspace website", async () => {
    await SitePageModule({});
    expect(reads.moved).toHaveBeenCalledWith("gldf", "/history");
  });

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
