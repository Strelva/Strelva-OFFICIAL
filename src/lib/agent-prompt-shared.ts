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

import { getContent, getClickCounts } from "@/lib/storage";
import { getTemplateForTenant } from "@/components/templates/registry";
import { sanitizePromptValue } from "@/lib/capabilities";
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
  const template = await getTemplateForTenant(tenant);
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
