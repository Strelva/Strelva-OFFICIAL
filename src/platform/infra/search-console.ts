export interface GscTotals {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  topQueries: { query: string; clicks: number; impressions: number; position: number }[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const num = (v: unknown) => Number(v) || 0;

/**
 * The two-request Search Analytics read shared by BOTH GSC readers — the
 * dashboard perf reader (`analytics.getSearchConsolePerf`) and the cron
 * `fetchSearchData` below. One un-dimensioned request yields the TRUE property
 * totals (summing the top-20 query rows understates any long tail); a second
 * dimensioned request yields the top-20 query list for display. Totals come from
 * the aggregate row, falling back to the query-row sum only if that read is
 * empty. Returns null on any non-ok response — callers map that to their own
 * empty/unavailable shape. The caller supplies the resolved property + bearer
 * token (each reader has its own auth strategy), so this is purely the
 * query+parse that previously lived, drift-prone, in two places (Track B had to
 * edit both copies identically — this centralizes it).
 */
export async function queryGscTotals(
  property: string,
  token: string,
  startDate: string,
  endDate: string,
  requireData = false,
): Promise<GscTotals | null> {
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
    property,
  )}/searchAnalytics/query`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const [totalsRes, queriesRes] = await Promise.all([
    fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ startDate, endDate }) }),
    fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ startDate, endDate, dimensions: ["query"], rowLimit: 20 }),
    }),
  ]);
  if (!totalsRes.ok || !queriesRes.ok) {
    const failed = !totalsRes.ok ? totalsRes : queriesRes;
    console.error(`Search Console API error: ${failed.status} ${await failed.text()}`);
    return null;
  }

  const totalsData = await totalsRes.json();
  const queriesData = await queriesRes.json();
  const queryRows: { keys: string[]; clicks: number; impressions: number; position: number }[] =
    queriesData.rows || [];
  const topQueries = queryRows.map((r) => ({
    query: r.keys[0] ?? "",
    clicks: r.clicks,
    impressions: r.impressions,
    position: round1(r.position),
  }));

  const totalRow: { clicks?: number; impressions?: number; ctr?: number; position?: number } | undefined =
    totalsData.rows?.[0];
  if (requireData && !totalRow && !queryRows.length) return null;
  const clicks = totalRow ? num(totalRow.clicks) : queryRows.reduce((s, r) => s + r.clicks, 0);
  const impressions = totalRow ? num(totalRow.impressions) : queryRows.reduce((s, r) => s + r.impressions, 0);
  const ctr = totalRow
    ? Math.round(num(totalRow.ctr) * 10000) / 10000
    : impressions > 0
      ? Math.round((clicks / impressions) * 10000) / 10000
      : 0;
  const position = totalRow
    ? round1(num(totalRow.position))
    : impressions > 0
      ? round1(queryRows.reduce((s, r) => s + r.position * r.impressions, 0) / impressions)
      : 0;

  return { clicks, impressions, ctr, position, topQueries };
}

