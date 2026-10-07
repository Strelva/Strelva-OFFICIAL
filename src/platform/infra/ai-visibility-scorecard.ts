/** Browser-safe scorecard contract shared by tenant and workspace surfaces. */
export interface AiVisibilityScorecard {
  /** The service/trade, for the owner-plain copy ("ask AI for a {service}"). */
  service: string;
  /** How many probed queries name the business. */
  mentionedCount: number;
  /** How many queries were actually probed this week (the honest denominator). */
  total: number;
  /** The queries you come up in — positive framing, listed as-is. */
  mentionedQueries: string[];
  /** Queries you newly appear in vs last week (the trend win). */
  newlyAppeared: string[];
  /** True when at least one AI answer was probed this week. */
  hasData: boolean;
  /** When the latest snapshot was checked (for a subtle "as of" note). */
  checkedAt: string | null;
}
