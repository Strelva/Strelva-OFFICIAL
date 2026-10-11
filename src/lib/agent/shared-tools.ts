import { z } from "zod";
import { tool } from "ai";
import type { TenantConfig, SiteCapabilityManifest, ContentSection } from "../types";
import { GBP_OPERATIONS } from "./gbp-operations";
// Website documents (src/products/websites) through the port src/lib declares
// (Strelva Reborn section 7).
import { workspacePorts, type VerifiedActor } from "../workspace-ports";

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
  /**
   * Who approves the resulting draft. The client-chat route omits this (defaults
   * "owner" — the owner asked, so the owner approves). The proactive executor sets
   * "operator": Strelva-initiated changes are approved by the operator first and
   * only reach the client's queue if the operator escalates. High-risk facts stay
   * governed either way.
   */
  reviewAudience?: "operator" | "owner";
}

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
      const { addEvent } = await import("../events");
      const event = await addEvent({
        tenantId,
        source: "ai",
        type: "content_update",
        title: args.title,
        body: args.body.slice(0, 500),
        status: "pending",
        metadata: { ...args.metadata, reviewAudience: hooks.reviewAudience ?? "owner" },
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

  // Generate the tools from the operation registry (ontology Phase 3): each op is
  // defined ONCE in `agent/gbp-operations.ts` and its LLM tool is derived here, so
  // the two agent paths can't drift and the definition can't diverge from the tool.
  // The returned shape/keys are identical to the previous hand-written literals.
  return Object.fromEntries(
    GBP_OPERATIONS.map((op) => [
      op.id,
      tool({
        description: op.description,
        inputSchema: op.inputSchema,
        execute: (args) => queueDraft(op.id, op.toDraft(args)),
      }),
    ]),
  );
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
        const { getVersions } = await import("../storage");
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
        const { applySectionUpdate } = await import("../apply-section-update");
        const result = await applySectionUpdate({
          tenantId,
          section: section as ContentSection,
          data: target!.data as Record<string, unknown>,
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
        const message = `I've drafted a revert of your ${section} back to the earlier version. It'll go live once you approve it. Nothing changes on your site until then.`;
        const sourceProof = `Source: ${section} version history (restoring ${target!.id})`;
        hooks.onQueued?.(section, eventId, message, sourceProof);
        return {
          success: true,
          section,
          restoredFromVersionId: target!.id,
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

/** v2 website document tools share the same scoped service used by workspace
 * routes. Tenant permission at the chat route is necessary but not sufficient:
 * each execution also requires a verified actor with access to the saved work. */
export function buildSiteDocumentTools(input: {
  tenantId: string;
  actor: VerifiedActor | null;
  onResult?: (status: "queued" | "failed", message: string) => void;
}) {
  const selection = async () => {
    const { websiteRebuildReleaseMayBeOn, websiteRebuildReleasedFor } = await workspacePorts().websites();
    if (!websiteRebuildReleaseMayBeOn()) throw new Error("Website rebuilds are unavailable.");
    if (!input.actor) throw new Error("A verified signed-in account is required.");
    const { websiteDocumentStore } = await workspacePorts().websites();
    const published = await websiteDocumentStore.published(input.tenantId);
    if (!published) throw new Error("This tenant does not have a v2 website document.");
    // Per business under `workspace`: the published document's workspace row decides.
    if (!(await websiteRebuildReleasedFor(input.actor, published.workspaceId))) throw new Error("Website rebuilds are unavailable.");
    const { readWebsiteRebuild } = await workspacePorts().websites();
    const record = await readWebsiteRebuild(input.actor,published.workId);
    if (record.workspaceId !== published.workspaceId || record.rebuild.tenantId !== input.tenantId) throw new Error("Website scope changed. Reload before continuing.");
    return record;
  };
  return {
    read_site: tool({
      description: "Read v2 website pages, metadata, root IDs and stable node IDs. allPages lists the full site even when path selects one page. Use read_section for legacy websites.",
      inputSchema: z.object({ path: z.string().startsWith("/").max(512).optional() }).strict(),
      execute: async ({ path }) => {
        try { const record = await selection(); const { readSiteNodes } = await workspacePorts().websites(); if (!record.rebuild.candidate) return { error:"No website candidate is available." }; return { workId:record.workId,expectedRevision:record.rebuild.revision,candidateRevision:record.rebuild.candidate.revision,candidateContentHash:record.rebuild.candidate.contentHash,...readSiteNodes(record.rebuild.candidate.document,path) }; }
        catch { return { error:"This website document is unavailable to your account." }; }
      },
    }),
    patch_site: tool({
      description: "Draft RFC6902 /nodes and /pages entry patches on a v2 site. To add a page, add its catalog nodes and a /pages/- entry with path/title/description/root together. Read the site first and include its exact revision/hash. Page copy and navigation require owner review. Facts, assets, capabilities, theme and provenance are immutable.",
      inputSchema: z.object({ expectedRevision:z.number().int().nonnegative(),candidateRevision:z.number().int().positive(),candidateContentHash:z.string().regex(/^[a-f0-9]{64}$/),ops:z.array(z.object({op:z.enum(["add","remove","replace","test","move","copy"]),path:z.string().max(500).regex(/^\/(?:nodes\/[^/]+|pages\/(?:0|[1-9]\d*|-))(?:\/.*)?$/),from:z.string().max(500).regex(/^\/(?:nodes\/[^/]+|pages\/(?:0|[1-9]\d*|-))(?:\/.*)?$/).optional(),value:z.unknown().optional()}).strict()).min(1).max(100) }).strict(),
      execute: async (patch) => {
        try { const record = await selection(); const { patchWebsiteRebuild } = await workspacePorts().websites(); await patchWebsiteRebuild(input.actor!,record.workId,{...patch,forceReview:true}); const message="Website changes are saved as a new revision for owner review."; input.onResult?.("queued",message); return { success:true,agentResultStatus:"queued" as const,message,workId:record.workId }; }
        catch { const message="The website patch could not be confirmed. Read the current site before retrying."; input.onResult?.("failed",message); return { success:false,agentResultStatus:"failed" as const,error:message }; }
      },
    }),
  };
}
