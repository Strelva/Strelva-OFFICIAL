import { generateText, tool, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { getContent, getClickCounts, getSectionTimestamps } from "@/lib/storage";
import { getTemplateForTenant } from "@/components/templates/registry";
import { getTenantConfig } from "@/lib/tenants";
import { capabilityPromptFragment } from "@/lib/capabilities";
import { sendSlackNotification } from "@/lib/slack";
import { detectStaleSections } from "@/lib/reports";
import { decideAiContentGovernance } from "@/lib/ai-governance";
import { queueAiContentReview } from "@/lib/ai-review-queue";
import type { ContentSection } from "@/lib/types";
import { revalidateClientSite } from "@/lib/revalidate-client";

async function buildSystemPrompt(
  tenant: string,
  capFragment: string
): Promise<string> {
  const template = await getTemplateForTenant(tenant);
  const sections = template.contentSections;

  const contentEntries = await Promise.all(
    sections.map(
      async (s) =>
        [s, await getContent(s, tenant)] as unknown as [
          ContentSection,
          Record<string, unknown>,
        ]
    )
  );
  const content: Record<string, Record<string, unknown>> =
    Object.fromEntries(contentEntries);
  const [bookingClicks, timestamps] = await Promise.all([
    getClickCounts("booking-click", tenant),
    getSectionTimestamps(tenant),
  ]);

  const settings = content.settings || {};
  const contact = content.contact || {};
  const hero = content.hero || {};
  const story = content.story || {};

  const ownerName = (settings.ownerName as string) || "the owner";
  const ownerTitle = (settings.ownerTitle as string) || "";

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
    const serviceList = (
      (svc.services as Array<{
        name: string;
        duration: string;
        price: string;
        id: string;
      }>) || []
    )
      .map((s) => `- ${s.name} (${s.duration}, $${s.price}) [id: ${s.id}]`)
      .join("\n");
    sectionSummaries.push(
      `CURRENT SERVICES (${((svc.services as unknown[]) || []).length} listed):\n${serviceList}`
    );
  }

  if (sections.includes("events") && content.events) {
    const evt = content.events;
    const futureEvents = (
      (evt.events as Array<{ title: string; date: string }>) || []
    )
      .filter((e) => new Date(e.date) >= new Date())
      .map((e) => `- ${e.title} (${e.date})`)
      .join("\n");
    sectionSummaries.push(
      futureEvents ? `UPCOMING EVENTS:\n${futureEvents}` : "No upcoming events listed."
    );
  }

  if (sections.includes("testimonials") && content.testimonials) {
    sectionSummaries.push(
      `TESTIMONIALS: ${(content.testimonials.testimonials as unknown[])?.length || 0} reviews listed.`
    );
  }

  sectionSummaries.push(
    `SITE PERFORMANCE:\n- Booking clicks: ${bookingClicks.total} total (${bookingClicks.thisWeek} this week)`
  );

  const staleSections = detectStaleSections(timestamps, sections).slice(0, 5);
  if (staleSections.length > 0) {
    sectionSummaries.push(
      `STALE SECTIONS TO WATCH:\n${staleSections
        .map((s) => `- ${s.section}: ${s.daysSinceUpdate} days since update`)
        .join("\n")}`
    );
  }

  const sectionNames = sections.join(", ");

  let prompt = `You are the website assistant for ${(settings.siteName as string) || "this business"}.

${sectionSummaries.join("\n\n")}

You can read and update any section of the website. Always read the current content first before making changes. When updating, send back the COMPLETE section data — do not send partial updates.

Available sections: ${sectionNames}.`;

  if (settings.bookingUrl) {
    const tenantConfig = await getTenantConfig(tenant);
    const provider = tenantConfig?.bookingProvider || "their booking platform";
    prompt += `\n\nBOOKING: All booking is handled through ${provider} at ${settings.bookingUrl}. When someone asks about booking, direct them there.`;
  }

  prompt += `\n\n${capFragment}`;

  prompt += `\n\nBe conversational, warm, and helpful. Confirm changes after making them. Never remove content unless explicitly asked. For array items, preserve all existing items unless told to remove specific ones.`;

  return prompt;
}

export async function executeAgentPrompt(
  tenantId: string,
  userMessage: string
): Promise<string> {
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

        const governance = decideAiContentGovernance(section as ContentSection, parsed.data, {
          tenantAutoPublish: tenantConfig?.autoPublish,
        });

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
          revalidateClientSite(tenantId, ["/"]).catch((err) => {
            console.error("[agent] Failed to revalidate client site:", err);
          });
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

  const result = await generateText({
    model: google("gemini-2.5-flash"),
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    tools,
    stopWhen: stepCountIs(8),
  });

  return result.text;
}
