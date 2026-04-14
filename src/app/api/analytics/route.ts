import { NextResponse } from "next/server";
import { getDailyMetrics, getClickCounts } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireTenantAccess } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const url = new URL(request.url);
    const days = Math.min(Number(url.searchParams.get("days")) || 30, 90);

    const [daily, pageViews, bookingClicks] = await Promise.all([
      getDailyMetrics(tenant, days),
      getClickCounts("page-view", tenant),
      getClickCounts("booking-click", tenant),
    ]);

    // Calculate week-over-week comparison
    const thisWeekViews = daily.slice(-7).reduce((s, d) => s + d.pageViews, 0);
    const lastWeekViews = daily.slice(-14, -7).reduce((s, d) => s + d.pageViews, 0);
    const thisWeekClicks = daily.slice(-7).reduce((s, d) => s + d.bookingClicks, 0);
    const lastWeekClicks = daily.slice(-14, -7).reduce((s, d) => s + d.bookingClicks, 0);

    const viewsTrend = lastWeekViews > 0
      ? Math.round(((thisWeekViews - lastWeekViews) / lastWeekViews) * 100)
      : thisWeekViews > 0 ? 100 : 0;
    const clicksTrend = lastWeekClicks > 0
      ? Math.round(((thisWeekClicks - lastWeekClicks) / lastWeekClicks) * 100)
      : thisWeekClicks > 0 ? 100 : 0;

    return NextResponse.json({
      daily,
      totals: {
        pageViews,
        bookingClicks,
      },
      trends: {
        views: { thisWeek: thisWeekViews, lastWeek: lastWeekViews, change: viewsTrend },
        clicks: { thisWeek: thisWeekClicks, lastWeek: lastWeekClicks, change: clicksTrend },
      },
    });
  } catch (err) {
    console.error("[analytics GET]", err);
    return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 });
  }
}
