export type AnalyticsStatus = "ok" | "unconfigured" | "unavailable";

export interface GaPerf {
  status: AnalyticsStatus;
  users: number;
  sessions: number;
  pageviews: number;
  topPages: { path: string; views: number }[];
  topSources: { source: string; sessions: number }[];
}

const num = (v: unknown) => Number(v) || 0;

export type Ga4Report = Omit<GaPerf, "status">;
/**
 * The three-report GA4 read shared by the tenant reader (getGa4Perf) and the
 * workspace read grant. The caller supplies the property and a bearer token.
 * Null on a non-ok response or an all-zero property (likely misconfigured or
 * not yet receiving data), so callers show "unavailable" rather than zeros.
 */
export async function queryGa4Report(propertyId: string, token: string, startDate: string, endDate: string): Promise<Ga4Report | null> {
  const property = propertyId.startsWith("properties/") ? propertyId : `properties/${propertyId}`;
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/${property}:batchRunReports`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            dateRanges: [{ startDate, endDate }],
            metrics: [
              { name: "activeUsers" },
              { name: "sessions" },
              { name: "screenPageViews" },
            ],
          },
          {
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: "pagePath" }],
            metrics: [{ name: "screenPageViews" }],
            orderBys: [{ desc: true, metric: { metricName: "screenPageViews" } }],
            limit: 10,
          },
          {
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: "sessionSource" }],
            metrics: [{ name: "sessions" }],
            orderBys: [{ desc: true, metric: { metricName: "sessions" } }],
            limit: 10,
          },
        ],
      }),
    }
  );
  if (!res.ok) return null;

  const data = await res.json();
  const reports = data.reports || [];
  const totals = reports[0]?.rows?.[0]?.metricValues || [];
  const topPages = (reports[1]?.rows || []).map(
    (r: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }) => ({
      path: r.dimensionValues?.[0]?.value ?? "",
      views: num(r.metricValues?.[0]?.value),
    })
  );
  const topSources = (reports[2]?.rows || []).map(
    (r: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }) => ({
      source: r.dimensionValues?.[0]?.value ?? "",
      sessions: num(r.metricValues?.[0]?.value),
    })
  );

  const users = num(totals[0]?.value);
  const sessions = num(totals[1]?.value);
  const pageviews = num(totals[2]?.value);

  // Guard: an ok response with all zeros and no breakdown means the property
  // is likely misconfigured or not yet receiving data.
  if (users === 0 && sessions === 0 && pageviews === 0 && topPages.length === 0 && topSources.length === 0) return null;
  return { users, sessions, pageviews, topPages, topSources };
}

