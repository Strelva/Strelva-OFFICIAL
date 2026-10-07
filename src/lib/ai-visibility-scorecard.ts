import type { AiVisibilityScorecard } from "@/platform/infra/ai-visibility-scorecard";
import type { VisibilitySnapshot } from "./visibility/snapshots";

// Preserve the tenant entry point while workspace consumers use the shared contract.
export type { AiVisibilityScorecard } from "@/platform/infra/ai-visibility-scorecard";

/**
 * "You in AI answers" scorecard — the owner-facing view of the AI-search
 * visibility wedge. Strelva probes weekly whether AI assistants (ChatGPT-style
 * answers, via the Gemini probe) name the business when someone asks for a local
 * recommendation. This turns that already-collected snapshot data into a plain,
 * positive owner scorecard — zero new collection.
 *
 * Honesty rails (match the rest of the visibility system):
 *  - Only PROBED answers count. An unprobed query (no API key / error) is never
 *    counted as "not mentioned" — it simply isn't in the total.
 *  - Only positive, real signals surface. We list the queries you DO come up in;
 *    we never shame the ones you don't (they're omitted, not marked "missing").
 *  - "New this week" is only claimed when a prior snapshot exists AND the query
 *    was probed-and-absent last week — never on a first-ever probe.
 */

export function buildAiVisibilityScorecard(
  latest: VisibilitySnapshot | null,
  previous: VisibilitySnapshot | null
): AiVisibilityScorecard | null {
  // No snapshot at all → not tracking yet. Return null so the surface renders
  // nothing rather than promising a check we haven't started.
  if (!latest) return null;

  const probed = (latest.aiResults ?? []).filter((r) => r.probed);
  const mentioned = probed.filter((r) => r.tenantMentioned);

  // Previous week's mentions, keyed by query — only probed answers are truth.
  const prevMentioned = new Set(
    (previous?.aiResults ?? [])
      .filter((r) => r.probed && r.tenantMentioned)
      .map((r) => r.query)
  );
  const prevProbed = new Set(
    (previous?.aiResults ?? []).filter((r) => r.probed).map((r) => r.query)
  );

  // "New this week" requires a real prior read that was probed-and-absent — never
  // a first-ever appearance (that would over-claim a trend on the first snapshot).
  const newlyAppeared = previous
    ? mentioned
        .filter((r) => prevProbed.has(r.query) && !prevMentioned.has(r.query))
        .map((r) => r.query)
    : [];

  return {
    service: latest.trade,
    mentionedCount: mentioned.length,
    total: probed.length,
    mentionedQueries: mentioned.map((r) => r.query),
    newlyAppeared,
    hasData: probed.length > 0,
    checkedAt: latest.checkedAt ?? null,
  };
}
