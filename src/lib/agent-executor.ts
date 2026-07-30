import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { getSectionTimestamps } from "@/lib/storage";
import { getRedis } from "@/lib/redis";
import { getTemplateManifestForTenant } from "@/lib/template-manifests";
import { getTenantConfig } from "@/lib/tenants";
import { assertAgentToolCatalog, capabilityPromptFragment } from "@/lib/capabilities";
import { buildAgentSystemPrompt } from "@/lib/agent-prompt-shared";
import { sendSlackNotification } from "@/lib/slack";
import { detectStaleSections } from "@/lib/reports";
import { applySectionUpdate } from "@/lib/apply-section-update";
import type { ContentSection } from "@/lib/types";
import { agentResultFromToolOutput, buildAgentResultContract, type AgentResultContract } from "@/lib/agent-results";
import { getPrimaryModel, getFallbackModel, isTransientModelError } from "@/lib/ai-models";
import { logger } from "@/lib/logger";
import { addSentryBreadcrumb } from "@/lib/sentry-context";
import { scheduleVerification } from "@/lib/verify-live";
import { getSiteCapabilityManifest, manifestAllowsAction } from "@/lib/site-capabilities";
import { resolveGbpWriteAllowed, resolveEditableSections, buildGbpTools, buildUndoTool } from "@/lib/agent-shared";

export interface AgentExecutionToolTrace {
  name: string;
  input: unknown;
  output?: unknown;
  error?: string;
  success: boolean;
  stepNumber: number;
}

export interface AgentExecutionUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AgentExecutionTrace {
  text: string;
  finishReason: string;
  toolCalls: AgentExecutionToolTrace[];
  agentResult: AgentResultContract;
  /** Aggregated token usage across all model calls in this run. */
  usage?: AgentExecutionUsage;
  /** Which AI model produced this response (e.g. "google/gemini-2.5-flash"). */
  modelUsed: string;
}

// Cache built system prompts per tenant. Keyed on a signature derived from
// section timestamps + capability fragment so the cache is invalidated as
// soon as any section is updated (setContent calls recordSectionUpdate).
// This prevents a thundering herd of Redis reads when many chat turns hit
// the same tenant in quick succession.
interface PromptCacheEntry {
  signature: string;
  prompt: string;
  cachedAt: number;
}
const promptCache = new Map<string, PromptCacheEntry>();
const PROMPT_CACHE_TTL_MS = 60_000;
const PROMPT_CACHE_TTL_SECONDS = 60;
// Shared across serverless instances: a cold instance (or the dashboard-chat
// route, which builds its own prompt) skips the N section reads on a Redis hit.
const promptCacheKey = (tenant: string) => `reb:prompt-cache:${tenant}`;

/** Test/manual hook to drop cached prompts. */
export async function clearAgentPromptCache(tenant?: string): Promise<void> {
  if (tenant) promptCache.delete(tenant);
  else promptCache.clear();
  const redis = getRedis();
  if (!redis) return;
  try {
    if (tenant) await redis.del(promptCacheKey(tenant));
    // No wildcard delete: per-tenant keys expire on their own 60s TTL.
  } catch {
    // best-effort cache clear
  }
}

async function buildSystemPrompt(
  tenant: string,
  capFragment: string
): Promise<string> {
  // Cheap first read: timestamps tell us whether anything changed since the
  // last build. On hit we return the cached prompt and skip the N section
  // reads + click count read.
  const timestamps = await getSectionTimestamps(tenant);
  // Key on the capability fragment's CONTENT, not just its length — two
  // fragments of equal length but different content must not collide (this
  // cache is now Redis-shared across instances, so a collision would serve a
  // stale prompt platform-wide for the TTL, not just on one warm instance).
  // NUL delimiter (written as the \0 escape, not a raw byte, so the source stays
  // text): collision-safe because a null never appears in the fragment or JSON.
  const signature = `${capFragment}\0${JSON.stringify(timestamps)}`;
  const cached = promptCache.get(tenant);
  if (
    cached &&
    cached.signature === signature &&
    Date.now() - cached.cachedAt < PROMPT_CACHE_TTL_MS
  ) {
    return cached.prompt;
  }

  // Cross-instance hit: another instance may have already built this exact
  // prompt (same signature). Adopt it and warm the local cache.
  const redis = getRedis();
  if (redis) {
    try {
      const shared = await redis.get<{ signature: string; prompt: string }>(promptCacheKey(tenant));
      if (shared && shared.signature === signature) {
        promptCache.set(tenant, { signature, prompt: shared.prompt, cachedAt: Date.now() });
        return shared.prompt;
      }
    } catch {
      // Redis unavailable — fall through to a local rebuild.
    }
  }

  const template = await getTemplateManifestForTenant(tenant);
  const staleSections = detectStaleSections(timestamps, template.contentSections).slice(0, 5);
  let prompt = await buildAgentSystemPrompt(tenant, capFragment);
  if (staleSections.length > 0) {
    prompt += `\n\nSTALE SECTIONS TO WATCH:\n${staleSections
      .map((section) => `- ${section.section}: ${section.daysSinceUpdate} days since update`)
      .join("\n")}`;
  }

  promptCache.set(tenant, { signature, prompt, cachedAt: Date.now() });
  if (redis) {
    try {
      await redis.set(promptCacheKey(tenant), { signature, prompt }, { ex: PROMPT_CACHE_TTL_SECONDS });
    } catch {
      // best-effort shared cache; the in-memory entry still serves this instance
    }
  }
  return prompt;
}

export async function executeAgentPrompt(
  tenantId: string,
  userMessage: string
): Promise<string> {
  const result = await executeAgentPromptDetailed(tenantId, userMessage);
  return result.text;
}

export async function executeAgentPromptDetailed(
  tenantId: string,
  userMessage: string
): Promise<AgentExecutionTrace> {
  addSentryBreadcrumb("agent", "Agent execution started", { tenantId, messageLength: userMessage.length });
  const template = await getTemplateManifestForTenant(tenantId);
  const tenantConfig = await getTenantConfig(tenantId);
  // Parity with the streaming route: honor the site capability manifest (which sections
  // are editable + whether they can auto-publish) and the Google-Business write gate.
  // This path — an owner approving a suggestion — was skipping BOTH.
  const siteManifest = await getSiteCapabilityManifest(tenantId);
  const gbpWriteAllowed = await resolveGbpWriteAllowed(tenantId, tenantConfig);
  const capFragment = capabilityPromptFragment();
  const systemPrompt = await buildSystemPrompt(tenantId, capFragment);

  const { sectionEnum } = resolveEditableSections(template, siteManifest);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, any> = {
    read_section: tool({
      description: "Read current content for a website section",
      inputSchema: z.object({ section: sectionEnum }),
      execute: async ({ section }) => {
        // Mirror the streaming route's read-gate so the two agent paths can't
        // diverge on read authorization (a section may be draftable but not
        // readable per the capability manifest).
        if (!manifestAllowsAction(siteManifest, section, "read")) {
          return { error: `${section} is not readable for this site's capability manifest` };
        }
        const { getContent } = await import("@/lib/storage");
        return await getContent(section as ContentSection, tenantId);
      },
    }),
    update_section: tool({
      description:
        "Update content for a website section. Always read first, then send COMPLETE data.",
      inputSchema: z.object({
        section: sectionEnum,
        data: z.record(z.string(), z.unknown()),
      }),
      execute: async ({ section, data }) => {
        const result = await applySectionUpdate({
          tenantId,
          section: section as ContentSection,
          data: data as Record<string, unknown>,
          tenantConfig: tenantConfig ?? null,
          siteManifest,
        });

        if (result.status === "failed") {
          return { success: false, section, agentResultStatus: "failed" as const, error: result.error };
        }
        if (result.status === "blocked") {
          return {
            success: false,
            blocked: true,
            section,
            agentResultStatus: "blocked" as const,
            reason: result.reason,
            message: result.message,
          };
        }

        // Published: confirm the change actually landed on the public read path.
        if (result.status === "published") {
          scheduleVerification(
            tenantId,
            section as ContentSection,
            data as Record<string, unknown>
          );
        }

        sendSlackNotification(
          {
            text:
              result.status === "published"
                ? `Site updated *${section}* via AI approval (${tenantId})`
                : `AI drafted *${section}* via approval (${tenantId}) — needs admin review`,
          },
          "tenant",
          tenantConfig
        ).catch(() => {});

        return {
          success: true,
          section,
          sectionIds: [section],
          eventId: result.status === "queued" ? result.eventId : undefined,
          eventIds: result.status === "queued" ? [result.eventId] : undefined,
          agentResultStatus: result.status === "published" ? ("published" as const) : ("queued" as const),
          governance: result.governance,
          message:
            result.status === "published" ? `Updated ${section}` : `Queued ${section} for admin review`,
        };
      },
    }),
    get_suggestions: tool({
      description: "List pending proactive suggestions for this website.",
      inputSchema: z.object({}),
      execute: async () => {
        const { getSuggestions } = await import("@/lib/suggestions");
        return await getSuggestions(tenantId);
      },
    }),
    create_suggestion: tool({
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
        return await addSuggestion({
          tenantId,
          type,
          title,
          description,
          action,
          section,
        });
      },
    }),
  };

  // Blog tools — always available under the single plan.
  // These route through the Collections CMS (the `blog` collection type in
  // Postgres `collection_entries`) so the agent and the CMS editor share ONE
  // store. AI-authored posts are always saved as DRAFTS; a human publishes.
  {
    tools.create_blog_post = tool({
      description: "Write a blog post. Generates slug and excerpt automatically. Saved as a draft for the owner to review and publish.",
      inputSchema: z.object({
        title: z.string().describe("Blog post title"),
        content: z.string().describe("Full blog post content"),
        tags: z.array(z.string()).optional().describe("Tags for the post"),
      }),
      execute: async ({ title, content, tags }) => {
        const { saveEntry } = await import("@/lib/cms/collections-service");
        const author = tenantConfig?.ownerName || "The Team";
        const excerpt = content.slice(0, 160).replace(/\n/g, " ").trim();

        // Governance: the agent drafts; a human publishes from the editor.
        // (Matches the collections `save_entry` tool — AI writes are drafts.)
        const result = await saveEntry({
          tenant: tenantId,
          type: "blog",
          data: {
            title,
            excerpt,
            body: content,
            author,
            tags: tags || [],
          },
          status: "draft",
          actor: "ai",
        });

        if (!result.ok) {
          return {
            success: false,
            agentResultStatus: "failed" as const,
            error: result.error,
          };
        }

        return {
          success: true,
          status: result.entry.status,
          agentResultStatus: "drafted" as const,
          post: { title, slug: result.entry.slug, publishedAt: result.entry.updated_at },
        };
      },
    });

    tools.list_blog_posts = tool({
      description: "List recent published blog posts with title, slug, and date.",
      inputSchema: z.object({}),
      execute: async () => {
        const { listEntriesForType } = await import("@/lib/cms/collections-service");
        const entries = await listEntriesForType(tenantId, "blog", { status: "published", limit: 20 });
        return entries.map((e) => {
          const data = e.data as Record<string, unknown>;
          return {
            title: typeof data.title === "string" ? data.title : e.slug,
            slug: e.slug,
            publishedAt: e.updated_at,
            tags: Array.isArray(data.tags) ? data.tags : [],
          };
        });
      },
    });
  }

  // undo_last_change — shared definition with the streaming route (buildUndoTool,
  // B6). Always available (not GBP-gated). A revert drafts through applySectionUpdate
  // with forceReview, so it is owner-approved, never auto-published. Executor side
  // effect on queue is a Slack ping.
  tools.undo_last_change = buildUndoTool({
    tenantId,
    tenantConfig,
    siteManifest,
    sectionEnum,
    onQueued: (section, eventId) => {
      sendSlackNotification(
        {
          text: `AI drafted an undo of *${section}* for *${tenantId}* — needs owner approval (eventId=${eventId ?? "?"})`,
        },
        "tenant",
        tenantConfig,
      ).catch(() => {});
    },
  });

  // ── GBP tools — wired only when the tenant may actually write to Google
  //    (local/hybrid + connected account + write scope), matching the streaming
  //    route's gate. The tool DEFINITIONS are shared with the route via
  //    buildGbpTools (B6) so the two paths can't drift; this path's side effect
  //    on queuing is a Slack ping to the tenant channel. All three tools —
  //    including upload_gbp_photo, which the executor previously LACKED — are
  //    now present. The real Google write still happens only on owner approval
  //    (event-actions handles each `gbp_*_draft` kind). ──
  if (gbpWriteAllowed) {
    const gbpTools = buildGbpTools({
      tenantId,
      // Proactive path: the operator approves before it goes live (escalates to the
      // client only if unsure), so these drafts don't land in the client's queue.
      reviewAudience: "operator",
      onQueued: (toolName, eventId) => {
        sendSlackNotification(
          {
            text: `AI drafted ${toolName} for *${tenantId}* — needs operator approval (eventId=${eventId})`,
          },
          "tenant",
          tenantConfig,
        ).catch(() => {});
      },
    });
    tools.create_gbp_post = gbpTools.create_gbp_post;
    tools.update_business_hours = gbpTools.update_business_hours;
    tools.upload_gbp_photo = gbpTools.upload_gbp_photo;
  }
  assertAgentToolCatalog(Object.keys(tools), "background");

  const primary = getPrimaryModel();
  const fallback = getFallbackModel();
  let modelUsed = primary.label;

  const generateOptions = {
    system: systemPrompt,
    messages: [{ role: "user" as const, content: userMessage }],
    tools,
    stopWhen: stepCountIs(8),
  };

  let result;
  try {
    result = await generateText({ ...generateOptions, model: primary.model });
  } catch (primaryErr) {
    if (fallback && isTransientModelError(primaryErr)) {
      logger.warn("[agent] Primary model failed, trying fallback", {
        primary: primary.label,
        fallback: fallback.label,
        error: primaryErr instanceof Error ? primaryErr.message : "unknown",
        tenantId,
      });
      modelUsed = fallback.label;
      result = await generateText({ ...generateOptions, model: fallback.model });
    } else {
      throw primaryErr;
    }
  }

  const toolCalls: AgentExecutionToolTrace[] = result.steps.flatMap((step) => {
    const okCalls = step.toolResults.map((toolResult) => ({
      name: toolResult.toolName,
      input: toolResult.input,
      output: toolResult.output,
      success: true,
      stepNumber: step.stepNumber,
    }));
    const errors = step.content
      .filter((part) => part.type === "tool-error")
      .map((part) => ({
        name: part.toolName,
        input: part.input,
        error: part.error instanceof Error ? part.error.message : String(part.error),
        success: false,
        stepNumber: step.stepNumber,
      }));

    return [...okCalls, ...errors];
  });

  const actionResults = toolCalls
    .map((call) => agentResultFromToolOutput(call.output))
    .filter((action): action is NonNullable<typeof action> => Boolean(action));

  // Aggregate token usage across every model call in this run. The AI SDK
  // surfaces this on the final result; each step adds to it. Used by the
  // benchmark to compute cost-per-resolved and cost-per-case metrics.
  const usage: AgentExecutionUsage | undefined = result.usage
    ? {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        totalTokens: result.usage.totalTokens ?? 0,
      }
    : undefined;

  return {
    text: result.text,
    finishReason: result.finishReason,
    toolCalls,
    agentResult: buildAgentResultContract(actionResults),
    usage,
    modelUsed,
  };
}
