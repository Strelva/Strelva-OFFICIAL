import { describe, it, expect, vi, beforeEach } from "vitest";

// Force the Postgres path and steer the site_metric_summary RPC (audit #4). This
// locks the RPC-row → result mapping: total / today / this-week (last7) /
// last-week (prev7), and the prefix filter.
vi.mock("@/lib/db/source-flags", () => ({ dataSourceIsPostgres: () => true }));
const mockRpc = vi.fn();
vi.mock("@/lib/db/client", () => ({ getSupabase: () => ({ rpc: mockRpc }) }));

import { getClickCounts, getClickCountsByPrefix } from "@/lib/storage/analytics-store";

const SUMMARY = [
  { metric: "booking-click", total: 100, today: 5, last7: 20, prev7: 15 },
  { metric: "phone-click", total: 40, today: 1, last7: 8, prev7: 6 },
  { metric: "service-view:haircut", total: 12, today: 0, last7: 3, prev7: 2 },
];

describe("analytics-store summary path (audit #4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: SUMMARY, error: null });
  });

  it("maps the summary row to total/today/thisWeek/lastWeek", async () => {
    const r = await getClickCounts("booking-click", "acme");
    expect(r).toEqual({ total: 100, today: 5, thisWeek: 20, lastWeek: 15 });
    // ONE aggregation round-trip, not a per-day scan.
    expect(mockRpc).toHaveBeenCalledWith("site_metric_summary", expect.objectContaining({ p_tenant_id: "acme" }));
  });

  it("returns zeros for a metric with no rows", async () => {
    const r = await getClickCounts("never-happened", "acme");
    expect(r).toEqual({ total: 0, today: 0, thisWeek: 0, lastWeek: 0 });
  });

  it("prefix read pulls total + this-week for matching metrics only", async () => {
    const r = await getClickCountsByPrefix("service-view", "acme");
    expect(r).toEqual({ "service-view:haircut": { total: 12, thisWeek: 3 } });
  });
});
