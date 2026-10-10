import { z } from "zod";
import { tool } from "ai";
import type { TenantConfig } from "../types";
import type { RawTenantConnectionSettings } from "../integration-registry";
import type { ChatToolDeps, ChatToolEntries } from "./chat-tool-deps";

// Inline display tools: structured JSON the chat renders as rich cards.
// Part of buildTenantChatTools (./chat-tools.ts).

function tenantConnectionSettings(config: TenantConfig | null | undefined): RawTenantConnectionSettings {
  return {
    googleSearchConsole: !!config?.googleSearchConsoleKey,
    newsletter: !!config?.resendDomain,
    googleBusiness: !!config?.reviewsConfig?.googlePlaceId,
    instagram: !!(config?.instagramAccessToken || config?.beholdFeedId),
    calendly: !!config?.bookingUrl,
    yelp: !!config?.reviewsConfig?.yelpBusinessId,
  };
}

function formatSourceDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Report, content, photos, connections, and site preview cards. */
export function displayChatTools(deps: ChatToolDeps): ChatToolEntries {
  const { tenant, mods: { getTemplateManifestForTenant, getTenantConfig, getConnections, tenantSiteHost, DISCOVERABLE_INTEGRATIONS, deriveIntelligenceStatus, getIntegrationCategories, normalizeIntegrationStatus } } = deps;
  return {
    // ─────────────────────────────────────────────────────────────
    // INLINE DISPLAY TOOLS — return structured JSON for rich rendering
    // ─────────────────────────────────────────────────────────────
    show_report: {
      capability: "show_report",
      def: tool({
        description: "Show the weekly performance report inline in the chat. Use when user asks 'how is my site doing?', 'show my report', 'what are my stats?', etc.",
        inputSchema: z.object({}),
        execute: async () => {
          const { getClickCounts, getDailyMetrics, getContent } = await import("@/lib/storage");
          const [pageViews, bookingClicks, daily, settings] = await Promise.all([
            getClickCounts("page-view", tenant),
            getClickCounts("booking-click", tenant),
            getDailyMetrics(tenant, 14),
            getContent("settings", tenant),
          ]);

          // Calculate trend
          const thisWeekViews = daily.slice(-7).reduce((s, d) => s + d.pageViews, 0);
          const lastWeekViews = daily.slice(-14, -7).reduce((s, d) => s + d.pageViews, 0);
          const trendPercent = lastWeekViews > 0
            ? Math.round(((thisWeekViews - lastWeekViews) / lastWeekViews) * 100)
            : 0;

          // Calculate site score (sections with content / total sections * 100)
          const templateDef = await getTemplateManifestForTenant(tenant);
          const { mapPool } = await import("@/lib/concurrency");
          const sectionsWithContent = await mapPool(
            templateDef.contentSections,
            3,
            async (s) => {
              const data = await getContent(s, tenant);
              return data && Object.keys(data).length > 0 ? 1 : 0;
            }
          );
          const siteScore = Math.round((sectionsWithContent.reduce<number>((a, b) => a + b, 0) / templateDef.contentSections.length) * 100);

          // Week label
          const weekStart = new Date();
          weekStart.setDate(weekStart.getDate() - weekStart.getDay());
          const weekLabel = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });

          return {
            __inlineTool: "show_report",
            siteName: (settings?.siteName as string) || "Your site",
            pageViews: {
              total: pageViews.total,
              thisWeek: pageViews.thisWeek,
              today: pageViews.today,
            },
            bookingClicks: {
              total: bookingClicks.total,
              thisWeek: bookingClicks.thisWeek,
              today: bookingClicks.today,
            },
            siteScore,
            trend: {
              direction: trendPercent > 0 ? "up" : trendPercent < 0 ? "down" : "flat",
              percent: Math.abs(trendPercent),
            },
            weekLabel,
          };
        },
      }),
    },
    show_content: {
      capability: "show_content",
      def: tool({
        description: "Show the site content structure inline in the chat. Use when user asks 'show my content', 'what's on my site?', 'list my sections', etc.",
        inputSchema: z.object({}),
        execute: async () => {
          const { getContent, getPageConfig } = await import("@/lib/storage");
          const { SECTION_LABELS } = await import("@/components/ui/section-labels");
          const templateDef = await getTemplateManifestForTenant(tenant);
          const pageConfig = await getPageConfig(tenant);

          // Build pages array with sections
          const pages: Array<{
            slug: string;
            label: string;
            sections: Array<{
              type: string;
              label: string;
              status: "live" | "empty" | "configured";
              itemCount?: number;
              visible: boolean;
            }>;
          }> = [];

          const pageLabels: Record<string, string> = { home: "Home", about: "About", contact: "Contact" };
          const pageSlugs = pageConfig ? Object.keys(pageConfig) : ["home"];

          for (const slug of pageSlugs) {
            const pageCfg = pageConfig?.[slug];
            const sectionTypes = pageCfg?.sections.map((s) => s.type) || templateDef.contentSections;

            const sections = await Promise.all(
              sectionTypes.map(async (type) => {
                const data = await getContent(type as Parameters<typeof getContent>[0], tenant);
                const cfg = pageCfg?.sections.find((s) => s.type === type);
                const hasContent = data && Object.keys(data).length > 0;

                // Count items for array-based sections
                let itemCount: number | undefined;
                if (data) {
                  const arrayKeys = ["services", "products", "events", "testimonials", "providers", "faqs", "items"];
                  for (const key of arrayKeys) {
                    if (Array.isArray((data as unknown as Record<string, unknown>)[key])) {
                      itemCount = ((data as unknown as Record<string, unknown>)[key] as unknown[]).length;
                      break;
                    }
                  }
                }

                return {
                  type,
                  label: SECTION_LABELS[type] || type,
                  status: hasContent ? "live" as const : "empty" as const,
                  itemCount,
                  visible: cfg?.visible !== false,
                };
              })
            );

            pages.push({
              slug,
              label: pageLabels[slug] || slug.charAt(0).toUpperCase() + slug.slice(1),
              sections,
            });
          }

          return {
            __inlineTool: "show_content",
            pages,
          };
        },
      }),
    },
    show_photos: {
      capability: "show_photos",
      def: tool({
        description: "Show the photo library inline in the chat. Use when user asks 'show my photos', 'what photos do I have?', 'show my images', etc.",
        inputSchema: z.object({}),
        execute: async () => {
          try {
            const { listTenantMedia } = await import("@/lib/media-store");
            // Preview card: 6 photos + a count — cap the read instead of
            // enumerating the whole library (old path capped at 20).
            const assets = await listTenantMedia(tenant, { limit: 24 });

            return {
              __inlineTool: "show_photos",
              photos: assets.slice(0, 6).map((a) => ({
                id: a.id,
                url: a.url,
                filename: a.filename,
              })),
              total: assets.length,
            };
          } catch (err) {
            return { error: `Failed to load photos: ${err instanceof Error ? err.message : "Unknown error"}` };
          }
        },
      }),
    },
    show_connections: {
      capability: "show_connections",
      def: tool({
        description: "Show the integration/connections status inline in the chat. Use when user asks 'show my connections', 'what's connected?', 'show integrations', etc.",
        inputSchema: z.object({}),
        execute: async () => {
          const config = await getTenantConfig(tenant);
          const savedConnections = await getConnections(tenant);
          const settings = tenantConnectionSettings(config);
          const providerStatuses = new Map(savedConnections.map((connection) => [connection.provider, connection]));

          const connections = DISCOVERABLE_INTEGRATIONS.map((integration) => {
            const rawConnection = integration.connectionProvider
              ? providerStatuses.get(integration.connectionProvider) ?? null
              : null;
            const technicalStatus = normalizeIntegrationStatus(integration, {
              connection: rawConnection,
              settings,
              connectionLoaded: true,
              settingsLoaded: true,
            });
            const intelligenceStatus = deriveIntelligenceStatus(integration, technicalStatus);
            const lastUpdated = rawConnection?.lastSyncedAt ?? null;

            return {
              id: integration.id,
              name: integration.displayName,
              icon: integration.icon,
              connected: technicalStatus === "connected" || integration.builtIn === true,
              status: intelligenceStatus,
              technicalStatus,
              category: integration.intelligenceCategory,
              categories: getIntegrationCategories(integration),
              description: integration.addsIntelligence,
              addsIntelligence: integration.addsIntelligence,
              actionPaths: integration.actionPaths ?? [],
              appearsIn: integration.appearsIn,
              lastSyncedAt: lastUpdated,
              sourceProof: lastUpdated
                ? `Source: ${integration.displayName}, last updated ${formatSourceDate(lastUpdated) ?? "recently"}`
                : integration.builtIn
                  ? `Source: ${integration.displayName} stored in dashboard`
                  : undefined,
            };
          });

          return {
            __inlineTool: "show_connections",
            connections,
            summary:
              "Connections are the AI intelligence layer: each source adds context, signal, or an approval-gated action path.",
          };
        },
      }),
    },
    preview_site: {
      capability: "preview_site",
      def: tool({
        description: "Show a preview of the live site inline in the chat. Use when user asks 'show my site', 'preview my website', 'what does my site look like?', etc.",
        inputSchema: z.object({}),
        execute: async () => {
          const config = await getTenantConfig(tenant);
          const { getContent } = await import("@/lib/storage");
          const settings = await getContent("settings", tenant);

          // Build the site URL
          const domain = config?.productionDomain || tenantSiteHost(tenant);
          const url = `https://${domain}`;

          return {
            __inlineTool: "preview_site",
            url,
            siteName: (settings?.siteName as string) || tenant,
          };
        },
      }),
    },
  };
}
