import { z } from "zod";
import { tool } from "ai";
import type { ChatToolDeps, ChatToolEntries } from "./chat-tool-deps";

// Tenant chat tools that read metrics, traffic, activity and suggestions.
// Part of buildTenantChatTools (./chat-tools.ts).

/** Metrics, traffic diagnosis, activity, and suggestions. */
export function insightChatTools(deps: ChatToolDeps): ChatToolEntries {
  const { tenant, sectionEnum } = deps;
  return {
    get_metrics: {
      capability: "get_metrics",
      def: tool({
        description: "Get site traffic metrics — page views, booking clicks, trends, and daily breakdown",
        inputSchema: z.object({}),
        execute: async () => {
          const { getClickCounts, getDailyMetrics } = await import("@/lib/storage");
          const [pageViews, bookingClicks, daily] = await Promise.all([
            getClickCounts("page-view", tenant),
            getClickCounts("booking-click", tenant),
            getDailyMetrics(tenant, 14),
          ]);
          const thisWeekViews = daily.slice(-7).reduce((s, d) => s + d.pageViews, 0);
          const lastWeekViews = daily.slice(-14, -7).reduce((s, d) => s + d.pageViews, 0);
          const viewsTrend = lastWeekViews > 0
            ? Math.round(((thisWeekViews - lastWeekViews) / lastWeekViews) * 100)
            : 0;
          return {
            pageViews,
            bookingClicks,
            trends: {
              viewsChangePercent: viewsTrend,
              direction: viewsTrend > 0 ? "up" : viewsTrend < 0 ? "down" : "flat",
            },
            sourceProof: "Source: Site activity, 14-day window",
          };
        },
      }),
    },
    explain_traffic: {
      capability: "explain_traffic",
      def: tool({
        description:
          "Diagnose why site traffic changed. Detects a meaningful drop or spike in the last week versus the prior three weeks and explains the likely why plus the single next move. Use when the owner asks 'why is traffic down?', 'what happened to my visitors?', or 'why the spike?'.",
        inputSchema: z.object({}),
        execute: async () => {
          const { getDailyMetrics } = await import("@/lib/storage");
          const { detectTrafficAnomaly } = await import("@/lib/anomaly");
          // detectTrafficAnomaly needs 7 recent + 21 baseline days to judge.
          const daily = await getDailyMetrics(tenant, 28);
          const anomaly = detectTrafficAnomaly(daily);
          if (!anomaly) {
            return {
              anomaly: null,
              headline: "Your traffic is holding steady",
              why: "No meaningful jump or drop in the last week versus your usual — nothing to diagnose right now.",
              sourceProof: "Source: Site activity, 28-day window",
            };
          }
          return {
            anomaly,
            headline: anomaly.headline,
            why: anomaly.why,
            suggestion: anomaly.suggestion,
            sourceProof: "Source: Site activity, 28-day window",
          };
        },
      }),
    },
    get_activity: {
      capability: "get_activity",
      def: tool({
        description: "Get recent site activity — changes, updates, and events",
        inputSchema: z.object({
          section: z.string().optional().describe("Filter by section name"),
        }),
        execute: async ({ section }) => {
          const { getActivity } = await import("@/lib/storage");
          const activity = await getActivity(tenant, section ? { section } : undefined);
          return {
            activity: activity.slice(0, 20),
            sourceProof: "Source: Site history stored in dashboard",
          };
        },
      }),
    },
    get_suggestions: {
      capability: "get_suggestions",
      def: tool({
        description:
          "List pending proactive suggestions for this website — the same 'what should I do next' cards the dashboard surfaces. Use when the owner asks 'what should I do?', 'any suggestions?', or 'what needs attention?'.",
        inputSchema: z.object({}),
        execute: async () => {
          const { getSuggestions } = await import("@/lib/suggestions");
          const suggestions = await getSuggestions(tenant);
          return {
            suggestions,
            count: suggestions.length,
            sourceProof: "Source: Proactive suggestions stored in dashboard",
          };
        },
      }),
    },
    create_suggestion: {
      capability: "create_suggestion",
      def: tool({
        description: "Create a proactive suggestion for the owner to review later.",
        inputSchema: z.object({
          type: z.enum(["stale", "missing", "growth", "engagement"]),
          title: z.string(),
          description: z.string(),
          action: z.string().describe("Use prompt:<owner-facing request> for chat-triggered suggestions."),
          section: sectionEnum.optional(),
        }),
        execute: async ({ type, title, description, action, section }) => {
          const { addSuggestion } = await import("@/lib/suggestions");
          return await addSuggestion({ tenantId: tenant, type, title, description, action, section });
        },
      }),
    },
  };
}
