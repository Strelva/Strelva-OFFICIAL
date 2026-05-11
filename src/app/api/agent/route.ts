import { streamText, tool, stepCountIs } from "ai";
import type { ModelMessage } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { requireTenantAccess, requireTenantPermission } from "@/lib/auth";
import { getContent, getClickCounts } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTemplateForTenant } from "@/components/templates/registry";
import { getTenantConfig } from "@/lib/tenants";
import { getConnections } from "@/lib/connections";
import {
  DISCOVERABLE_INTEGRATIONS,
  deriveIntelligenceStatus,
  getIntegrationCategories,
  normalizeIntegrationStatus,
  type RawTenantConnectionSettings,
} from "@/lib/integration-registry";
import { requireActiveSubscription } from "@/lib/subscription";
import { capabilityPromptFragment } from "@/lib/capabilities";
import { getSiteCapabilityManifest, manifestAllowsAction } from "@/lib/site-capabilities";
import { isRateLimitedAsync } from "@/lib/rate-limit";
import { classifySource, recordAgentToolCall } from "@/lib/proof-signals";
import { decideAiContentGovernance } from "@/lib/ai-governance";
import { queueAiContentReview } from "@/lib/ai-review-queue";
import { assessRisk, classifyOperation, generatePreviewDiffs, type NodeContext } from "@/lib/agent-risk";
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

function logisticsGuardrail(sectionNames: string): string {
  return `OPERATING BOUNDARIES:
- You are a website/content operations assistant, not the business's order desk, fulfillment team, inventory system, payment processor, booking agent, or customer support inbox.
- Stay inside what this platform can actually do: read current website content, draft copy, update approved content sections, queue risky changes for review, summarize available metrics/activity/reviews, draft newsletters/social posts, and point users to their configured external systems.
- Do not invent logistics facts such as shipping timelines, delivery areas, pickup windows, stock levels, wholesale terms, refund policies, certifications, nutrition claims, event availability, booking availability, or operational commitments unless they are explicitly present in the current site content, tenant rules, or connected tool output.
- If the user asks for something outside the platform's control, explain the boundary briefly and offer the closest supported action, such as drafting website copy, adding a FAQ, updating contact details, or creating an approval-ready draft.
- When recommending changes, prioritize high-value website work: clearer contact/ordering path, trust proof, product/service clarity, fresh updates, conversion copy, and weekly-report-worthy proof.
- Before changing content, read the relevant section first and preserve existing data. Available editable sections are: ${sectionNames}.`;
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
  const template = await getTemplateForTenant(tenant);
  const sections = template.contentSections;

  // Fetch all content sections + booking clicks in parallel
  const contentEntries = await Promise.all(
    sections.map(async (s) => [s, await getContent(s, tenant)] as unknown as [ContentSection, Record<string, unknown>])
  );
  const content: Record<string, Record<string, unknown>> = Object.fromEntries(contentEntries);
  const bookingClicks = await getClickCounts("booking-click", tenant);

  const settings = content.settings || {};
  const contact = content.contact || {};
  const hero = content.hero || {};
  const story = content.story || {};

  const ownerName = (settings.ownerName as string) || "the owner";
  const ownerTitle = (settings.ownerTitle as string) || "";

  // Build dynamic section summaries
  const sectionSummaries: string[] = [];

  sectionSummaries.push(`ABOUT THE BUSINESS:
- Owner: ${ownerName}${ownerTitle ? `, ${ownerTitle}` : ""}
- Phone: ${contact.phone || "(not set)"}
- Email: ${contact.email || "(not set)"}
- Address: ${contact.address || "(not set)"}
- Hours: ${contact.hours || "(not set)"}${settings.bookingUrl ? `\n- Booking: ${settings.bookingUrl}` : ""}`);

  if (sections.includes("hero")) {
    sectionSummaries.push(`HERO SECTION:
- Headline: ${hero.headline || "(not set)"}
- Subheadline: ${hero.subheadline || "(not set)"}
- CTA: ${hero.ctaText || "(not set)"}`);
  }

  if (sections.includes("story")) {
    sectionSummaries.push(`ABOUT/STORY:
- Headline: ${story.headline || "(not set)"}
- Statement: ${story.statement || "(not set)"}
- ${(story.paragraphs as string[])?.length || 0} paragraphs, ${(story.stats as unknown[])?.length || 0} stats`);
  }

  if (sections.includes("services") && content.services) {
    const svc = content.services;
    const serviceList = ((svc.services as Array<{ name: string; duration: string; price: string; id: string }>) || [])
      .map((s) => `- ${s.name} (${s.duration}, $${s.price}) [id: ${s.id}]`)
      .join("\n");
    sectionSummaries.push(`CURRENT SERVICES (${((svc.services as unknown[]) || []).length} listed):\n${serviceList}`);
  }

  if (sections.includes("products") && content.products) {
    const prod = content.products;
    const productList = ((prod.products as Array<{ name: string; price: string; id: string }>) || [])
      .map((p) => `- ${p.name} ($${p.price}) [id: ${p.id}]`)
      .join("\n");
    sectionSummaries.push(`PRODUCTS (${((prod.products as unknown[]) || []).length} listed):\n${productList}`);
  }

  if (sections.includes("events") && content.events) {
    const evt = content.events;
    const futureEvents = ((evt.events as Array<{ title: string; date: string }>) || [])
      .filter((e) => new Date(e.date) >= new Date())
      .map((e) => `- ${e.title} (${e.date})`)
      .join("\n");
    sectionSummaries.push(futureEvents ? `UPCOMING EVENTS:\n${futureEvents}` : "No upcoming events listed.");
  }

  if (sections.includes("testimonials") && content.testimonials) {
    sectionSummaries.push(`TESTIMONIALS: ${(content.testimonials.testimonials as unknown[])?.length || 0} reviews listed.`);
  }

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

  sectionSummaries.push(`SITE PERFORMANCE:\n- Booking clicks: ${bookingClicks.total} total (${bookingClicks.thisWeek} this week)`);

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

  let prompt = `You are the website assistant for ${(settings.siteName as string) || "this business"}.

${sectionSummaries.join("\n\n")}

You can read and update any section of the website. Always read the current content first before making changes. When updating, send back the COMPLETE section data — do not send partial updates.

Available sections: ${sectionNames}.`;

  prompt += `\n\n${logisticsGuardrail(sectionNames)}`;

  if (settings.bookingUrl) {
    const tenantConfig = await getTenantConfig(tenant);
    const provider = tenantConfig?.bookingProvider || "their booking platform";
    prompt += `\n\nBOOKING: All booking is handled through ${provider} at ${settings.bookingUrl}. When someone asks about booking, direct them there. You cannot book appointments directly — always link to the booking page.`;
  }

  prompt += `\n\nSOURCE-PROOF RULES:
- When you use a connected or built-in source, include one compact proof line such as "Source: Search Console, last updated May 9", "Source: Site activity, 14-day window", or "Source: Reviews stored in dashboard".
- If the user asks for an @Source that is not connected or has no data, say that plainly before giving a fallback recommendation.
- Never imply live posting, calendar sync, Google listing updates, or newsletter sending unless a tool result shows that exact approval-gated action is available. Use "draft", "suggest", or "queue for review" for incomplete action paths.`;

  prompt += `\n\n${capFragment}`;

  // Inject tenant-level AI personality and rules
  const tenantCfg = await getTenantConfig(tenant);

  const personalityDesc = tenantCfg?.personality || "conversational, warm, and helpful";
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
  const { userId } = await auth();
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
            if (!manifestAllowsAction(siteManifest, section, "draft")) {
              const message = `${section} is not editable for this site's capability manifest. Send a custom request for this change.`;
              recordActionResult({ status: "blocked", sectionIds: [section], message });
              return { success: false, blocked: true, section, message, agentResultStatus: "blocked" as const };
            }
            const { sectionSchemas } = await import("@/lib/schemas");
            const schema = sectionSchemas[section as ContentSection];
            const parsed = schema.safeParse(data);
            if (!parsed.success) {
              const toolResult = { success: false, error: parsed.error.message, section, agentResultStatus: "failed" as const };
              recordActionResult({ status: "failed", sectionIds: [section], error: parsed.error.message });
              return toolResult;
            }

            const { getContent, setContent } = await import("@/lib/storage");
            const current = (await getContent(section as ContentSection, tenant)) as unknown as Record<string, unknown>;

            // Classify operation and assess risk
            const operation = classifyOperation(section as ContentSection, current, data as Record<string, unknown>);
            const risk = assessRisk(operation);
            const diffs = generatePreviewDiffs(current, data as Record<string, unknown>);

            // Legacy array reduction check (kept for backwards compatibility)
            for (const key of Object.keys(current)) {
              if (Array.isArray(current[key]) && Array.isArray((data as Record<string, unknown>)[key])) {
                const oldLen = (current[key] as unknown[]).length;
                const newLen = ((data as Record<string, unknown>)[key] as unknown[]).length;
                if (oldLen > 0 && newLen < oldLen * 0.5) {
                  const message = `This would remove ${oldLen - newLen} of ${oldLen} ${key}. Please confirm you want to remove these specific items.`;
                  recordActionResult({ status: "blocked", sectionIds: [section], message });
                  return {
                    success: false,
                    error: message,
                    section,
                    agentResultStatus: "blocked" as const,
                    risk,
                    diffs,
                  };
                }
              }
            }

            const governance = decideAiContentGovernance(section as ContentSection, parsed.data, {
              tenantAutoPublish: tenantConfig?.autoPublish,
            });

            if (governance.action === "block") {
              const message = "I can't make that change directly. Jacob needs to handle structural site changes.";
              recordActionResult({ status: "blocked", sectionIds: [section], message });
              return {
                success: false,
                blocked: true,
                reason: governance.reason,
                message,
                section,
                agentResultStatus: "blocked" as const,
                risk,
              };
            }

            // Route any non-publishable AI change to the durable review queue.
            const shouldRouteToReview = risk.level === "high" || (risk.level === "medium" && !risk.autoApply);
            const autoPublish =
              governance.action === "publish" &&
              !shouldRouteToReview &&
              manifestAllowsAction(siteManifest, section, "publish");
            let queuedEventId: string | undefined;

            if (autoPublish) {
              await setContent(section as ContentSection, parsed.data as Parameters<typeof setContent>[1], tenant);
              // Record version for history
              const { appendVersion } = await import("@/lib/storage");
              const { diffFields } = await import("@/lib/utils");
              await appendVersion(section as ContentSection, parsed.data, "ai", tenant, diffFields(current, data as Record<string, unknown>));
              const { revalidatePath } = await import("next/cache");
              revalidatePath("/");
            } else {
              const event = await queueAiContentReview({
                tenantId: tenant,
                section: section as ContentSection,
                currentData: current,
                proposedData: parsed.data as Record<string, unknown>,
                diffs,
                risk,
                governance,
              });
              queuedEventId = event.id;

              const { setDraftContent } = await import("@/lib/storage");
              await setDraftContent(section as ContentSection, parsed.data as Parameters<typeof setContent>[1], tenant);
            }

            if (process.env.SLACK_WEBHOOK_URL) {
              const { diffFields } = await import("@/lib/utils");
              const changeSummary = diffFields(current, data as Record<string, unknown>)
                .slice(0, 5)
                .map((c) => `  • ${c.field}: "${c.before}" → "${c.after}"`)
                .join("\n");
              const tenantLabel = tenantConfig?.siteName || tenant;
              const riskLabel = risk.level !== "low" ? ` [${risk.level.toUpperCase()} RISK]` : "";
              fetch(process.env.SLACK_WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                text: autoPublish
                  ? `[${tenantLabel}] AI updated *${section}*${riskLabel}\n${changeSummary}`
                  : `[${tenantLabel}] AI drafted changes to *${section}*${riskLabel} — needs review at /admin/drafts\nReason: ${governance.reason}\n${changeSummary}`,
                }),
              }).catch(() => {});
            }

            try {
              const { logActivity, recordSectionUpdate } = await import("@/lib/storage");
              const { diffFields } = await import("@/lib/utils");
              const changes = diffFields(current, data as Record<string, unknown>);
              await logActivity({
                text: autoPublish ? `AI updated ${section}` : `AI drafted changes to ${section} (pending review)`,
                time: new Date().toISOString(),
                type: "ai",
                section,
                actor: "ai",
                changes,
                eventStatus: autoPublish ? "auto_approved" : "pending",
                governanceReason: governance.reason,
                riskLevel: risk.level,
                suppressEvent: !autoPublish,
              }, tenant);
              if (autoPublish) await recordSectionUpdate(section, tenant);
            } catch {}

            const agentResultStatus = autoPublish
              ? "published"
              : "queued";
            const message = autoPublish
              ? `Updated ${section} successfully`
              : `I've queued these changes to ${section} for review. They'll go live after approval.`;
            recordActionResult({
              status: agentResultStatus,
              sectionIds: [section],
              eventIds: queuedEventId ? [queuedEventId] : undefined,
              message,
            });

            return {
              success: true,
              section,
              sectionIds: [section],
              eventId: queuedEventId,
              eventIds: queuedEventId ? [queuedEventId] : undefined,
              governance,
              risk,
              diffs,
              applied: autoPublish,
              agentResultStatus,
              message,
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

          const requestUrl = getCustomRequestUrl(
            tenantConfig?.customRepo?.productionUrl || tenantConfig?.siteUrl,
            siteManifest.customRequestEndpoint
          );
          const secret = process.env.REB_CUSTOM_REQUEST_SECRET;
          if (!requestUrl || !secret) {
            const message = "Custom requests are not fully configured for this site yet.";
            recordActionResult({ status: "blocked", message });
            return { success: false, blocked: true, message, agentResultStatus: "blocked" as const };
          }

          try {
            const response = await fetch(requestUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${secret}`,
              },
              body: JSON.stringify({
                feature: normalizedFeature,
                summary: cleanSummary,
                requestedBy: "REB AI agent",
              }),
            });

            if (!response.ok) {
              const message = `Custom request failed with ${response.status}.`;
              recordActionResult({ status: "failed", message });
              return { success: false, error: message, agentResultStatus: "failed" as const };
            }

            const message = `Custom ${normalizedFeature} request sent for review.`;
            recordActionResult({ status: "queued", message });
            return {
              success: true,
              feature: normalizedFeature,
              requestUrl,
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
            });
            return { success: true, post, agentResultStatus: "drafted" as const };
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
            });
            return {
              success: false,
              blocked: true,
              sectionIds: order,
              eventId: event.id,
              eventIds: [event.id],
              agentResultStatus: "queued" as const,
              message: "I sent that layout change to the review queue. Jacob needs to approve structural site changes before they go live.",
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
              aiCanUseThisTo: integration.aiCanUseThisTo,
              exampleInsight: integration.exampleInsight,
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
          const domain = config?.productionDomain || `${tenant}.scaffoldweb.com`;
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

  // Every active-subscription tenant gets every tool. No tier gating.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, any> = {};
  for (const [name, { def }] of Object.entries(allTools)) {
    tools[name] = def;
  }

  const result = streamText({
    model: google("gemini-2.5-flash"),
    system: systemPrompt,
    messages,
    tools,
    stopWhen: stepCountIs(8),
  });

  // Stream text + tool-call status events as SSE-like lines
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const part of result.fullStream) {
          if (part.type === "tool-call") {
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
            controller.enqueue(encoder.encode("text" in part ? part.text : ""));
          }
        }
      } catch {
        // Stream closed by client
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
