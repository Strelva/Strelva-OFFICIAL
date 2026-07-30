/**
 * Shared building blocks for the tenant AI agent system prompt.
 *
 * Both tenant-facing agent surfaces — the streaming dashboard chat
 * (`src/app/api/agent/route.ts`) and the programmatic executor
 * (`src/lib/agent-executor.ts`) — built an independent, copy-pasted
 * `buildSystemPrompt`. They had drifted, but the data-load preamble, the
 * OPERATING BOUNDARIES guardrail, and the core section summaries (about/hero/
 * story/services/events/testimonials/performance) were byte-identical.
 *
 * That common core lives here so there's one source of truth. Each surface
 * still assembles its own final prompt (the chat adds search-console / reviews /
 * source-proof / plan-scope / business-rules; the executor adds caching +
 * stale-section hints), so neither surface's prompt OUTPUT changes — only the
 * duplication is removed. All tenant-controlled values stay sanitized.
 */

import {
  getClickCounts,
  getClickCountsByPrefix,
  getContent,
  getSearchData,
} from "@/lib/storage";
import { getTemplateManifestForTenant } from "@/lib/template-manifests";
import { sanitizePromptValue } from "@/lib/capabilities";
import { getReviews } from "@/lib/reviews";
import { getTenantConfig } from "@/lib/tenants";
import type { ContentSection } from "@/lib/types";

export function logisticsGuardrail(sectionNames: string): string {
  return `OPERATING BOUNDARIES:
- You are a website/content operations assistant, not the business's order desk, fulfillment team, inventory system, payment processor, booking agent, or customer support inbox.
- Stay inside what this platform can actually do: read current website content, draft copy, update approved content sections, queue risky changes for review, summarize available metrics/activity/reviews, draft newsletters/social posts, and point users to their configured external systems.
- Do not invent logistics facts such as shipping timelines, delivery areas, pickup windows, stock levels, wholesale terms, refund policies, certifications, nutrition claims, event availability, booking availability, or operational commitments unless they are explicitly present in the current site content, tenant rules, or connected tool output.
- If the user asks for something outside the platform's control, explain the boundary briefly and offer the closest supported action, such as drafting website copy, adding a FAQ, updating contact details, or creating an approval-ready draft.
- When recommending changes, prioritize high-value website work: clearer contact/ordering path, trust proof, product/service clarity, fresh updates, conversion copy, and weekly-report-worthy proof.
- Before changing content, read the relevant section first and preserve existing data. Available editable sections are: ${sectionNames}.`;
}

/**
 * Anti-slop voice guard shared by both tenant agent surfaces. Tone-only — it
 * shapes HOW the assistant writes to the owner and into site copy, and changes
 * no tool, governance, or logic. Keeps the assistant sounding like a sharp,
 * warm human instead of generic SaaS.
 */
export function copyVoiceGuard(): string {
  return `HOW YOU WRITE:
- Sound like a sharp, warm human who knows this business — plain, specific, confident. Never like software, a marketing brochure, or a generic SaaS.
- Talk about the owner's real world: "your website", "the people who found you", "your Google listing", "your booking link" — not "the platform", "users", "conversions", or "functionality".
- Short, concrete sentences in active voice. Say the actual thing.
- Never write these words to the owner or into site copy: leverage, utilize, implement, functionality, solution, seamless, robust, streamline, empower, unlock, elevate, cutting-edge, "in today's", "e-commerce". No em dashes and no feature-spec phrasing.`;
}

export interface AgentPromptContent {
  sections: ContentSection[];
  content: Record<string, Record<string, unknown>>;
  settings: Record<string, unknown>;
  contact: Record<string, unknown>;
  hero: Record<string, unknown>;
  story: Record<string, unknown>;
  ownerName: string;
  ownerTitle: string;
  bookingClicks: Awaited<ReturnType<typeof getClickCounts>>;
}

/**
 * Load + destructure the tenant content the prompt builders need. The
 * ownerName/ownerTitle are sanitized here since they feed the prompt directly;
 * callers sanitize the rest at interpolation.
 */
export async function loadAgentPromptContent(tenant: string): Promise<AgentPromptContent> {
  const template = await getTemplateManifestForTenant(tenant);
  const sections = template.contentSections;

  const contentEntries = await Promise.all(
    sections.map(
      async (s) =>
        [s, await getContent(s, tenant)] as unknown as [ContentSection, Record<string, unknown>]
    )
  );
  const content: Record<string, Record<string, unknown>> = Object.fromEntries(contentEntries);
  const bookingClicks = await getClickCounts("booking-click", tenant);

  const settings = content.settings || {};
  const contact = content.contact || {};
  const hero = content.hero || {};
  const story = content.story || {};

  const ownerName = sanitizePromptValue(settings.ownerName) || "the owner";
  const ownerTitle = sanitizePromptValue(settings.ownerTitle);

  return { sections, content, settings, contact, hero, story, ownerName, ownerTitle, bookingClicks };
}

/**
 * Per-section summary blocks, each identical to the prior inline copies. They're
 * granular (rather than one lumped list) because the two surfaces interleave
 * their own extra sections — the chat puts `products` between services and
 * events, etc. — so each caller invokes these in its own order to keep its
 * prompt output byte-for-byte unchanged. Blocks return null when not applicable.
 */
export function aboutBlock(ctx: AgentPromptContent): string {
  const { settings, contact, ownerName, ownerTitle } = ctx;
  const brandVoice = sanitizePromptValue(settings.brandVoice);
  return `ABOUT THE BUSINESS:
- Owner: ${ownerName}${ownerTitle ? `, ${ownerTitle}` : ""}
- Phone: ${sanitizePromptValue(contact.phone) || "(not set)"}
- Email: ${sanitizePromptValue(contact.email) || "(not set)"}
- Address: ${sanitizePromptValue(contact.address) || "(not set)"}
- Hours: ${sanitizePromptValue(contact.hours) || "(not set)"}${settings.bookingUrl ? `\n- Booking: ${sanitizePromptValue(settings.bookingUrl)}` : ""}${brandVoice ? `\n- Voice & tone (write in this voice): ${brandVoice}` : ""}`;
}

export function heroBlock(ctx: AgentPromptContent): string | null {
  if (!ctx.sections.includes("hero")) return null;
  const { hero } = ctx;
  return `HERO SECTION:
- Headline: ${sanitizePromptValue(hero.headline) || "(not set)"}
- Subheadline: ${sanitizePromptValue(hero.subheadline) || "(not set)"}
- CTA: ${sanitizePromptValue(hero.ctaText) || "(not set)"}`;
}

export function storyBlock(ctx: AgentPromptContent): string | null {
  if (!ctx.sections.includes("story")) return null;
  const { story } = ctx;
  return `ABOUT/STORY:
- Headline: ${sanitizePromptValue(story.headline) || "(not set)"}
- Statement: ${sanitizePromptValue(story.statement) || "(not set)"}
- ${(story.paragraphs as string[])?.length || 0} paragraphs, ${(story.stats as unknown[])?.length || 0} stats`;
}

export function servicesBlock(ctx: AgentPromptContent): string | null {
  if (!ctx.sections.includes("services") || !ctx.content.services) return null;
  const svc = ctx.content.services;
  const serviceList = (
    (svc.services as Array<{ name: string; duration: string; price: string; id: string }>) || []
  )
    .map((s) => `- ${s.name} (${s.duration}, $${s.price}) [id: ${s.id}]`)
    .join("\n");
  return `CURRENT SERVICES (${((svc.services as unknown[]) || []).length} listed):\n${serviceList}`;
}

export function eventsBlock(ctx: AgentPromptContent): string | null {
  if (!ctx.sections.includes("events") || !ctx.content.events) return null;
  const evt = ctx.content.events;
  const futureEvents = (
    (evt.events as Array<{ title: string; date: string }>) || []
  )
    .filter((e) => new Date(e.date) >= new Date())
    .map((e) => `- ${e.title} (${e.date})`)
    .join("\n");
  return futureEvents ? `UPCOMING EVENTS:\n${futureEvents}` : "No upcoming events listed.";
}

export function testimonialsBlock(ctx: AgentPromptContent): string | null {
  if (!ctx.sections.includes("testimonials") || !ctx.content.testimonials) return null;
  return `TESTIMONIALS: ${(ctx.content.testimonials.testimonials as unknown[])?.length || 0} reviews listed.`;
}

export function performanceBlock(ctx: AgentPromptContent): string {
  return `SITE PERFORMANCE:\n- Booking clicks: ${ctx.bookingClicks.total} total (${ctx.bookingClicks.thisWeek} this week)`;
}

function formatSourceDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Canonical system prompt for both the streaming chat and background executor.
 * Keeping persona, commercial scope, evidence rules, and tenant rules here
 * prevents an approved suggestion from running under weaker instructions than chat.
 */
export async function buildAgentSystemPrompt(
  tenant: string,
  capabilityFragment: string
): Promise<string> {
  const ctx = await loadAgentPromptContent(tenant);
  const { sections, content, settings, ownerName } = ctx;

  const sectionSummaries: string[] = [aboutBlock(ctx)];
  for (const block of [heroBlock(ctx), storyBlock(ctx), servicesBlock(ctx)]) {
    if (block) sectionSummaries.push(block);
  }

  if (sections.includes("products") && content.products) {
    const products =
      (content.products.products as Array<{
        name: string;
        price: string;
        id: string;
      }>) || [];
    sectionSummaries.push(
      `PRODUCTS (${products.length} listed):\n${products
        .map((product) => `- ${product.name} ($${product.price}) [id: ${product.id}]`)
        .join("\n")}`
    );
  }

  for (const block of [eventsBlock(ctx), testimonialsBlock(ctx)]) {
    if (block) sectionSummaries.push(block);
  }

  if (sections.includes("providers") && content.providers) {
    const providers =
      (content.providers.providers as Array<{
        name: string;
        service: string;
        category: string;
      }>) || [];
    sectionSummaries.push(
      `PROVIDERS (${providers.length} listed):\n${
        providers
          .map((provider) => `- ${provider.name} — ${provider.service} (${provider.category})`)
          .join("\n") || "None yet."
      }`
    );
  }

  if (sections.includes("faq") && content.faq) {
    sectionSummaries.push(
      `FAQ: ${(content.faq.faqs as unknown[])?.length || 0} questions listed.`
    );
  }
  if (sections.includes("shop") && content.shop) {
    sectionSummaries.push(
      `SHOP: ${(content.shop.items as unknown[])?.length || 0} products listed.`
    );
  }

  sectionSummaries.push(performanceBlock(ctx));

  try {
    const searchData = await getSearchData(tenant);
    if (searchData?.queries?.length) {
      const topQueries = searchData.queries
        .slice(0, 5)
        .map(
          (query) =>
            `- ${sanitizePromptValue(query.query)}: ${query.clicks} clicks, ${query.impressions} impressions, avg position ${query.position.toFixed(1)}`
        )
        .join("\n");
      const sourceDate = formatSourceDate(searchData.fetchedAt);
      sectionSummaries.push(
        `SEARCH CONSOLE:\n${topQueries}\nSource: Search Console${
          sourceDate ? `, last updated ${sourceDate}` : ""
        }`
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

  try {
    const reviews = await getReviews(tenant);
    if (reviews.length > 0) {
      const averageRating = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
      const unreplied = reviews.filter((review) => !review.reply).length;
      const reviewText = reviews.map((review) => review.text.toLowerCase()).join(" ");
      const themes: string[] = [];
      if (reviewText.includes("friendly") || reviewText.includes("welcoming")) {
        themes.push("friendly service");
      }
      if (reviewText.includes("clean") || reviewText.includes("comfortable")) {
        themes.push("clean environment");
      }
      if (reviewText.includes("professional")) themes.push("professionalism");
      if (reviewText.includes("relaxing") || reviewText.includes("peaceful")) {
        themes.push("relaxing atmosphere");
      }

      let summary = `CUSTOMER REVIEWS:\n- ${reviews.length} total reviews (${averageRating.toFixed(1)} avg rating)`;
      if (unreplied > 0) summary += `\n- ${unreplied} awaiting reply`;
      if (themes.length > 0) summary += `\n- Customers mention: ${themes.join(", ")}`;
      summary += `\n\nRecent reviews:\n${reviews
        .slice(0, 3)
        .map(
          (review) =>
            `- "${sanitizePromptValue(review.text).slice(0, 80)}..." — ${sanitizePromptValue(review.author)} (${review.rating} stars, ${review.source})`
        )
        .join("\n")}`;
      summary += "\nSource: Reviews stored in dashboard";
      sectionSummaries.push(summary);
    }

    const serviceClicks = await getClickCountsByPrefix("service-click:", tenant);
    const sorted = Object.entries(serviceClicks)
      .map(([key, data]) => ({ name: key.replace("service-click:", ""), ...data }))
      .sort((left, right) => right.thisWeek - left.thisWeek);
    if (sorted[0]?.thisWeek > 0) {
      sectionSummaries.push(
        `SERVICE POPULARITY:\n- Most clicked: ${sorted[0].name} (${sorted[0].thisWeek} clicks this week)`
      );
    }
  } catch {
    // Connected evidence is optional; core content still makes a useful prompt.
  }

  const sectionNames = sections.join(", ");
  let prompt = `You are Strelva, the assistant that manages the website for ${sanitizePromptValue(settings.siteName) || "this business"}. Refer to yourself as Strelva (for example, "I'm Strelva, I manage your site").

${sectionSummaries.join("\n\n")}

You can read and update any section of the website. Always read the current content first before making changes. When updating, send back the COMPLETE section data — do not send partial updates.

If the owner asks to undo, revert, or "put it back the way it was", use the undo_last_change tool for the affected section — it drafts a revert to the previous version and queues it for approval (it does not go live on its own).

Available sections: ${sectionNames}.`;

  prompt += `\n\n${logisticsGuardrail(sectionNames)}`;

  const tenantConfig = await getTenantConfig(tenant);
  if (settings.bookingUrl) {
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

  prompt += `\n\n${capabilityFragment}`;

  const personality =
    sanitizePromptValue(tenantConfig?.personality) || "conversational, warm, and helpful";
  prompt += `\n\nBe ${personality} — ${ownerName} talks to you like a coworker, not a robot. Confirm changes after making them. If a request is ambiguous, ask for clarification.`;
  prompt += `\n\n${copyVoiceGuard()}`;

  if (tenantConfig?.businessRules) {
    // businessRules is operator-set and allows longer multi-line content, so we
    // apply a bespoke sanitize: strip C0 control chars EXCEPT newlines (which are
    // meaningful rule separators), collapse runs of whitespace on each line, and
    // cap the whole block at 1000 chars. This prevents prompt injection while
    // preserving the field's intended structure.
    const sanitizedRules = tenantConfig.businessRules
      .replace(/[\x00-\x09\x0b-\x1f\x7f]+/g, " ") // strip C0 except \n (0x0a)
      .replace(/[^\S\n]{2,}/g, " ")                 // collapse horizontal whitespace runs
      .trim()
      .slice(0, 1000);
    prompt += `\n\nBUSINESS RULES (always follow these):\n${sanitizedRules}`;
  }

  if (tenantConfig?.businessHours) {
    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const hoursLines = tenantConfig.businessHours.schedule
      .map((day) =>
        day.closed
          ? `${dayNames[day.day]}: Closed`
          : `${dayNames[day.day]}: ${day.open} – ${day.close}`
      )
      .join("\n");
    prompt += `\n\nBUSINESS HOURS:\n${hoursLines}`;
    if (tenantConfig.businessHours.holidays?.length) {
      prompt += `\n\nHOLIDAY CLOSURES:\n${tenantConfig.businessHours.holidays
        .map((holiday) => `- ${sanitizePromptValue(holiday.date)}: ${sanitizePromptValue(holiday.label)}`)
        .join("\n")}`;
    }
    if (tenantConfig.businessHours.timezone) {
      prompt += `\nTimezone: ${sanitizePromptValue(tenantConfig.businessHours.timezone)}`;
    }
    prompt += `\nUse these hours when answering "are you open?" or related questions. If someone asks outside hours, let them know when you'll next be open.`;
  }

  prompt += `\n\nNever remove content unless explicitly asked. For array items (services, events, testimonials, products, providers), preserve all existing items unless told to remove specific ones.

When ${ownerName} asks "how's my site?" or similar, give a plain-English summary of what's on the site, how many booking clicks, and suggest what to update next.`;

  return prompt;
}
