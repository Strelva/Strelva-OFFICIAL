import { streamText, tool, stepCountIs } from "ai";
import type { ModelMessage } from "ai";
import { z } from "zod";
import { getPrimaryModel, getFallbackModel, isTransientModelError } from "@/lib/ai-models";
import { logger } from "@/lib/logger";
import { trackError } from "@/lib/monitoring";
import { getAuthUserId, requireTenantAccess, requireTenantPermission } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTemplateForTenant } from "@/components/templates/registry";
import { getTenantConfig } from "@/lib/tenants";
import { getConnections } from "@/lib/connections";
import { ROOT_DOMAIN } from "@/lib/brand";
import {
  DISCOVERABLE_INTEGRATIONS,
  deriveIntelligenceStatus,
  getIntegrationCategories,
  normalizeIntegrationStatus,
  type RawTenantConnectionSettings,
} from "@/lib/integration-registry";
import { requireActiveSubscription } from "@/lib/subscription";
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
import { sniffImageType } from "@/lib/image-signature";
import { getSiteCapabilityManifest, manifestAllowsAction } from "@/lib/site-capabilities";
import { isRateLimitedAsync } from "@/lib/rate-limit";
import { classifySource, recordAgentToolCall } from "@/lib/proof-signals";
import { applySectionUpdate } from "@/lib/apply-section-update";
import { postCustomChangeRequest } from "@/lib/custom-request-client";
import { type NodeContext } from "@/lib/agent-risk";
import type { ContentSection } from "@/lib/types";
import { isDevAccessBypassEnabled } from "@/lib/dev-access";
import {
  agentResultFromToolOutput,
  buildAgentResultContract,
  type AgentActionResult,
} from "@/lib/agent-results";
import { readJsonObject } from "@/lib/request-body";

type IncomingMessagePart = { type?: string; text?: string };

type IncomingMessage = {
  role?: string;
  content?: string | IncomingMessagePart[];
  parts?: IncomingMessagePart[];
};

function isIncomingMessage(value: unknown): value is IncomingMessage {
  return value !== null && typeof value === "object";
}

function isModelMessageArray(value: unknown): value is ModelMessage[] {
  if (!Array.isArray(value)) return false;
  return value.every((message) => {
    if (!isIncomingMessage(message)) return false;
    return (
      message.role === "system" ||
      message.role === "user" ||
      message.role === "assistant" ||
      message.role === "tool"
    );
  });
}

function textFromMessage(message: IncomingMessage): string | undefined {
  if (typeof message.content === "string") return message.content;
  const parts = Array.isArray(message.content) ? message.content : message.parts;
  const text = parts
    ?.map((part) => (part?.type === "text" ? part.text || "" : ""))
    .join(" ")
    .trim();
  return text || undefined;
}

function tenantConnectionSettings(config: Awaited<ReturnType<typeof getTenantConfig>>): RawTenantConnectionSettings {
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

function getCustomRequestUrl(productionUrl: string | undefined, endpoint: string | undefined): string | null {
  if (!productionUrl || !endpoint) return null;
  try {
    return new URL(endpoint, productionUrl).toString();
  } catch {
    return null;
  }
}

async function buildSystemPrompt(tenant: string, capFragment: string): Promise<string> {
  // Shared content load + section blocks (see agent-prompt-shared.ts), with this
  // surface's extra sections (products/providers/faq/shop) interleaved in place.
  const ctx = await loadAgentPromptContent(tenant);
  const { sections, content, settings, ownerName } = ctx;

  const sectionSummaries: string[] = [aboutBlock(ctx)];
  const heroSummary = heroBlock(ctx);
  if (heroSummary) sectionSummaries.push(heroSummary);
  const storySummary = storyBlock(ctx);
  if (storySummary) sectionSummaries.push(storySummary);
  const servicesSummary = servicesBlock(ctx);
  if (servicesSummary) sectionSummaries.push(servicesSummary);

  if (sections.includes("products") && content.products) {
    const prod = content.products;
    const productList = ((prod.products as Array<{ name: string; price: string; id: string }>) || [])
      .map((p) => `- ${p.name} ($${p.price}) [id: ${p.id}]`)
      .join("\n");
    sectionSummaries.push(`PRODUCTS (${((prod.products as unknown[]) || []).length} listed):\n${productList}`);
  }

  const eventsSummary = eventsBlock(ctx);
  if (eventsSummary) sectionSummaries.push(eventsSummary);
  const testimonialsSummary = testimonialsBlock(ctx);
  if (testimonialsSummary) sectionSummaries.push(testimonialsSummary);

  if (sections.includes("providers") && content.providers) {
    const providerList = ((content.providers.providers as Array<{ name: string; service: string; category: string }>) || [])
      .map((p) => `- ${p.name} — ${p.service} (${p.category})`)
      .join("\n");
    sectionSummaries.push(`PROVIDERS (${(content.providers.providers as unknown[])?.length || 0} listed):\n${providerList || "None yet."}`);
  }

  if (sections.includes("faq") && content.faq) {
    sectionSummaries.push(`FAQ: ${(content.faq.faqs as unknown[])?.length || 0} questions listed.`);
  }

  if (sections.includes("shop") && content.shop) {
    sectionSummaries.push(`SHOP: ${(content.shop.items as unknown[])?.length || 0} products listed.`);
  }

  sectionSummaries.push(performanceBlock(ctx));

  try {
    const { getSearchData } = await import("@/lib/storage");
    const searchData = await getSearchData(tenant);
    if (searchData?.queries?.length) {
      const topQueries = searchData.queries
        .slice(0, 5)
        .map((query) => `- ${query.query}: ${query.clicks} clicks, ${query.impressions} impressions, avg position ${query.position.toFixed(1)}`)
        .join("\n");
      const sourceDate = formatSourceDate(searchData.fetchedAt);
      sectionSummaries.push(
        `SEARCH CONSOLE:\n${topQueries}\nSource: Search Console${sourceDate ? `, last updated ${sourceDate}` : ""}`
      );
    } else {
      sectionSummaries.push(
        "SEARCH CONSOLE: No Search Console data is available yet. If the user asks for @Search Console, say that plainly and offer to review site copy without real search terms."
      );
    }
  } catch {
    sectionSummaries.push(
      "SEARCH CONSOLE: No Search Console data is available yet. If the user asks for @Search Console, say that plainly and offer to review site copy without real search terms."
    );
  }

  // Add reviews/sources context for agent knowledge
  try {
    const { getReviews } = await import("@/lib/reviews");
    const { getClickCountsByPrefix } = await import("@/lib/storage");

    const reviews = await getReviews(tenant);
    if (reviews.length > 0) {
      const avgRating = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
      const unreplied = reviews.filter((r) => !r.reply).length;
      const recentReviews = reviews.slice(0, 3);

      // Find common themes in reviews
      const allText = reviews.map((r) => r.text.toLowerCase()).join(" ");
      const themes: string[] = [];
      if (allText.includes("friendly") || allText.includes("welcoming")) themes.push("friendly service");
      if (allText.includes("clean") || allText.includes("comfortable")) themes.push("clean environment");
      if (allText.includes("professional")) themes.push("professionalism");
      if (allText.includes("relaxing") || allText.includes("peaceful")) themes.push("relaxing atmosphere");

      let reviewSummary = `CUSTOMER REVIEWS:\n- ${reviews.length} total reviews (${avgRating.toFixed(1)} avg rating)`;
      if (unreplied > 0) reviewSummary += `\n- ${unreplied} awaiting reply`;
      if (themes.length > 0) reviewSummary += `\n- Customers mention: ${themes.join(", ")}`;
      reviewSummary += `\n\nRecent reviews:\n${recentReviews.map((r) => `- "${r.text.slice(0, 80)}..." — ${r.author} (${r.rating} stars, ${r.source})`).join("\n")}`;
      reviewSummary += "\nSource: Reviews stored in dashboard";

      sectionSummaries.push(reviewSummary);
    }

    // Service click data for insights
    const serviceClicks = await getClickCountsByPrefix("service-click:", tenant);
    if (Object.keys(serviceClicks).length > 0) {
      const sorted = Object.entries(serviceClicks)
        .map(([key, data]) => ({ name: key.replace("service-click:", ""), ...data }))
        .sort((a, b) => b.thisWeek - a.thisWeek);

      if (sorted.length > 0 && sorted[0].thisWeek > 0) {
        sectionSummaries.push(`SERVICE POPULARITY:\n- Most clicked: ${sorted[0].name} (${sorted[0].thisWeek} clicks this week)`);
      }
    }
  } catch {
    // Source data not available — skip
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
    prompt += `\n\nBOOKING: All booking is handled through ${provider} at ${sanitizePromptValue(settings.bookingUrl)}. When someone asks about booking, direct them there. You cannot book appointments directly — always link to the booking page.`;
  }

  prompt += `\n\nSOURCE-PROOF RULES:
- When you use a connected or built-in source, include one compact proof line such as "Source: Search Console, last updated May 9", "Source: Site activity, 14-day window", or "Source: Reviews stored in dashboard".
- If the user asks for an @Source that is not connected or has no data, say that plainly before giving a fallback recommendation.
- Never imply live posting, calendar sync, Google listing updates, or newsletter sending unless a tool result shows that exact approval-gated action is available. Use "draft", "suggest", or "queue for review" for incomplete action paths.`;

  prompt += `\n\nWHAT THE PLAN COVERS (commercial scope):
- Included and handled by you right now: content, text, and image updates; hours, services, and menu changes; blog posts; small copy tweaks. Make these changes directly — that is what the owner pays for, and they should never wonder whether it happened. Confirm clearly once it's done or queued.
- Quoted separately (NOT included): redesigns, brand-new sections beyond the one-per-quarter allowance, e-commerce/checkout, integrations, custom features, and workflows. These are structural or custom-software work.
- When the owner asks for something in the quoted-separately list, do NOT attempt it as a content edit and do NOT promise it. Use the request_custom_change tool to route it, and explain it warmly in one line: "That's a bigger change than your plan's content updates — I'll send this to Jacob for a quote." Then continue helping with anything that IS in scope.`;

  prompt += `\n\n${capFragment}`;

  // Inject tenant-level AI personality and rules
  const tenantCfg = await getTenantConfig(tenant);

  const personalityDesc = sanitizePromptValue(tenantCfg?.personality) || "conversational, warm, and helpful";
  prompt += `\n\nBe ${personalityDesc} — ${ownerName} talks to you like a coworker, not a robot. Confirm changes after making them. If a request is ambiguous, ask for clarification.`;

  if (tenantCfg?.businessRules) {
    prompt += `\n\nBUSINESS RULES (always follow these):\n${tenantCfg.businessRules}`;
  }

  if (tenantCfg?.businessHours) {
    const bh = tenantCfg.businessHours;
    const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const hoursLines = bh.schedule
      .map((d) => d.closed ? `${DAY_NAMES[d.day]}: Closed` : `${DAY_NAMES[d.day]}: ${d.open} – ${d.close}`)
      .join("\n");
    prompt += `\n\nBUSINESS HOURS:\n${hoursLines}`;
    if (bh.holidays && bh.holidays.length > 0) {
      const holidayLines = bh.holidays.map((h) => `- ${h.date}: ${h.label}`).join("\n");
      prompt += `\n\nHOLIDAY CLOSURES:\n${holidayLines}`;
    }
    if (bh.timezone) {
      prompt += `\nTimezone: ${bh.timezone}`;
    }
    prompt += `\nUse these hours when answering "are you open?" or related questions. If someone asks outside hours, let them know when you'll next be open.`;
  }

  prompt += `\n\nNever remove content unless explicitly asked. For array items (services, events, testimonials, products, providers), preserve all existing items unless told to remove specific ones.

When ${ownerName} asks "how's my site?" or similar, give a plain-English summary of what's on the site, how many booking clicks, and suggest what to update next.`;

  return prompt;
}

export async function POST(req: Request) {
  const tenant = await getTenantFromHeaders();

  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;
  const permissionDenied = await requireTenantPermission(tenant, "content:write");
  if (permissionDenied) return permissionDenied;

  if (await isRateLimitedAsync(`agent:${tenant}`, 30)) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Try again in a minute." }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  const blocked = await requireActiveSubscription(tenant);
  if (blocked) return blocked;

  const tenantConfig = await getTenantConfig(tenant);
  const userId = await getAuthUserId();
  const clerkUserId = userId || (isDevAccessBypassEnabled() ? "dev-access-bypass" : null);
  const body = await readJsonObject(req);
  if (!body) {
    return new Response(
      JSON.stringify({ error: "Invalid request body." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const {
    messages: rawMessages,
    activeSection,
    nodeContext,
  } = body as {
    messages: unknown;
    activeSection?: string;
    nodeContext?: NodeContext;
  };
  if (!isModelMessageArray(rawMessages)) {
    return new Response(
      JSON.stringify({ error: "Invalid message payload." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const messages = rawMessages;
  const template = await getTemplateForTenant(tenant);
  const siteManifest = await getSiteCapabilityManifest(tenant);

  // Capture the latest user message for proof-signal logging (Workstream E).
  // Vercel AI SDK messages can have parts or plain string content — handle both.
  const lastUserMessage = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "user") continue;
      const text = textFromMessage(m as IncomingMessage);
      if (text) return text;
    }
    return undefined;
  })();
  const signalSource = classifySource(clerkUserId);
  const signalSiteName = tenantConfig?.siteName || tenant;
  const capFragment = capabilityPromptFragment();
  let systemPrompt = await buildSystemPrompt(tenant, capFragment);
  const actionResults: AgentActionResult[] = [];
  const recordActionResult = (result: AgentActionResult) => {
    const key = JSON.stringify(result);
    if (actionResults.some((existing) => JSON.stringify(existing) === key)) return;
    actionResults.push(result);
  };

  if (activeSection) {
    systemPrompt += `\n\nCONTEXT: The user is currently viewing the "${activeSection}" section in their dashboard editor. When they say "this", "it", "add one", "update this", etc., they are referring to ${activeSection}. Proactively reference this section in your responses.`;
  }

  // Enhanced node context from canvas selection
  if (nodeContext) {
    let contextBlock = `\n\nSELECTED ELEMENT CONTEXT:`;
    contextBlock += `\n- Section: ${nodeContext.selectedSection}`;
    if (nodeContext.selectedField) {
      contextBlock += `\n- Field: ${nodeContext.selectedField}`;
    }
    if (nodeContext.currentValue) {
      const truncated = nodeContext.currentValue.length > 200
        ? nodeContext.currentValue.slice(0, 200) + "..."
        : nodeContext.currentValue;
      contextBlock += `\n- Current value: "${truncated}"`;
    }
    contextBlock += `\n\nWhen the user says "this", "it", "make it", "change this", they are referring to the selected element above. Apply changes directly to this specific field.`;
    systemPrompt += contextBlock;
  }

  const agentEditableSections = template.contentSections.filter((section) =>
    siteManifest.sections[section]?.allowedActions?.includes("draft") !== false
  );

  systemPrompt += `\n\nSITE CONFIGURABILITY MANIFEST:
- Page config: ${siteManifest.supportsPageConfig ? "supported" : "not supported"}
- Navigation config: ${siteManifest.supportsNavigationConfig ? "supported" : "not supported"}
- Footer config: ${siteManifest.supportsFooterConfig ? "supported" : "not supported"}
- Draft preview: ${siteManifest.supportsDraftPreview ? "supported" : "not supported"}
- Inline editing: ${siteManifest.supportsInlineEditing ? "supported" : "not supported"}
- Supported design tokens: ${siteManifest.designTokens.join(", ") || "(none)"}
- Editable sections: ${agentEditableSections.join(", ") || "(none)"}
- Custom-only features: ${siteManifest.customOnlyFeatures.join(", ") || "(none)"}
- Custom request endpoint: ${siteManifest.customRequestEndpoint || "(none)"}
Only use tools for manifest-supported sections and actions. If the user requests cart, rewards, checkout, product-modal, email-popup, chat, or another custom-only feature, use request_custom_change instead of claiming it can be changed directly.`;

  // Build dynamic section enum from the capability-filtered template sections.
  const sectionEnum = z.enum(
    (agentEditableSections.length > 0 ? agentEditableSections : template.contentSections) as [string, ...string[]]
  );

  // All tools are always available — single plan includes everything.
  // The `capability` key is legacy bookkeeping kept to minimize diff; see
  // the flatten step below where it is stripped before passing to streamText.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allTools: Record<string, { capability: string; def: any }> = {
    read_section: {
      capability: "read_section",
      def: tool({
        description: "Read current content for a website section",
        inputSchema: z.object({ section: sectionEnum }),
        execute: async ({ section }) => {
          try {
            if (!manifestAllowsAction(siteManifest, section, "read")) {
              return { error: `${section} is not readable for this site's capability manifest` };
            }
            const { getContent } = await import("@/lib/storage");
            return await getContent(section as ContentSection, tenant);
          } catch (err) {
            return { error: `Failed to read ${section}: ${err instanceof Error ? err.message : "Unknown error"}` };
          }
        },
      }),
    },
    update_section: {
      capability: "update_section",
      def: tool({
        description: "Update content for a website section. Always read the section first, then send the COMPLETE updated data.",
        inputSchema: z.object({
          section: sectionEnum,
          data: z.record(z.string(), z.unknown()),
        }),
        execute: async ({ section, data }) => {
          try {
            const result = await applySectionUpdate({
              tenantId: tenant,
              section: section as ContentSection,
              data: data as Record<string, unknown>,
              tenantConfig: tenantConfig ?? null,
              siteManifest,
            });

            if (result.status === "failed") {
              recordActionResult({ status: "failed", sectionIds: [section], error: result.error });
              return { success: false, error: result.error, section, agentResultStatus: "failed" as const };
            }
            if (result.status === "blocked") {
              recordActionResult({ status: "blocked", sectionIds: [section], message: result.message });
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

            const autoPublish = result.status === "published";
            const sourceProof = "Source: Current site content, capability manifest, and AI governance rules";
            const message = autoPublish
              ? `Updated ${section} successfully`
              : `I've queued these changes to ${section} for review. They'll go live after approval.`;

            // Slack (route copy): includes the risk label + a short change summary.
            if (process.env.SLACK_WEBHOOK_URL) {
              const changeSummary = result.changes
                .slice(0, 5)
                .map((c) => `  • ${c.field}: "${c.before}" → "${c.after}"`)
                .join("\n");
              const tenantLabel = tenantConfig?.siteName || tenant;
              const riskLabel = result.risk.level !== "low" ? ` [${result.risk.level.toUpperCase()} RISK]` : "";
              fetch(process.env.SLACK_WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  text: autoPublish
                    ? `[${tenantLabel}] AI updated *${section}*${riskLabel}\n${changeSummary}`
                    : `[${tenantLabel}] AI drafted changes to *${section}*${riskLabel} — needs review at /admin/drafts\nReason: ${result.governance.reason}\n${changeSummary}`,
                }),
              }).catch(() => {});
            }

            const eventId = result.status === "queued" ? result.eventId : undefined;
            recordActionResult({
              status: autoPublish ? "published" : "queued",
              sectionIds: [section],
              eventIds: eventId ? [eventId] : undefined,
              message,
              sourceProof,
            });

            return {
              success: true,
              section,
              sectionIds: [section],
              eventId,
              eventIds: eventId ? [eventId] : undefined,
              governance: result.governance,
              risk: result.risk,
              diffs: result.diffs,
              applied: autoPublish,
              agentResultStatus: autoPublish ? ("published" as const) : ("queued" as const),
              message,
              sourceProof,
            };
          } catch (err) {
            const error = `Failed to update ${section}: ${err instanceof Error ? err.message : "Unknown error"}`;
            recordActionResult({ status: "failed", sectionIds: [section], error });
            return { success: false, error, section, agentResultStatus: "failed" as const };
          }
        },
      }),
    },
    request_custom_change: {
      capability: "request_custom_change",
      def: tool({
        description: "Queue a custom-code or custom-design request for a manifest custom-only feature such as cart, rewards, checkout, product-modal, email-popup, or chat.",
        inputSchema: z.object({
          feature: z.string().describe("The custom-only feature id from the site capability manifest"),
          summary: z.string().describe("Plain-English summary of the requested custom behavior or design change"),
        }),
        execute: async ({ feature, summary }) => {
          const normalizedFeature = feature.trim();
          const cleanSummary = summary.trim();
          if (!siteManifest.customOnlyFeatures.includes(normalizedFeature)) {
            const message = `${normalizedFeature} is not listed as a custom-only feature for this site's capability manifest.`;
            recordActionResult({ status: "blocked", message });
            return { success: false, blocked: true, message, agentResultStatus: "blocked" as const };
          }
          if (!cleanSummary) {
            const message = "A custom request summary is required.";
            recordActionResult({ status: "blocked", message });
            return { success: false, blocked: true, message, agentResultStatus: "blocked" as const };
          }

          // Care-plan rule: one active custom request at a time. If the owner
          // already has a request in flight, don't stack a second — tell them
          // what's pending and let them choose to fold this in or wait.
          const { getOpenChangeRequest } = await import("@/lib/events");
          const openRequest = await getOpenChangeRequest(tenant);
          if (openRequest) {
            const requestedAt =
              (openRequest.metadata?.requestedAt as string | undefined) ?? openRequest.createdAt;
            const message =
              `You already have a custom request in progress ("${openRequest.title}"), ` +
              "and we keep it to one at a time so nothing falls through the cracks. " +
              "Want me to add this to that one, or hold it until the first wraps up?";
            recordActionResult({
              status: "blocked",
              eventIds: [openRequest.id],
              message,
            });
            return {
              success: false,
              blocked: true,
              reason: "active_request_exists",
              activeRequest: { id: openRequest.id, title: openRequest.title, requestedAt },
              message,
              agentResultStatus: "blocked" as const,
            };
          }

          const requestUrl = getCustomRequestUrl(
            tenantConfig?.customRepo?.productionUrl || tenantConfig?.siteUrl,
            siteManifest.customRequestEndpoint
          );
          // Prefer SCAFFOLD_* env names; fall back to legacy REB_* so deployed
          // custom repos that still set the old name keep working.
          const secret =
            process.env.SCAFFOLD_CUSTOM_REQUEST_SECRET ??
            process.env.REB_CUSTOM_REQUEST_SECRET;
          if (!requestUrl || !secret) {
            const message = "Custom requests are not fully configured for this site yet.";
            recordActionResult({ status: "blocked", message });
            return { success: false, blocked: true, message, agentResultStatus: "blocked" as const };
          }
          try {
            const postResult = await postCustomChangeRequest({
              url: requestUrl,
              secret,
              feature: normalizedFeature,
              summary: cleanSummary,
            });
            if (!postResult.ok) {
              if (postResult.reason === "unsafe_url") {
                const message = "Custom request endpoint is not a safe external URL.";
                recordActionResult({ status: "blocked", message });
                return { success: false, blocked: true, message, agentResultStatus: "blocked" as const };
              }
              const message =
                postResult.reason === "http_error"
                  ? `Custom request failed with ${postResult.status}.`
                  : `Failed to send custom request: ${postResult.error}`;
              recordActionResult({ status: "failed", message });
              return { success: false, error: message, agentResultStatus: "failed" as const };
            }

            // Mirror the dashboard change-request route: record a pending
            // `change_request` event so both the chat path and the dashboard
            // panel share one queue state and the one-active-request wall trips
            // on either path. Event creation is best-effort — the custom repo
            // already accepted the request, so a queue-write failure must not
            // fail the tool.
            let queuedEventId: string | undefined;
            try {
              const { addEvent } = await import("@/lib/events");
              const { getCustomRepoMetadata, getTenantDeliveryModel, getTriageDueAt } =
                await import("@/lib/custom-repos");
              const deliveryModel = getTenantDeliveryModel(tenantConfig);
              const customRepo = getCustomRepoMetadata(tenantConfig);
              const requestedAt = new Date();
              const queued = await addEvent({
                tenantId: tenant,
                source: "ai",
                type: "change_request",
                title: `Requested custom ${normalizedFeature} change`,
                body: cleanSummary,
                status: "pending",
                metadata: {
                  feature: normalizedFeature,
                  kind: "custom_code_or_design_request",
                  requestKind: "custom_design",
                  workflowStatus: "requested",
                  requestedAt: requestedAt.toISOString(),
                  triageDueAt: getTriageDueAt(requestedAt),
                  deliveryModel,
                  customRepo: deliveryModel === "custom_repo" ? {
                    repoName: customRepo.repoName,
                    repoUrl: customRepo.repoUrl,
                    localPath: customRepo.localPath,
                    productionUrl: customRepo.productionUrl,
                    contractVersion: customRepo.contractVersion,
                  } : undefined,
                  complexity: "unclear",
                  quoteRequired: true,
                  requestedVia: "ai_agent",
                },
              });
              queuedEventId = queued.id;
            } catch (err) {
              logger.error("[agent request_custom_change] failed to queue change_request event", {
                error: err instanceof Error ? err.message : String(err),
              });
            }

            const message = `Custom ${normalizedFeature} request sent for review.`;
            recordActionResult({
              status: "queued",
              eventIds: queuedEventId ? [queuedEventId] : undefined,
              message,
            });
            return {
              success: true,
              feature: normalizedFeature,
              requestUrl,
              eventId: queuedEventId,
              eventIds: queuedEventId ? [queuedEventId] : undefined,
              agentResultStatus: "queued" as const,
              message,
            };
          } catch (err) {
            const error = `Failed to send custom request: ${err instanceof Error ? err.message : "Unknown error"}`;
            recordActionResult({ status: "failed", error });
            return { success: false, error, agentResultStatus: "failed" as const };
          }
        },
      }),
    },
    upload_image: {
      capability: "upload_image",
      def: tool({
        description: "Upload an image to the website. Use when the client shares a photo or wants to add an image to their site.",
        inputSchema: z.object({
          imageData: z.string().describe("Base64-encoded image data URL (e.g. data:image/jpeg;base64,...)"),
          filename: z.string().optional().describe("Desired filename for the image"),
        }),
        execute: async ({ imageData, filename }) => {
          try {
            const match = imageData.match(/^data:(image\/\w+);base64,(.+)$/);
            if (!match) {
              return { success: false, error: "Invalid image data. Expected a base64-encoded data URL (data:image/type;base64,...)." };
            }
            const buffer = Buffer.from(match[2], "base64");

            // Size cap: a base64 string from the model is unbounded, so cap the
            // decoded buffer at 5MB (parity with MAX_FILE_SIZE in upload-store
            // and MAX_SIZE in /api/media). Reject cleanly instead of throwing.
            const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;
            if (buffer.byteLength > MAX_UPLOAD_SIZE) {
              return { success: false, error: "Image too large (max 5MB)." };
            }

            // Defense in depth: verify the bytes are actually a raster image of
            // an allowed type (mirrors the /api/media allowlist) so a mislabeled
            // data URL — e.g. an SVG smuggled as image/png — can't slip through.
            const sniffed = sniffImageType(buffer);
            if (!sniffed) {
              return { success: false, error: "Invalid image. Allowed: JPEG, PNG, WebP, GIF, AVIF." };
            }

            const ext = match[1].split("/")[1] || "png";
            const finalFilename = filename || `upload-${Date.now()}.${ext}`;
            const blob = new Blob([buffer], { type: match[1] });
            const file = new File([blob], finalFilename, { type: match[1] });
            const { uploadFile } = await import("@/lib/storage");
            const { url } = await uploadFile(file);
            return { success: true, url, filename: finalFilename };
          } catch (err) {
            return { success: false, error: `Upload failed: ${err instanceof Error ? err.message : "Unknown error"}` };
          }
        },
      }),
    },
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
    draft_newsletter: {
      capability: "draft_newsletter",
      def: tool({
        description: "Draft an email newsletter. Creates a draft that must be approved before sending. Use this instead of sending newsletters directly.",
        inputSchema: z.object({
          subject: z.string(),
          body: z.string().describe("The email content in plain text or simple HTML"),
        }),
        execute: async ({ subject, body }) => {
          try {
            const { getSubscribers, logActivity } = await import("@/lib/storage");
            const { addEvent } = await import("@/lib/events");
            const subscribers = await getSubscribers(tenant);
            const active = subscribers.filter((s) => s.status === "active");
            if (active.length === 0) {
              recordActionResult({ status: "blocked", message: "No active subscribers" });
              return { success: false, error: "No active subscribers", agentResultStatus: "blocked" as const };
            }

            const event = await addEvent({
              tenantId: tenant,
              source: "ai",
              type: "newsletter_draft",
              title: `Newsletter draft: "${subject}"`,
              body: `To ${active.length} subscribers.\n\n${body.slice(0, 500)}${body.length > 500 ? "..." : ""}`,
              status: "pending",
              metadata: {
                kind: "newsletter_approval",
                subject,
                body,
                subscriberCount: active.length,
              },
            });
            recordActionResult({
              status: "queued",
              eventIds: [event.id],
              message: `Newsletter draft "${subject}" queued for review.`,
              sourceProof: "Source: Subscriber list stored in dashboard",
            });

            await logActivity({
              text: `AI drafted newsletter: "${subject}" for ${active.length} subscribers (pending approval)`,
              time: new Date().toISOString(),
              type: "newsletter",
              actor: "ai",
            }, tenant);

            return {
              success: true,
              drafted: true,
              eventId: event.id,
              eventIds: [event.id],
              agentResultStatus: "queued" as const,
              subscriberCount: active.length,
              message: `I've drafted the newsletter "${subject}" for ${active.length} subscribers. It's in the review queue for Jacob to approve before sending.`,
              sourceProof: "Source: Subscriber list stored in dashboard",
            };
          } catch (err) {
            const error = err instanceof Error ? err.message : "Failed to draft";
            recordActionResult({ status: "failed", error });
            return { success: false, error, agentResultStatus: "failed" as const };
          }
        },
      }),
    },
    list_subscribers: {
      capability: "list_subscribers",
      def: tool({
        description: "List all newsletter subscribers and their count",
        inputSchema: z.object({}),
        execute: async () => {
          const { getSubscribers } = await import("@/lib/storage");
          const subscribers = await getSubscribers(tenant);
          return {
            count: subscribers.length,
            subscribers: subscribers.map((s: { email: string; name?: string; subscribedAt: string }) => ({
              email: s.email,
              name: s.name,
              subscribedAt: s.subscribedAt,
            })),
          };
        },
      }),
    },
    draft_social_post: {
      capability: "draft_social_post",
      def: tool({
        description: "Draft a social media post. Creates it as a draft that the owner can review, schedule, or publish.",
        inputSchema: z.object({
          platform: z.enum(["instagram", "facebook", "x"]).describe("Target social platform"),
          content: z.string().describe("The post content/caption"),
          imageUrl: z.string().optional().describe("Optional image URL to attach"),
        }),
        execute: async ({ platform, content, imageUrl }) => {
          try {
            const { getSocialPosts, setSocialPosts } = await import("@/lib/storage");
            const post = {
              id: `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              platform,
              content,
              imageUrl: imageUrl || undefined,
              status: "draft" as const,
              createdAt: new Date().toISOString(),
            };
            const posts = await getSocialPosts(tenant);
            posts.unshift(post);
            await setSocialPosts(tenant, posts);
            recordActionResult({
              status: "drafted",
              message: `Social post draft saved for ${platform}.`,
              sourceProof: "Source: Social drafts stored in dashboard",
            });
            return {
              success: true,
              post,
              agentResultStatus: "drafted" as const,
              sourceProof: "Source: Social drafts stored in dashboard",
            };
          } catch (err) {
            const error = err instanceof Error ? err.message : "Failed to create post";
            recordActionResult({ status: "failed", error });
            return { success: false, error, agentResultStatus: "failed" as const };
          }
        },
      }),
    },
    list_social_posts: {
      capability: "list_social_posts",
      def: tool({
        description: "List recent social media posts with their status (draft, scheduled, published)",
        inputSchema: z.object({
          status: z.enum(["draft", "scheduled", "published"]).optional().describe("Filter by status"),
        }),
        execute: async ({ status }) => {
          try {
            const { getSocialPosts } = await import("@/lib/storage");
            let posts = await getSocialPosts(tenant);
            if (status) posts = posts.filter((p) => p.status === status);
            return {
              count: posts.length,
              posts: posts.slice(0, 20).map((p) => ({
                id: p.id,
                platform: p.platform,
                content: p.content.slice(0, 100) + (p.content.length > 100 ? "..." : ""),
                status: p.status,
                scheduledFor: p.scheduledFor,
                publishedAt: p.publishedAt,
                createdAt: p.createdAt,
              })),
            };
          } catch (err) {
            return { error: err instanceof Error ? err.message : "Failed to list posts" };
          }
        },
      }),
    },
    schedule_social_post: {
      capability: "schedule_social_post",
      def: tool({
        description: "Schedule a draft social post for a specific date and time",
        inputSchema: z.object({
          postId: z.string().describe("The ID of the draft post to schedule"),
          scheduledFor: z.string().describe("ISO date string for when to publish (e.g. 2026-04-15T10:00:00Z)"),
        }),
        execute: async ({ postId, scheduledFor }) => {
          try {
            const { getSocialPosts, setSocialPosts } = await import("@/lib/storage");
            const posts = await getSocialPosts(tenant);
            const post = posts.find((p) => p.id === postId);
            if (!post) return { success: false, error: "Post not found" };
            if (post.status !== "draft") return { success: false, error: `Post is ${post.status}, not a draft` };
            post.status = "scheduled";
            post.scheduledFor = scheduledFor;
            await setSocialPosts(tenant, posts);
            return { success: true, post };
          } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : "Failed to schedule" };
          }
        },
      }),
    },
    get_reviews: {
      capability: "get_reviews",
      def: tool({
        description: "Get all customer reviews across platforms (Google, Yelp, manual)",
        inputSchema: z.object({}),
        execute: async () => {
          try {
            const { getReviews } = await import("@/lib/reviews");
            const reviews = await getReviews(tenant);
            const avg = reviews.length > 0
              ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
              : 0;
            return {
              reviews: reviews.slice(0, 20),
              total: reviews.length,
              averageRating: Math.round(avg * 10) / 10,
              unreplied: reviews.filter((r) => !r.reply).length,
              sourceProof: "Source: Reviews stored in dashboard",
            };
          } catch (err) {
            return { error: `Failed to get reviews: ${err instanceof Error ? err.message : "Unknown error"}` };
          }
        },
      }),
    },
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
              message: "I sent that layout change to the review queue. Jacob needs to approve structural site changes before they go live.",
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
              message: "I sent that layout change to the review queue. Jacob needs to approve structural site changes before they go live.",
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
    reply_to_review: {
      capability: "respond_review",
      def: tool({
        description: "Reply to a customer review by ID. Use get_reviews first to find the review ID.",
        inputSchema: z.object({
          reviewId: z.string().describe("The review ID to reply to"),
          replyText: z.string().describe("The reply text"),
        }),
        execute: async ({ reviewId, replyText }) => {
          try {
            const { replyToReview } = await import("@/lib/reviews");
            const updated = await replyToReview(tenant, reviewId, replyText);
            if (!updated) {
              return { success: false, error: "Review not found" };
            }

            try {
              const { logActivity } = await import("@/lib/storage");
              await logActivity({
                text: `AI replied to ${updated.author}'s ${updated.rating}-star review`,
                time: new Date().toISOString(),
                type: "review-reply",
                actor: "ai",
              }, tenant);
            } catch {}

            return {
              success: true,
              review: updated,
              message: `Replied to ${updated.author}'s review`,
            };
          } catch (err) {
            const error = `Failed to reply: ${err instanceof Error ? err.message : "Unknown error"}`;
            recordActionResult({ status: "failed", error });
            return { success: false, error, agentResultStatus: "failed" as const };
          }
        },
      }),
    },
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
          const templateDef = await getTemplateForTenant(tenant);
          const sectionsWithContent = await Promise.all(
            templateDef.contentSections.map(async (s) => {
              const data = await getContent(s, tenant);
              return data && Object.keys(data).length > 0 ? 1 : 0;
            })
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
          const templateDef = await getTemplateForTenant(tenant);
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
          const { getSanityReadClient } = await import("@/lib/sanity");
          const query = `*[_type == "sanity.imageAsset" && label == $tenant] | order(_createdAt desc) [0...20] {
            _id,
            url,
            originalFilename
          }`;
          const raw = await getSanityReadClient().fetch(query, { tenant });
          const assets = (raw || []) as Array<{ _id: string; url: string; originalFilename: string }>;

          return {
            __inlineTool: "show_photos",
            photos: assets.slice(0, 6).map((a) => ({
              id: a._id,
              url: a.url,
              filename: a.originalFilename || "untitled",
            })),
            total: assets.length,
          };
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
          const domain = config?.productionDomain || `${tenant}.${ROOT_DOMAIN}`;
          const url = `https://${domain}`;

          return {
            __inlineTool: "preview_site",
            url,
            siteName: (settings?.siteName as string) || tenant,
          };
        },
      }),
    },
    list_entries: {
      capability: "list_entries",
      def: tool({
        description:
          "List CMS collection entries (blog posts, videos, or products) for this site. Use this to see what already exists before creating or editing one.",
        inputSchema: z.object({
          type: z.enum(["blog", "video", "product"]),
          status: z.enum(["draft", "published"]).optional(),
        }),
        execute: async ({ type, status }) => {
          try {
            const { listEntriesForType } = await import("@/lib/cms/collections-service");
            const entries = await listEntriesForType(tenant, type, status ? { status } : undefined);
            return {
              entries: entries.map((e) => ({
                slug: e.slug,
                status: e.status,
                data: e.data,
                updatedAt: e.updated_at,
              })),
            };
          } catch (err) {
            return { error: `Failed to list ${type} entries: ${err instanceof Error ? err.message : "Unknown error"}` };
          }
        },
      }),
    },
    save_entry: {
      capability: "save_entry",
      def: tool({
        description:
          "Create or update a CMS collection entry (a blog post, video, or product). Provide the type and the entry fields in `data` (e.g. blog: title, excerpt, body, tags). The slug is derived from the title if omitted. AI-authored entries are saved as DRAFTS for the owner to review and publish.",
        inputSchema: z.object({
          type: z.enum(["blog", "video", "product"]),
          data: z.record(z.string(), z.unknown()),
          slug: z.string().optional(),
        }),
        execute: async ({ type, data, slug }) => {
          try {
            const { saveEntry } = await import("@/lib/cms/collections-service");
            // Governance: the agent drafts; a human publishes from the editor.
            const result = await saveEntry({
              tenant,
              type,
              data: data as Record<string, unknown>,
              slug,
              status: "draft",
              actor: "ai",
            });
            if (!result.ok) return { success: false, error: result.error };
            return {
              success: true,
              slug: result.entry.slug,
              status: result.entry.status,
              message: `Saved a draft ${type} entry "${result.entry.slug}". It will go live after you publish it.`,
            };
          } catch (err) {
            return { success: false, error: `Failed to save ${type} entry: ${err instanceof Error ? err.message : "Unknown error"}` };
          }
        },
      }),
    },
  };

  // Every active-subscription tenant gets every tool. No tier gating.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, any> = {};
  for (const [name, { def }] of Object.entries(allTools)) {
    tools[name] = def;
  }

  // Primary/fallback model resilience: chat survives a Gemini outage by
  // retrying the whole turn on the configured fallback model — but only when
  // the primary fails *before* any content reached the client, so we never
  // duplicate a half-streamed answer. Mirrors src/lib/agent-executor.ts.
  const primaryModel = getPrimaryModel();
  const fallbackModel = getFallbackModel();

  const startStream = (model: typeof primaryModel.model) =>
    streamText({
      model,
      system: systemPrompt,
      messages,
      tools,
      stopWhen: stepCountIs(8),
    });

  // Stream text + tool-call status events as SSE-like lines
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      // Tracks whether anything visible has been emitted on THIS request, so
      // the fallback only fires when retrying is still safe (no partial output).
      let emittedToClient = false;

      const runModel = async (model: typeof primaryModel.model): Promise<void> => {
        const result = startStream(model);
        for await (const part of result.fullStream) {
          if (part.type === "error") {
            // Surface as a thrown error so the catch below can decide on fallback.
            throw part.error;
          } else if (part.type === "tool-call") {
            emittedToClient = true;
            const toolName = part.toolName;
            const input = ("args" in part ? part.args : "input" in part ? part.input : undefined) as Record<string, unknown> | undefined;
            const section = input?.section as string | undefined;

            // Proof-signal: fire-and-forget Slack + Redis counter (Workstream E).
            // Do NOT await — chat latency must not depend on Slack.
            void recordAgentToolCall({
              tenantId: tenant,
              siteName: signalSiteName,
              userMessage: lastUserMessage,
              toolName,
              source: signalSource,
            });
            const label =
              toolName === "read_section" ? `Reading your ${section || "content"}...` :
              toolName === "update_section" ? `Updating your ${section || "content"}...` :
              toolName === "upload_image" ? "Uploading image..." :
              toolName === "get_metrics" ? "Checking your metrics..." :
              toolName === "get_activity" ? "Looking at recent activity..." :
              toolName === "send_newsletter" ? "Sending newsletter..." :
              toolName === "list_subscribers" ? "Checking subscribers..." :
              toolName === "draft_social_post" ? "Drafting social post..." :
              toolName === "list_social_posts" ? "Checking social posts..." :
              toolName === "schedule_social_post" ? "Scheduling social post..." :
              toolName === "get_reviews" ? "Checking your reviews..." :
              toolName === "reply_to_review" ? "Replying to review..." :
              toolName === "toggle_section_visibility" ? "Updating section visibility..." :
              toolName === "reorder_sections" ? "Reordering sections..." :
              toolName === "show_report" ? "Loading your report..." :
              toolName === "show_content" ? "Loading site content..." :
              toolName === "show_photos" ? "Loading photos..." :
              toolName === "show_connections" ? "Checking connections..." :
              toolName === "preview_site" ? "Loading site preview..." :
              "Working on it...";
            controller.enqueue(encoder.encode(`__TOOL__${label}\n`));
          } else if (part.type === "tool-result") {
            const output = ("result" in part ? part.result : "output" in part ? part.output : undefined) as unknown;
            const actionResult = agentResultFromToolOutput(output);
            if (actionResult) recordActionResult(actionResult);
          } else if (part.type === "text-delta") {
            const text = "text" in part ? part.text : "";
            if (text) emittedToClient = true;
            controller.enqueue(encoder.encode(text));
          }
        }
      };

      try {
        try {
          await runModel(primaryModel.model);
        } catch (primaryErr) {
          // Retry on the fallback model only when it's safe (nothing streamed
          // yet) and the failure looks transient (outage / rate limit / 5xx).
          if (fallbackModel && !emittedToClient && isTransientModelError(primaryErr)) {
            logger.warn("[agent-chat] Primary model failed, trying fallback", {
              primary: primaryModel.label,
              fallback: fallbackModel.label,
              tenant,
              error: primaryErr instanceof Error ? primaryErr.message : "unknown",
            });
            await runModel(fallbackModel.model);
          } else {
            throw primaryErr;
          }
        }
      } catch (err) {
        // Both models failed (or the client disconnected). If nothing was
        // streamed, send a plain-English line so the chat doesn't go silent.
        if (!emittedToClient) {
          logger.error("[agent-chat] Chat turn failed with no fallback recovery", {
            tenant,
            error: err instanceof Error ? err.message : "unknown",
          });
          // Surface to Sentry — a total AI-turn failure (both models down) is
          // otherwise console-only and invisible in production.
          trackError(err, { tenant, op: "agent.chat" });
          try {
            controller.enqueue(
              encoder.encode(
                "Sorry — I'm having trouble reaching the AI right now. Please try that again in a moment."
              )
            );
          } catch {
            // Client already gone.
          }
        }
      } finally {
        try {
          controller.enqueue(encoder.encode(`\n__RESULT__${JSON.stringify(buildAgentResultContract(actionResults))}\n`));
        } catch {
          // Client disconnected before the final result contract could be sent.
        }
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
}
