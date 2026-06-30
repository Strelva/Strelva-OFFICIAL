import type { VisibilitySnapshot } from "./visibility/snapshots";

/**
 * Competitor benchmark — "where you rank vs your competitors" for the local
 * searches that matter. Reads the latest visibility snapshot the SERP system
 * already collects (each tracked query records the tenant's position plus each
 * configured competitor's), so this adds no new API calls or cost. Returns null
 * when there's no competitor data yet (no SERP key, no competitors configured,
 * or the weekly scan hasn't run).
 */

export interface CompetitorRankRow {
  query: string;
  yourRank: number | null;
  yourInPack: boolean;
  competitors: { name: string; rank: number | null; inPack: boolean }[];
  /** True when you out-rank every tracked competitor on this query. */
  youLead: boolean;
}

export interface CompetitorBenchmark {
  rows: CompetitorRankRow[];
  leadCount: number;
  total: number;
  headline: string;
}

/** Lower is better. Organic position wins; a local-pack appearance counts as
 *  strong-but-not-#1; absent ranks last. Lets us compare you to a competitor
 *  even when one is organic and the other is only in the map pack. */
function effectiveRank(position: number | null, inPack: boolean): number {
  if (position !== null) return position;
  if (inPack) return 3.5;
  return 100;
}

export function buildCompetitorBenchmark(snapshot: VisibilitySnapshot | null): CompetitorBenchmark | null {
  if (!snapshot?.serpResults?.length) return null;

  const usable = snapshot.serpResults.filter((r) => !r.skipped && r.competitors.length > 0);
  if (usable.length === 0) return null;

  const rows: CompetitorRankRow[] = usable.map((r) => {
    const yours = effectiveRank(r.tenantPosition, r.tenantInLocalPack);
    const bestCompetitor = Math.min(...r.competitors.map((c) => effectiveRank(c.position, c.inLocalPack)));
    return {
      query: r.query,
      yourRank: r.tenantPosition,
      yourInPack: r.tenantInLocalPack,
      competitors: r.competitors.map((c) => ({ name: c.name, rank: c.position, inPack: c.inLocalPack })),
      youLead: yours < bestCompetitor,
    };
  });

  const leadCount = rows.filter((r) => r.youLead).length;
  const total = rows.length;
  const headline =
    leadCount === total
      ? "You're out-ranking your competitors across the board."
      : leadCount > 0
        ? `You lead ${leadCount} of ${total} searches — here's where competitors are ahead.`
        : "Competitors are out-ranking you on these searches — the clearest place to gain ground.";

  return { rows, leadCount, total, headline };
}
