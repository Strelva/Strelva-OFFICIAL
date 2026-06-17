import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { getSectionTimestamps } from "@/lib/storage";
import { getTemplateForTenant } from "@/components/templates/registry";
import { getTenantConfig } from "@/lib/tenants";
import { capabilityPromptFragment, sanitizePromptValue } from "@/lib/capabilities";
import {
  logisticsGuardrail,
  loadAgentPromptContent,
  aboutBlock,
  heroBlock,
  storyBlock,
  servicesBlock,
  eventsBlock,
  testimonialsBlock,
  performanceBlock,
} from "@/lib/agent-prompt-shared";
import { sendSlackNotification } from "@/lib/slack";
import { detectStaleSections } from "@/lib/reports";
import { decideAiContentGovernance } from "@/lib/ai-governance";
import { queueAiContentReview } from "@/lib/ai-review-queue";
import type { ContentSection } from "@/lib/types";
import { revalidateClientSite } from "@/lib/revalidate-client";
import { clientRevalidationTargetForSections } from "@/lib/content-revalidation";
import { agentResultFromToolOutput, buildAgentResultContract, type AgentResultContract } from "@/lib/agent-results";
import { getPrimaryModel, getFallbackModel, isTransientModelError } from "@/lib/ai-models";
import { logger } from "@/lib/logger";
import { addSentryBreadcrumb } from "@/lib/sentry-context";
import { scheduleVerification } from "@/lib/verify-live";

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

/** Test/manual hook to drop cached prompts. */
export function clearAgentPromptCache(tenant?: string): void {
  if (tenant) promptCache.delete(tenant);
  else promptCache.clear();
}

async function buildSystemPrompt(
  tenant: string,
  capFragment: string
): Promise<string> {
  // Cheap first read: timestamps tell us whether anything changed since the
  // last build. On hit we return the cached prompt and skip the N section
  // reads + click count read.
  const timestamps = await getSectionTimestamps(tenant);
  const signature = `${capFragment.length}:${JSON.stringify(timestamps)}`;
  const cached = promptCache.get(tenant);
  if (
    cached &&
    cached.signature === signature &&
    Date.now() - cached.cachedAt < PROMPT_CACHE_TTL_MS
  ) {
    return cached.prompt;
  }

  // Shared content load + section blocks (see agent-prompt-shared.ts) — identical
  // to the dashboard chat surface. The executor-specific bits (caching above,
  // stale-section hints below) stay here.
  const ctx = await loadAgentPromptContent(tenant);
  const { sections, settings } = ctx;

  const sectionSummaries: string[] = [aboutBlock(ctx)];
  for (const block of [
    heroBlock(ctx),
    storyBlock(ctx),
    servicesBlock(ctx),
    eventsBlock(ctx),
    testimonialsBlock(ctx),
  ]) {
    if (block) sectionSummaries.push(block);
  }
  sectionSummaries.push(performanceBlock(ctx));

  const staleSections = detectStaleSections(timestamps, sections).slice(0, 5);
  if (staleSections.length > 0) {
    sectionSummaries.push(
      `STALE SECTIONS TO WATCH:\n${staleSections
        .map((s) => `- ${s.section}: ${s.daysSinceUpdate} days since update`)
        .join("\n")}`
    );
  }

  const sectionNames = sections.join(", ");

  let prompt = `You are the website assistant for ${sanitizePromptValue(settings.siteName) || "this business"}.

${sectionSummaries.join("\n\n")}

You can read and update any section of the website. Always read the current content first before making changes. When updating, send back the COMPLETE section data — do not send partial updates.

Available sections: ${sectionNames}.`;

  prompt += `\n\n${logisticsGuardrail(sectionNames)}`;

  if (settings.bookingUrl) {
    const tenantConfig = await getTenantConfig(tenant);
    const provider = sanitizePromptValue(tenantConfig?.bookingProvider) || "their booking platform";
    prompt += `\n\nBOOKING: All booking is handled through ${provider} at ${sanitizePromptValue(settings.bookingUrl)}. When someone asks about booking, direct them there.`;
  }

  prompt += `\n\n${capFragment}`;

  prompt += `\n\nBe conversational, warm, and helpful. Confirm changes after making them. Never remove content unless explicitly asked. For array items, preserve all existing items unless told to remove specific ones.`;

  promptCache.set(tenant, { signature, prompt, cachedAt: Date.now() });
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
  const template = await getTemplateForTenant(tenantId);
  const tenantConfig = await getTenantConfig(tenantId);
  const capFragment = capabilityPromptFragment();
  const systemPrompt = await buildSystemPrompt(tenantId, capFragment);

  const sectionEnum = z.enum(
    template.contentSections as [string, ...string[]]
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, any> = {
    read_section: tool({
      description: "Read current content for a website section",
      inputSchema: z.object({ section: sectionEnum }),
      execute: async ({ section }) => {
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
        const { sectionSchemas } = await import("@/lib/schemas");
        const schema = sectionSchemas[section as ContentSection];
        const parsed = schema.safeParse(data);
        if (!parsed.success)
          return {
            success: false,
            section,
            agentResultStatus: "failed" as const,
            error: parsed.error.message,
          };

        const { getContent, setContent } = await import("@/lib/storage");
        const current = (await getContent(
          section as ContentSection,
          tenantId
        )) as unknown as Record<string, unknown>;

        for (const key of Object.keys(current)) {
          if (
            Array.isArray(current[key]) &&
            Array.isArray((data as Record<string, unknown>)[key])
          ) {
            const oldLen = (current[key] as unknown[]).length;
            const newLen = (
              (data as Record<string, unknown>)[key] as unknown[]
            ).length;
            if (oldLen > 0 && newLen < oldLen * 0.5) {
              return {
                success: false,
                section,
                agentResultStatus: "blocked" as const,
                error: `Would remove ${oldLen - newLen} of ${oldLen} ${key}. Confirm first.`,
              };
            }
          }
        }

        const baseGovernance = decideAiContentGovernance(section as ContentSection, parsed.data, {
          tenantAutoPublish: tenantConfig?.autoPublish,
        });

        const { maybeAutoApprove } = await import("@/lib/ai-auto-approve");
        const governance = await maybeAutoApprove(tenantConfig, section as ContentSection, baseGovernance);

        if (governance.action === "block") {
          return {
            success: false,
            blocked: true,
            section,
            agentResultStatus: "blocked" as const,
            reason: governance.reason,
            message: "Structural site changes require manual admin work.",
          };
        }

        const { diffFields } = await import("@/lib/utils");
        const changes = diffFields(current, data as Record<string, unknown>);
        let queuedEventId: string | undefined;

        if (governance.action === "publish") {
          await setContent(
            section as ContentSection,
            parsed.data as Parameters<typeof setContent>[1],
            tenantId
          );
          const { appendVersion } = await import("@/lib/storage");
          await appendVersion(
            section as ContentSection,
            parsed.data,
            "ai",
            tenantId,
            changes
          );
          const { revalidatePath } = await import("next/cache");
          revalidatePath("/");

          // Trigger revalidation on standalone client site
          revalidateClientSite(
            tenantId,
            clientRevalidationTargetForSections([section as ContentSection])
          ).catch((err) => {
            console.error("[agent] Failed to revalidate client site:", err);
          });

          // Fire-and-forget verification: confirms the change is live on the
          // public read path and emits change_verified / change_verify_failed.
          scheduleVerification(
            tenantId,
            section as ContentSection,
            parsed.data as Record<string, unknown>
          );
        } else {
          const event = await queueAiContentReview({
            tenantId,
            section: section as ContentSection,
            currentData: current,
            proposedData: parsed.data as Record<string, unknown>,
            diffs: changes.map((change) => ({
              field: change.field,
              before: change.before,
              after: change.after,
              type: "changed" as const,
            })),
            governance,
          });
          queuedEventId = event.id;

          const { setDraftContent } = await import("@/lib/storage");
          await setDraftContent(
            section as ContentSection,
            parsed.data as Parameters<typeof setContent>[1],
            tenantId
          );
        }

        const { logActivity, recordSectionUpdate } = await import(
          "@/lib/storage"
        );
        await logActivity(
          {
            text:
              governance.action === "publish"
                ? `AI updated ${section} via approved action`
                : `AI drafted changes to ${section} via approved action`,
            time: new Date().toISOString(),
            type: "ai",
            section,
            actor: "ai",
            changes,
            eventStatus: governance.action === "publish" ? "auto_approved" : "pending",
            governanceReason: governance.reason,
            suppressEvent: governance.action !== "publish",
          },
          tenantId
        );
        if (governance.action === "publish") {
          await recordSectionUpdate(section, tenantId);
        }

        sendSlackNotification(
          {
            text:
              governance.action === "publish"
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
          eventId: queuedEventId,
          eventIds: queuedEventId ? [queuedEventId] : undefined,
          agentResultStatus: governance.action === "publish" ? "published" as const : "queued" as const,
          governance,
          message:
            governance.action === "publish"
              ? `Updated ${section}`
              : `Queued ${section} for admin review`,
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

  // Blog tools — always available under the single plan
  {
    tools.create_blog_post = tool({
      description: "Write and publish a blog post. Generates slug, excerpt, and publish date automatically.",
      inputSchema: z.object({
        title: z.string().describe("Blog post title"),
        content: z.string().describe("Full blog post content"),
        tags: z.array(z.string()).optional().describe("Tags for the post"),
      }),
      execute: async ({ title, content, tags }) => {
        const { createBlogPost } = await import("@/lib/blog");
        const tenantConfig = await getTenantConfig(tenantId);
        const author = tenantConfig?.ownerName || "The Team";
        const excerpt = content.slice(0, 160).replace(/\n/g, " ").trim();

        const globalAutoPublishOff = process.env.AI_AUTO_PUBLISH === "false";
        const tenantAutoPublishOff = tenantConfig?.autoPublish === false;
        const shouldDraft = globalAutoPublishOff || tenantAutoPublishOff;
        const status = shouldDraft ? "draft" : "published";

        const post = await createBlogPost(tenantId, {
          slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
          title,
          excerpt,
          content,
          author,
          status,
          tags: tags || [],
        });

        const { logActivity } = await import("@/lib/storage");
        await logActivity(
          {
            text: shouldDraft
              ? `AI drafted blog post for review: "${title}"`
              : `AI published blog post: "${title}"`,
            time: new Date().toISOString(),
            type: "ai",
            section: "blog",
            actor: "ai",
          },
          tenantId
        );

        return {
          success: true,
          status,
          agentResultStatus: status === "published" ? "published" as const : "drafted" as const,
          post: { title: post.title, slug: post.slug, publishedAt: post.publishedAt },
        };
      },
    });

    tools.list_blog_posts = tool({
      description: "List recent published blog posts with title, slug, and date.",
      inputSchema: z.object({}),
      execute: async () => {
        const { getBlogPosts } = await import("@/lib/blog");
        const posts = await getBlogPosts(tenantId, { status: "published", limit: 20 });
        return posts.map((p) => ({ title: p.title, slug: p.slug, publishedAt: p.publishedAt, tags: p.tags }));
      },
    });
  }

  // ── GBP tools — only wired when the tenant has a connected Google account ──
  {
    // update_business_hours: factual change → auto-approved (hours/address/
    // contact are FACTUAL_FIELD_HINTS in ai-governance). The AI should read
    // current hours from the `contact` section first, then issue this tool to
    // push the same change to the Google listing.
    tools.update_business_hours = tool({
      description:
        "Update the business hours on the client's Google Business Profile listing. " +
        "Provide regularHours (weekly schedule) and/or specialHours (holiday overrides). " +
        "This is a factual change — it publishes automatically without review. " +
        "Always confirm with the owner what the correct hours are before calling this.",
      inputSchema: z.object({
        regularHours: z
          .object({
            periods: z.array(
              z.object({
                openDay: z.enum([
                  "MONDAY",
                  "TUESDAY",
                  "WEDNESDAY",
                  "THURSDAY",
                  "FRIDAY",
                  "SATURDAY",
                  "SUNDAY",
                ]),
                openTime: z.object({ hours: z.number(), minutes: z.number() }),
                closeDay: z.enum([
                  "MONDAY",
                  "TUESDAY",
                  "WEDNESDAY",
                  "THURSDAY",
                  "FRIDAY",
                  "SATURDAY",
                  "SUNDAY",
                ]),
                closeTime: z.object({ hours: z.number(), minutes: z.number() }),
              })
            ),
          })
          .optional()
          .describe("Regular weekly hours"),
        specialHours: z
          .object({
            specialHourPeriods: z.array(
              z.object({
                startDate: z.object({
                  year: z.number(),
                  month: z.number(),
                  day: z.number(),
                }),
                endDate: z.object({
                  year: z.number(),
                  month: z.number(),
                  day: z.number(),
                }),
                openTime: z
                  .object({ hours: z.number(), minutes: z.number() })
                  .optional(),
                closeTime: z
                  .object({ hours: z.number(), minutes: z.number() })
                  .optional(),
                isClosed: z.boolean().optional(),
              })
            ),
          })
          .optional()
          .describe("Holiday or special-event hours overrides"),
      }),
      execute: async ({ regularHours, specialHours }) => {
        const { updateBusinessHours } = await import("@/lib/gbp-management");
        const result = await updateBusinessHours(tenantId, {
          regularHours,
          specialHours,
        });

        sendSlackNotification(
          {
            text: result.success
              ? `GBP hours updated for *${tenantId}* — verified=${result.verified}`
              : `GBP hours update FAILED for *${tenantId}* — ${result.evidence}`,
          },
          "tenant",
          tenantConfig
        ).catch(() => {});

        return {
          success: result.success,
          verified: result.verified,
          evidence: result.evidence,
          agentResultStatus: result.success
            ? ("published" as const)
            : ("failed" as const),
          message: result.success
            ? `Google Business Profile hours updated${result.verified ? " and confirmed live" : " (verification pending)"}`
            : `Failed to update GBP hours: ${result.evidence}`,
        };
      },
    });

    // create_gbp_post: new copy → always queued as pending (review required).
    // The governance classification below mirrors `queueAiContentReview` for
    // the "hero"/"story" review path — new marketing copy goes to the queue.
    tools.create_gbp_post = tool({
      description:
        "Create a Google Post on the client's Google Business Profile. " +
        "Google Posts appear in search results next to the listing. " +
        "Posts are ALWAYS queued for owner review before publishing — never auto-published. " +
        "Keep the summary under 1500 characters. Optionally include a CTA URL.",
      inputSchema: z.object({
        summary: z
          .string()
          .max(1500)
          .describe("Post text (up to 1500 characters)"),
        ctaUrl: z
          .string()
          .url()
          .optional()
          .describe("Optional call-to-action URL (book, learn more, etc.)"),
        photoUrl: z
          .string()
          .url()
          .optional()
          .describe("Optional public photo URL to include with the post"),
      }),
      execute: async ({ summary, ctaUrl, photoUrl }) => {
        // Governance: new copy is always review queue, never auto-approved.
        // We queue an event first; the actual GBP API call happens when Jacob
        // approves in the dashboard (this matches the site-content pattern
        // where proposed data goes to the review queue rather than live).
        const { addEvent: addEvt } = await import("@/lib/events");
        const event = await addEvt({
          tenantId,
          source: "ai",
          type: "content_update",
          title: `Google Post draft: "${summary.slice(0, 60)}${summary.length > 60 ? "…" : ""}"`,
          body: `AI drafted a Google Post for review.\n\nSummary: ${summary}${ctaUrl ? `\nCTA: ${ctaUrl}` : ""}${photoUrl ? `\nPhoto: ${photoUrl}` : ""}`,
          status: "pending",
          metadata: {
            kind: "gbp_post_draft",
            summary,
            ctaUrl,
            photoUrl,
          },
        });

        sendSlackNotification(
          {
            text: `AI drafted a Google Post for *${tenantId}* — needs admin review (eventId=${event.id})`,
          },
          "tenant",
          tenantConfig
        ).catch(() => {});

        return {
          success: true,
          eventId: event.id,
          agentResultStatus: "queued" as const,
          message: `Google Post draft queued for your review. Once you approve it in the dashboard, it will be published to your Google listing.`,
        };
      },
    });
  }

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
