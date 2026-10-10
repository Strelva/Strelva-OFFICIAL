import type { Tool } from "ai";
import type { TenantConfig, SiteCapabilityManifest } from "../types";
import type { VerifiedActor } from "../workspace-ports";
import type { resolveEditableSections } from "../agent-shared";
import { buildGbpTools, buildUndoTool, buildSiteDocumentTools } from "./shared-tools";
import { loadChatToolModules, type ChatToolDeps, type ChatToolEntries } from "./chat-tool-deps";
import { contentChatTools, collectionChatTools } from "./chat-tools-content";
import { insightChatTools } from "./chat-tools-insights";
import { marketingChatTools, reviewReplyChatTools } from "./chat-tools-marketing";
import { layoutChatTools } from "./chat-tools-layout";
import { displayChatTools } from "./chat-tools-display";

// ─────────────────────────────────────────────────────────────────────────────
// The chat tool set, defined ONCE (AGENTS.md "one set of agent tools"; Ask
// Strelva spec section 5). These bodies used to live inline in
// src/app/api/agent/route.ts. The tenant chat route and the workspace Ask
// Strelva route both build their tools here, so the two can't drift.
// ─────────────────────────────────────────────────────────────────────────────

/** A refusal from the per-call authority re-check. */
export interface AskToolRefusal {
  refused: true;
  message: string;
  reason: string;
}

export interface AskToolContext {
  /** Tenant slug the tools act on. Resolved by the caller (tenant host, or workspace link). */
  tenantId: string;
  tenantConfig: TenantConfig | null | undefined;
  siteManifest: SiteCapabilityManifest;
  /** From resolveEditableSections. */
  sectionEnum: ReturnType<typeof resolveEditableSections>["sectionEnum"];
  /** Verified signed-in actor, for the v2 website document tools. */
  actor: VerifiedActor | null;
  /** Whether the Google Business write tools may be offered (resolveGbpWriteAllowed). */
  gbpWriteAllowed: boolean;
  /** Result hook: each tool reports what it drafted, queued or refused. */
  onResult: (result: import("../agent-results").AgentActionResult) => void;
  /**
   * Re-check authority right before a tool runs (Ask Strelva spec section 4).
   * Returning a refusal stops that one tool; earlier results stand. The tenant
   * chat route passes none: it checks tenant permission once per turn.
   */
  recheck?: (toolName: string) => Promise<AskToolRefusal | null>;
  /** Route every section edit to review, never auto-publish (Ask Strelva: drafts go to Needs you). */
  forceReview?: boolean;
}

/** The tool names the tenant chat surface offers, in catalog order. */
export const TENANT_CHAT_GBP_WRITE_TOOLS = new Set(["create_gbp_post", "update_business_hours", "upload_gbp_photo"]);

/** The tool-call status line shown in chat while a tool runs. */
export function chatToolLabel(toolName: string, section?: string): string {
  return (
              toolName === "read_section" ? `Reading your ${section || "content"}...` :
              toolName === "update_section" ? `Updating your ${section || "content"}...` :
              toolName === "undo_last_change" ? `Drafting an undo of your ${section || "content"}...` :
              toolName === "upload_image" ? "Uploading image..." :
              toolName === "get_metrics" ? "Checking your metrics..." :
              toolName === "explain_traffic" ? "Diagnosing your traffic..." :
              toolName === "get_activity" ? "Looking at recent activity..." :
              toolName === "get_suggestions" ? "Checking your suggestions..." :
              toolName === "create_suggestion" ? "Saving a suggestion..." :
              toolName === "draft_newsletter" ? "Drafting newsletter..." :
              toolName === "list_subscribers" ? "Checking subscribers..." :
              toolName === "create_gbp_post" ? "Drafting a Google post..." :
              toolName === "update_business_hours" ? "Drafting your hours update..." :
              toolName === "upload_gbp_photo" ? "Drafting a photo for your listing..." :
              toolName === "draft_social_post" ? "Drafting social post..." :
              toolName === "list_social_posts" ? "Checking social posts..." :
              toolName === "get_reviews" ? "Checking your reviews..." :
              toolName === "reply_to_review" ? "Drafting review reply..." :
              toolName === "toggle_section_visibility" ? "Updating section visibility..." :
              toolName === "reorder_sections" ? "Reordering sections..." :
              toolName === "show_report" ? "Loading your report..." :
              toolName === "show_content" ? "Loading site content..." :
              toolName === "show_photos" ? "Loading photos..." :
              toolName === "show_connections" ? "Checking connections..." :
              toolName === "preview_site" ? "Loading site preview..." :
              "Working on it..."
  );
}


/**
 * Build the tenant chat tools for one turn. Every tool body is the one that
 * used to sit inline in the chat route, unchanged; `ctx.recheck` (when given)
 * runs before each execution.
 */
export async function buildTenantChatTools(ctx: AskToolContext): Promise<Record<string, Tool>> {
  const tenant = ctx.tenantId;
  const { siteManifest, sectionEnum } = ctx;
  const tenantConfig = ctx.tenantConfig ?? undefined;
  const recordActionResult = ctx.onResult;
  const mods = await loadChatToolModules();

  // GBP write tools — shared definitions with the background executor (B6) so the
  // two agent paths can't drift. This path's side effect on queuing is a streamed
  // result card via recordActionResult.
  const gbpTools = buildGbpTools({
    tenantId: tenant,
    onQueued: (_toolName, eventId, message) =>
      recordActionResult({ status: "queued", eventIds: [eventId], message }),
    onError: (_toolName, error) => recordActionResult({ status: "failed", error }),
  });

  // undo_last_change — shared definition with the executor (B6). Streamed side
  // effects per outcome via recordActionResult.
  const undoTool = buildUndoTool({
    tenantId: tenant,
    tenantConfig,
    siteManifest,
    sectionEnum,
    onNoOp: (section, message) => recordActionResult({ status: "no-op", sectionIds: [section], message }),
    onFailed: (section, error) => recordActionResult({ status: "failed", sectionIds: [section], error }),
    onBlocked: (section, message) => recordActionResult({ status: "blocked", sectionIds: [section], message }),
    onQueued: (section, eventId, message, sourceProof) =>
      recordActionResult({
        status: "queued",
        sectionIds: [section],
        eventIds: eventId ? [eventId] : undefined,
        message,
        sourceProof,
      }),
  });

  // All tools are always available — single plan includes everything.
  // The `capability` key is legacy bookkeeping kept to minimize diff; see
  // the flatten step below where it is stripped before passing to streamText.
  const documentTools = buildSiteDocumentTools({ tenantId: tenant, actor: ctx.actor, onResult: (status, message) => recordActionResult(status === "queued" ? { status, message } : { status, error: message }) });
  const deps: ChatToolDeps = { tenant, tenantConfig, siteManifest, sectionEnum, recordActionResult, ctx, mods, gbpTools, undoTool, documentTools };
  // Groups in catalog order; the spread keeps the original key order.
  const allTools: ChatToolEntries = {
    ...contentChatTools(deps),
    ...insightChatTools(deps),
    ...marketingChatTools(deps),
    ...layoutChatTools(deps),
    ...reviewReplyChatTools(deps),
    ...displayChatTools(deps),
    ...collectionChatTools(deps),
  };

  // Google Business write tools are offered only when the caller resolved a
  // write-capable Google connection (resolveGbpWriteAllowed).
  const tools: Record<string, Tool> = {};
  for (const [name, { def }] of Object.entries(allTools)) {
    if (TENANT_CHAT_GBP_WRITE_TOOLS.has(name) && !ctx.gbpWriteAllowed) continue;
    tools[name] = ctx.recheck ? withRecheck(name, def, ctx) : def;
  }
  mods.assertAgentToolCatalog(Object.keys(tools), "chat");
  return tools;
}

/** Wrap one tool so authority is re-read right before it runs. */
function withRecheck(name: string, def: Tool, ctx: AskToolContext): Tool {
  const execute = (def as { execute?: (...args: unknown[]) => unknown }).execute;
  if (!execute || !ctx.recheck) return def;
  const recheck = ctx.recheck;
  return {
    ...def,
    execute: async (...args: unknown[]) => {
      const refusal = await recheck(name);
      if (refusal) {
        ctx.onResult({ status: "blocked", message: refusal.message });
        return { success: false, blocked: true, reason: refusal.reason, message: refusal.message, agentResultStatus: "blocked" as const };
      }
      return execute(...args);
    },
  } as Tool;
}
