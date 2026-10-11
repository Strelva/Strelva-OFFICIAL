import { z } from "zod";
import { tool } from "ai";
import type { ChatToolDeps, ChatToolEntries } from "./chat-tool-deps";

// Tenant chat tools that hide, show and reorder site sections.
// Part of buildTenantChatTools (./chat-tools.ts).

/** Section visibility and order. */
export function layoutChatTools(deps: ChatToolDeps): ChatToolEntries {
  const { tenant, sectionEnum, recordActionResult } = deps;
  return {
    toggle_section_visibility: {
      capability: "read_section",
      def: tool({
        description: "Toggle a section's visibility on the public site. Hidden sections keep their content but don't render.",
        inputSchema: z.object({
          section: sectionEnum,
          visible: z.boolean().describe("true to show, false to hide"),
          page: z.string().optional().describe("Page slug (default: home)"),
        }),
        execute: async ({ section, visible, page }) => {
          try {
            const { addEvent } = await import("@/lib/events");
            const { getPageConfig } = await import("@/lib/storage");
            const pageSlug = page || "home";
            const config = await getPageConfig(tenant);
            if (!config || !config[pageSlug]) {
              return { success: false, error: `Page "${pageSlug}" not found in config` };
            }
            if (!config[pageSlug].sections.some((s) => s.type === section)) {
              return { success: false, error: `Section "${section}" not found on page "${pageSlug}"` };
            }
            const event = await addEvent({
              tenantId: tenant,
              source: "ai",
              type: "content_update",
              title: `AI requested ${section} visibility change`,
              body: `${section} should be ${visible ? "shown" : "hidden"} on ${pageSlug}.`,
              status: "pending",
              metadata: {
                kind: "manual_structural_change",
                page: pageSlug,
                section,
                visible,
                governanceReason: "Section visibility is a structural site change and requires manual admin review.",
              },
            });
            recordActionResult({
              status: "queued",
              sectionIds: [section],
              eventIds: [event.id],
              message: "Section visibility change queued for review.",
              sourceProof: "Source: Page layout config and AI governance rules",
            });
            return {
              success: false,
              blocked: true,
              section,
              sectionIds: [section],
              eventId: event.id,
              eventIds: [event.id],
              agentResultStatus: "queued" as const,
              message: "I sent that layout change to the review queue. Structural site changes require approval before they go live.",
              sourceProof: "Source: Page layout config and AI governance rules",
            };
          } catch (err) {
            const error = err instanceof Error ? err.message : "Failed";
            recordActionResult({ status: "failed", sectionIds: [section], error });
            return { success: false, error, section, agentResultStatus: "failed" as const };
          }
        },
      }),
    },
    reorder_sections: {
      capability: "read_section",
      def: tool({
        description: "Request a section reorder for admin review. Structural layout changes do not publish directly.",
        inputSchema: z.object({
          page: z.string().optional().describe("Page slug (default: home)"),
          order: z.array(z.string()).describe("Section types in desired order, e.g. ['hero', 'services', 'story']"),
        }),
        execute: async ({ page, order }) => {
          try {
            const { addEvent } = await import("@/lib/events");
            const { getPageConfig } = await import("@/lib/storage");
            const config = await getPageConfig(tenant);
            const pageSlug = page || "home";
            if (!config || !config[pageSlug]) {
              return { success: false, error: `Page "${pageSlug}" not found in config` };
            }
            const pageTypes = new Set(config[pageSlug].sections.map((s) => s.type));
            const unknown = order.filter((sectionType) => !pageTypes.has(sectionType));
            if (unknown.length > 0) {
              return { success: false, error: `Unknown section(s) for ${pageSlug}: ${unknown.join(", ")}` };
            }
            const event = await addEvent({
              tenantId: tenant,
              source: "ai",
              type: "content_update",
              title: `AI requested section reorder`,
              body: `Requested ${pageSlug} order: ${order.join(", ")}`,
              status: "pending",
              metadata: {
                kind: "manual_structural_change",
                page: pageSlug,
                order,
                governanceReason: "Section order is a structural site change and requires manual admin review.",
              },
            });
            recordActionResult({
              status: "queued",
              sectionIds: order,
              eventIds: [event.id],
              message: "Section reorder queued for review.",
              sourceProof: "Source: Page layout config and AI governance rules",
            });
            return {
              success: false,
              blocked: true,
              sectionIds: order,
              eventId: event.id,
              eventIds: [event.id],
              agentResultStatus: "queued" as const,
              message: "I sent that layout change to the review queue. Structural site changes require approval before they go live.",
              sourceProof: "Source: Page layout config and AI governance rules",
            };
          } catch (err) {
            const error = err instanceof Error ? err.message : "Failed";
            recordActionResult({ status: "failed", error });
            return { success: false, error, agentResultStatus: "failed" as const };
          }
        },
      }),
    },
  };
}
