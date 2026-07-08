import { z } from "zod";
import { tool } from "ai";
import type { TenantConfig, SiteCapabilityManifest, ContentSection } from "./types";

/**
 * Shared AI-agent gates. The agent runs through two entry points — the streaming chat
 * route (`src/app/api/agent/route.ts`) and the background executor
 * (`src/lib/agent-executor.ts`, invoked when an owner approves a suggestion in
 * `event-actions.ts`). These gates MUST behave identically across both paths, so they
 * live here once instead of being copied. They had drifted: the executor was skipping
 * BOTH the manifest gate and the GBP gate.
 */

/**
 * Whether the agent may draft Google Business writes for this tenant: the business must
 * be local/hybrid, have a connected Google account, and that connection must carry the
 * GBP write scope. Lifted verbatim from the streaming route so both paths gate the same
 * way. (The lib write functions still re-check scope at approval time — belt-and-suspenders.)
 */
export async function resolveGbpWriteAllowed(
  tenant: string,
  tenantConfig: TenantConfig | null | undefined,
): Promise<boolean> {
  const { getPresenceProfile } = await import("./dashboard-surfaces");
  const { getContent } = await import("./storage");
  const settings = (await getContent("settings", tenant).catch(() => null)) as
    | { businessModel?: string }
    | null;
  const presence = getPresenceProfile({
    template: tenantConfig?.template ?? "",
    businessModel: settings?.businessModel,
  });
  if (presence === "online") return false;
  const { getConnections } = await import("./connections");
  const connections = await getConnections(tenant);
  const google = Array.isArray(connections)
    ? connections.find((c) => c.provider === "google" && c.status === "connected")
    : undefined;
  if (!google) return false;
  const { connectionHasWriteScope } = await import("./gbp-replies");
  return connectionHasWriteScope(google.scopes);
}

/**
 * The sections the agent may edit for this site, plus the matching Zod enum for tool
 * inputs. Two inputs decide the set:
 *
 *  - the template's built-in `contentSections` (the platform default), and
 *  - the site capability manifest, which a custom repo can publish (B4) to declare
 *    the sections its LIVE site actually renders — including sections the template
 *    doesn't list.
 *
 * A section is editable unless the manifest explicitly disallows "draft". The base is
 * the template's content sections, PLUS any extra sections the manifest declares that
 * the template doesn't have — so the agent edits what the live custom site renders,
 * not just the template's built-in list. Component render-keys (Header/Footer/section
 * components) are NOT editable content sections and are excluded; and for a tenant with
 * no remote manifest the default manifest declares no extras, so this is a no-op there.
 * Falls back to the full template list when the filter would leave nothing. Lifted from
 * the streaming route so both agent paths constrain the model to the same sections.
 * (The manifest is also passed into `applySectionUpdate` to gate publish; this enum just
 * keeps the model from targeting a forbidden section.)
 */
export function resolveEditableSections(
  template: { contentSections: string[]; components?: Record<string, unknown> },
  siteManifest: SiteCapabilityManifest,
) {
  const draftable = (section: string) =>
    siteManifest.sections[section]?.allowedActions?.includes("draft") !== false;

  const templateSet = new Set(template.contentSections);
  const componentKeys = new Set(Object.keys(template.components ?? {}));

  const fromTemplate = template.contentSections.filter(draftable);
  // Sections a custom repo declared via its remote manifest that the template
  // doesn't list. Component render-keys are excluded — they aren't content.
  const declaredExtras = Object.keys(siteManifest.sections).filter(
    (section) => !templateSet.has(section) && !componentKeys.has(section) && draftable(section),
  );

  const agentEditableSections = [...fromTemplate, ...declaredExtras];
  const sectionEnum = z.enum(
    (agentEditableSections.length > 0 ? agentEditableSections : template.contentSections) as [
      string,
      ...string[],
    ],
  );
  return { agentEditableSections, sectionEnum };
}

/**
 * The three Google Business Profile write tools, defined ONCE (B6). Both agent
 * paths — the streaming chat route and the background executor — used to hand-roll
 * their own copies, which drifted: the executor was missing `upload_gbp_photo`
 * entirely and its `create_gbp_post` schema/metadata differed from the route's.
 *
 * Every tool is governed identically: it NEVER writes to Google, it queues a
 * `status:"pending"` event (`metadata.kind` = `gbp_post_draft` / `gbp_hours_draft`
 * / `gbp_photo_draft`); the real write happens on owner approval in
 * `event-actions.ts`. The only per-path difference is the SIDE EFFECT after
 * queuing — the route records a streamed result card, the executor pings Slack —
 * so each path passes its own `onQueued`/`onError` hooks.
 */
export interface GbpToolHooks {
  tenantId: string;
  /** Fired after a draft event is queued (route → result card, executor → Slack). */
  onQueued: (toolName: string, eventId: string, message: string) => void | Promise<void>;
  /** Fired when queuing failed. Optional — the executor just lets it surface. */
  onError?: (toolName: string, error: string) => void | Promise<void>;
}

const GBP_DAY = z.enum([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
]);

const GBP_PHOTO_CATEGORY = z.enum([
  "COVER",
  "PROFILE",
  "LOGO",
  "EXTERIOR",
  "INTERIOR",
  "PRODUCT",
  "AT_WORK",
  "FOOD_AND_DRINK",
  "MENU",
  "ADDITIONAL",
]);

export function buildGbpTools(hooks: GbpToolHooks) {
  const { tenantId } = hooks;

  // Shared drafting spine: queue the pending event, run the path's side effect,
  // return the canonical tool result. Any failure returns a failed result (and
  // runs onError) rather than throwing — both paths report it the same way.
  async function queueDraft(
    toolName: string,
    args: { title: string; body: string; metadata: Record<string, unknown>; message: string },
  ) {
    try {
      const { addEvent } = await import("./events");
      const event = await addEvent({
        tenantId,
        source: "ai",
        type: "content_update",
        title: args.title,
        body: args.body.slice(0, 500),
        status: "pending",
        metadata: args.metadata,
      });
      await hooks.onQueued(toolName, event.id, args.message);
      return {
        success: true,
        eventId: event.id,
        agentResultStatus: "queued" as const,
        message: args.message,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : "Failed to draft";
      await hooks.onError?.(toolName, error);
      return { success: false, error, agentResultStatus: "failed" as const };
    }
  }

  return {
    create_gbp_post: tool({
      description:
        "Draft a Google Business post (a 'What's new' update on the Google listing) for an offer, " +
        "update, or announcement. Creates a draft the owner must APPROVE before it publishes to " +
        "Google — never posts directly. Keep the summary under 1500 characters.",
      inputSchema: z.object({
        summary: z.string().max(1500).describe("The post text (up to 1500 characters)"),
        ctaUrl: z.string().url().optional().describe("Optional call-to-action link"),
        photoUrl: z.string().url().optional().describe("Optional public photo URL to include"),
      }),
      execute: ({ summary, ctaUrl, photoUrl }) =>
        queueDraft("create_gbp_post", {
          title: "Google post draft",
          body: summary,
          metadata: { kind: "gbp_post_draft", summary, ctaUrl, photoUrl },
          message: "Google post drafted — it will publish to your listing once approved.",
        }),
    }),

    update_business_hours: tool({
      description:
        "Draft an update to the business hours on the Google listing. Creates a draft the owner must " +
        "APPROVE before it publishes to Google — never updates directly. Give each open day's " +
        "open/close in 24-hour HH:MM. Confirm the correct hours with the owner before calling this.",
      inputSchema: z.object({
        hours: z
          .array(
            z.object({
              day: GBP_DAY,
              open: z.string().describe("Opening time, 24h HH:MM, e.g. 09:00"),
              close: z.string().describe("Closing time, 24h HH:MM, e.g. 17:00"),
            }),
          )
          .describe("One entry per open day"),
      }),
      execute: ({ hours }) =>
        queueDraft("update_business_hours", {
          title: "Google hours update",
          body: hours.map((h) => `${h.day}: ${h.open}-${h.close}`).join("\n"),
          metadata: { kind: "gbp_hours_draft", hours },
          message: "Hours update drafted — it will publish to Google once approved.",
        }),
    }),

    upload_gbp_photo: tool({
      description:
        "Draft a photo to add to the Google Business listing (exterior, interior, product, cover, " +
        "etc.). Creates a draft the owner must APPROVE before it publishes to Google — never uploads " +
        "directly. Provide a hosted image URL (use upload_image first if the owner shared a file).",
      inputSchema: z.object({
        photoUrl: z.string().describe("Public URL of the image to add to the Google listing"),
        category: GBP_PHOTO_CATEGORY.optional().describe(
          "Which section of the Google profile the photo belongs in (default ADDITIONAL)",
        ),
      }),
      execute: ({ photoUrl, category }) => {
        const chosenCategory = category ?? "ADDITIONAL";
        return queueDraft("upload_gbp_photo", {
          title: "Google photo upload",
          body: `Add photo to Google listing (${chosenCategory}): ${photoUrl}`,
          metadata: { kind: "gbp_photo_draft", photoUrl, category: chosenCategory },
          message: "Photo drafted — it will be added to your Google listing once approved.",
        });
      },
    }),
  };
}

/**
 * The `undo_last_change` tool, defined ONCE (B6). The version-resolution +
 * governed re-apply logic is the bug-prone core; hand-rolling it in both agent
 * paths is the exact drift this factory prevents. A revert is a real change: it
 * drafts the restore through the SAME `applySectionUpdate` path as any edit with
 * `forceReview: true`, so it is ALWAYS owner-approved and never auto-published.
 * Each path injects its own side effects (route → streamed result card, executor
 * → Slack); the tool's return shape is canonical so both paths agree.
 */
export interface UndoToolHooks {
  tenantId: string;
  tenantConfig: TenantConfig | null | undefined;
  siteManifest: SiteCapabilityManifest;
  /** The section enum from resolveEditableSections — each path passes its own. */
  sectionEnum: z.ZodTypeAny;
  onNoOp?: (section: string, message: string) => void;
  onFailed?: (section: string, error: string) => void;
  onBlocked?: (section: string, message: string) => void;
  onQueued?: (section: string, eventId: string | undefined, message: string, sourceProof: string) => void;
}

export function buildUndoTool(hooks: UndoToolHooks) {
  const { tenantId, tenantConfig, siteManifest, sectionEnum } = hooks;
  return tool({
    description:
      "Undo the most recent change to a website section, or restore a specific earlier version by id. " +
      'Use when the owner says things like "undo that", "revert", or "put it back the way it was". A ' +
      "revert is a real change: it drafts the restore and routes it through the SAME approval queue as " +
      "any edit — it never publishes to the live site on its own. Read/identify the section first.",
    inputSchema: z.object({
      section: sectionEnum,
      versionId: z
        .string()
        .optional()
        .describe(
          "Optional: restore this specific earlier version id (from the section's history) instead of undoing only the last change.",
        ),
    }),
    execute: async (input) => {
      // sectionEnum is a generic Zod schema here (z.ZodTypeAny), so the input
      // infers as unknown; at runtime the enum constrains section to a valid
      // string and versionId to an optional string.
      const section = input.section as string;
      const versionId = input.versionId as string | undefined;
      try {
        const { getVersions } = await import("./storage");
        // Newest-first: versions[0] is the current live content (the most recent
        // change); versions[1] is what it looked like before it.
        const versions = await getVersions(section as ContentSection, tenantId);

        let target: (typeof versions)[number] | undefined;
        if (versionId) {
          target = versions.find((v) => v.id === versionId);
          if (!target) {
            const message = `I couldn't find that saved version of your ${section} to restore.`;
            hooks.onNoOp?.(section, message);
            return { success: false, section, nothingToUndo: true, message, agentResultStatus: "no-op" as const };
          }
        } else {
          if (versions.length < 2) {
            const message = `There's no earlier version of your ${section} to go back to yet.`;
            hooks.onNoOp?.(section, message);
            return { success: false, section, nothingToUndo: true, message, agentResultStatus: "no-op" as const };
          }
          target = versions[1];
        }

        // Draft the revert through the SAME governed content path as
        // update_section, forcing the review queue so an undo is always
        // owner-approved before it goes live (never auto-published).
        const { applySectionUpdate } = await import("./apply-section-update");
        const result = await applySectionUpdate({
          tenantId,
          section: section as ContentSection,
          data: target.data as Record<string, unknown>,
          tenantConfig: tenantConfig ?? null,
          siteManifest,
          forceReview: true,
        });

        if (result.status === "failed") {
          hooks.onFailed?.(section, result.error);
          return { success: false, error: result.error, section, agentResultStatus: "failed" as const };
        }
        if (result.status === "blocked") {
          hooks.onBlocked?.(section, result.message);
          return {
            success: false,
            blocked: true,
            section,
            message: result.message,
            reason: result.reason,
            agentResultStatus: "blocked" as const,
            risk: result.risk,
            diffs: result.diffs,
          };
        }

        // forceReview guarantees the queued branch; the published arm is
        // defensive so the shape stays coherent if governance ever changes.
        const eventId = result.status === "queued" ? result.eventId : undefined;
        const message = `I've drafted a revert of your ${section} back to the earlier version. It'll go live once you approve it — nothing changes on your site until then.`;
        const sourceProof = `Source: ${section} version history (restoring ${target.id})`;
        hooks.onQueued?.(section, eventId, message, sourceProof);
        return {
          success: true,
          section,
          restoredFromVersionId: target.id,
          eventId,
          eventIds: eventId ? [eventId] : undefined,
          governance: result.governance,
          risk: result.risk,
          diffs: result.diffs,
          applied: false,
          agentResultStatus: "queued" as const,
          message,
          sourceProof,
        };
      } catch (err) {
        const error = `Failed to undo ${section}: ${err instanceof Error ? err.message : "Unknown error"}`;
        hooks.onFailed?.(section, error);
        return { success: false, error, section, agentResultStatus: "failed" as const };
      }
    },
  });
}
