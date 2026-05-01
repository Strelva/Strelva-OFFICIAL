import { streamText, tool, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { requireTenantAccess } from "@/lib/auth";
import { getContent, getClickCounts } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTemplateForTenant } from "@/components/templates/registry";
import { getTenantConfig } from "@/lib/tenants";
import { requireActiveSubscription } from "@/lib/subscription";
import { capabilityPromptFragment } from "@/lib/capabilities";
import { isRateLimited } from "@/lib/rate-limit";
import { classifySource, recordAgentToolCall } from "@/lib/proof-signals";
import { decideAiContentGovernance } from "@/lib/ai-governance";
import type { ContentSection } from "@/lib/types";

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

  const sectionNames = sections.join(", ");

  let prompt = `You are the website assistant for ${(settings.siteName as string) || "this business"}.

${sectionSummaries.join("\n\n")}

You can read and update any section of the website. Always read the current content first before making changes. When updating, send back the COMPLETE section data — do not send partial updates.

Available sections: ${sectionNames}.`;

  if (settings.bookingUrl) {
    const tenantConfig = await getTenantConfig(tenant);
    const provider = tenantConfig?.bookingProvider || "their booking platform";
    prompt += `\n\nBOOKING: All booking is handled through ${provider} at ${settings.bookingUrl}. When someone asks about booking, direct them there. You cannot book appointments directly — always link to the booking page.`;
  }

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

  if (isRateLimited(`agent:${tenant}`, 30)) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Try again in a minute." }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  const blocked = await requireActiveSubscription(tenant);
  if (blocked) return blocked;

  const tenantConfig = await getTenantConfig(tenant);
  const { userId: clerkUserId } = await auth();
  const { messages, activeSection } = await req.json();
  const template = await getTemplateForTenant(tenant);

  // Capture the latest user message for proof-signal logging (Workstream E).
  // Vercel AI SDK messages can have parts or plain string content — handle both.
  const lastUserMessage = (() => {
    if (!Array.isArray(messages)) return undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m?.role !== "user") continue;
      if (typeof m.content === "string") return m.content as string;
      if (Array.isArray(m.content)) {
        const text = m.content
          .map((p: { type?: string; text?: string }) => (p?.type === "text" ? p.text || "" : ""))
          .join(" ")
          .trim();
        if (text) return text;
      }
      if (Array.isArray(m.parts)) {
        const text = m.parts
          .map((p: { type?: string; text?: string }) => (p?.type === "text" ? p.text || "" : ""))
          .join(" ")
          .trim();
        if (text) return text;
      }
    }
    return undefined;
  })();
  const signalSource = classifySource(clerkUserId);
  const signalSiteName = tenantConfig?.siteName || tenant;
  const capFragment = capabilityPromptFragment();
  let systemPrompt = await buildSystemPrompt(tenant, capFragment);

  if (activeSection) {
    systemPrompt += `\n\nCONTEXT: The user is currently viewing the "${activeSection}" section in their dashboard editor. When they say "this", "it", "add one", "update this", etc., they are referring to ${activeSection}. Proactively reference this section in your responses.`;
  }

  // Build dynamic section enum from template
  const sectionEnum = z.enum(
    template.contentSections as [string, ...string[]]
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
            const { sectionSchemas } = await import("@/lib/schemas");
            const schema = sectionSchemas[section as ContentSection];
            const parsed = schema.safeParse(data);
            if (!parsed.success) {
              return { success: false, error: parsed.error.message };
            }

            const { getContent, setContent } = await import("@/lib/storage");
            const current = (await getContent(section as ContentSection, tenant)) as unknown as Record<string, unknown>;
            for (const key of Object.keys(current)) {
              if (Array.isArray(current[key]) && Array.isArray((data as Record<string, unknown>)[key])) {
                const oldLen = (current[key] as unknown[]).length;
                const newLen = ((data as Record<string, unknown>)[key] as unknown[]).length;
                if (oldLen > 0 && newLen < oldLen * 0.5) {
                  return {
                    success: false,
                    error: `This would remove ${oldLen - newLen} of ${oldLen} ${key}. Please confirm you want to remove these specific items.`,
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
                reason: governance.reason,
                message: "I can't make that change directly. Jacob needs to handle structural site changes.",
              };
            }

            const autoPublish = governance.action === "publish";

            if (autoPublish) {
              await setContent(section as ContentSection, parsed.data as Parameters<typeof setContent>[1], tenant);
              // Record version for history
              const { appendVersion } = await import("@/lib/storage");
              const { diffFields } = await import("@/lib/utils");
              await appendVersion(section as ContentSection, parsed.data, "ai", tenant, diffFields(current, data as Record<string, unknown>));
              const { revalidatePath } = await import("next/cache");
              revalidatePath("/");
            } else {
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
              fetch(process.env.SLACK_WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                text: autoPublish
                  ? `[${tenantLabel}] AI updated *${section}*\n${changeSummary}`
                  : `[${tenantLabel}] AI drafted changes to *${section}* — needs review at /admin/drafts\nReason: ${governance.reason}\n${changeSummary}`,
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
              }, tenant);
              if (autoPublish) await recordSectionUpdate(section, tenant);
            } catch {}

            return {
              success: true,
              section,
              governance,
              message: autoPublish
                ? `Updated ${section} successfully`
                : `I've drafted the changes to ${section}. Jacob will review and publish them shortly.`,
            };
          } catch (err) {
            return { success: false, error: `Failed to update ${section}: ${err instanceof Error ? err.message : "Unknown error"}` };
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
          return { activity: activity.slice(0, 20) };
        },
      }),
    },
    send_newsletter: {
      capability: "send_newsletter",
      def: tool({
        description: "Compose and send an email newsletter to all subscribers",
        inputSchema: z.object({
          subject: z.string(),
          body: z.string().describe("The email content in plain text or simple HTML"),
        }),
        execute: async ({ subject, body }) => {
          try {
            const { getSubscribers, getContent, logActivity } = await import("@/lib/storage");
            const subscribers = await getSubscribers(tenant);
            const active = subscribers.filter((s) => s.status === "active");
            if (active.length === 0) return { success: false, error: "No active subscribers" };

            const settings = await getContent("settings", tenant);
            const fromName = settings.siteName || "Newsletter";

            if (process.env.RESEND_API_KEY) {
              const { Resend } = await import("resend");
              const resend = new Resend(process.env.RESEND_API_KEY);
              const emails = active.map((s) => s.email);
              const batchSize = 100;
              for (let i = 0; i < emails.length; i += batchSize) {
                const batch = emails.slice(i, i + batchSize);
                await resend.batch.send(
                  batch.map((to) => ({
                    from: `${fromName} <newsletter@${tenantConfig?.resendDomain || process.env.RESEND_DOMAIN || "updates.scaffoldweb.com"}>`,
                    to,
                    subject,
                    html: body,
                    text: body.replace(/<[^>]*>/g, ""),
                  }))
                );
              }
            } else {
              console.log(`[Newsletter dev] "${subject}" → ${active.length} subscribers`);
            }

            await logActivity({
              text: `AI sent newsletter: "${subject}" to ${active.length} subscribers`,
              time: new Date().toISOString(),
              type: "newsletter",
              actor: "ai",
            }, tenant);

            return { success: true, subscriberCount: active.length };
          } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : "Failed to send" };
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
            return { success: true, post };
          } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : "Failed to create post" };
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
            const { getPageConfig, setPageConfig } = await import("@/lib/storage");
            const config = await getPageConfig(tenant);
            const pageSlug = page || "home";
            if (!config || !config[pageSlug]) {
              return { success: false, error: `Page "${pageSlug}" not found in config` };
            }
            const pageCfg = config[pageSlug];
            const sectionCfg = pageCfg.sections.find((s) => s.type === section);
            if (!sectionCfg) {
              return { success: false, error: `Section "${section}" not found on page "${pageSlug}"` };
            }
            sectionCfg.visible = visible;
            await setPageConfig(config, tenant);
            const { revalidatePath } = await import("next/cache");
            revalidatePath("/");
            return {
              success: true,
              message: `${section} is now ${visible ? "visible" : "hidden"} on the ${pageSlug} page`,
            };
          } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : "Failed" };
          }
        },
      }),
    },
    reorder_sections: {
      capability: "read_section",
      def: tool({
        description: "Reorder sections on a page. Provide the section types in the desired order.",
        inputSchema: z.object({
          page: z.string().optional().describe("Page slug (default: home)"),
          order: z.array(z.string()).describe("Section types in desired order, e.g. ['hero', 'services', 'story']"),
        }),
        execute: async ({ page, order }) => {
          try {
            const { getPageConfig, setPageConfig } = await import("@/lib/storage");
            const config = await getPageConfig(tenant);
            const pageSlug = page || "home";
            if (!config || !config[pageSlug]) {
              return { success: false, error: `Page "${pageSlug}" not found in config` };
            }
            const pageCfg = config[pageSlug];
            const sectionMap = new Map(pageCfg.sections.map((s) => [s.type, s]));
            const reordered = order
              .filter((t) => sectionMap.has(t))
              .map((t, i) => ({ ...sectionMap.get(t)!, order: i }));
            // Append any sections not in the order list
            const orderedTypes = new Set(order);
            for (const s of pageCfg.sections) {
              if (!orderedTypes.has(s.type)) {
                reordered.push({ ...s, order: reordered.length });
              }
            }
            config[pageSlug] = { ...pageCfg, sections: reordered };
            await setPageConfig(config, tenant);
            const { revalidatePath } = await import("next/cache");
            revalidatePath("/");
            return {
              success: true,
              message: `Sections on ${pageSlug} reordered: ${reordered.map((s) => s.type).join(", ")}`,
            };
          } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : "Failed" };
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
            return { success: false, error: `Failed to reply: ${err instanceof Error ? err.message : "Unknown error"}` };
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

          const connections = [
            {
              id: "google-analytics",
              name: "Google Analytics",
              icon: "GA",
              connected: !!config?.googleSearchConsoleKey,
              description: "Traffic data for reports",
            },
            {
              id: "newsletter",
              name: "Newsletter",
              icon: "NL",
              connected: !!config?.resendDomain,
              description: "Email subscribers",
            },
            {
              id: "google-business",
              name: "Google Business",
              icon: "GB",
              connected: !!config?.reviewsConfig?.googlePlaceId,
              description: "Reviews sync",
            },
            {
              id: "instagram",
              name: "Instagram",
              icon: "IG",
              connected: !!(config?.instagramAccessToken || config?.beholdFeedId),
              description: "Social feed",
            },
            {
              id: "calendly",
              name: "Calendly",
              icon: "CL",
              connected: !!config?.bookingUrl,
              description: "Booking integration",
            },
            {
              id: "yelp",
              name: "Yelp",
              icon: "YP",
              connected: !!config?.reviewsConfig?.yelpBusinessId,
              description: "Yelp reviews",
            },
          ];

          return {
            __inlineTool: "show_connections",
            connections,
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
          } else if (part.type === "text-delta") {
            controller.enqueue(encoder.encode("text" in part ? part.text : ""));
          }
        }
      } catch {
        // Stream closed by client
      } finally {
        controller.close();
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
