import { streamText, tool, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { verifyAuth } from "@/lib/auth";
import { getContent, getClickCounts } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTemplateForTenant } from "@/components/templates/registry";
import type { ContentSection } from "@/lib/types";

async function buildSystemPrompt(tenant: string): Promise<string> {
  const template = getTemplateForTenant(tenant);
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
    prompt += `\n\nBOOKING: All booking is handled through Vagaro at ${settings.bookingUrl}. When someone asks about booking, direct them to Vagaro. You cannot book appointments directly — always link to Vagaro.`;
  }

  prompt += `\n\nNEWSLETTER: You can send email newsletters to subscribers and check the subscriber list. When asked to send a newsletter, compose a subject and body, then use send_newsletter.

Be conversational, warm, and helpful — ${ownerName} talks to you like a coworker, not a robot. Confirm changes after making them. If a request is ambiguous, ask for clarification.

Never remove content unless explicitly asked. For array items (services, events, testimonials, products, providers), preserve all existing items unless told to remove specific ones.

When ${ownerName} asks "how's my site?" or similar, give a plain-English summary of what's on the site, how many booking clicks, and suggest what to update next.`;

  return prompt;
}

export async function POST(req: Request) {
  const authed = await verifyAuth();
  if (!authed) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const tenant = await getTenantFromHeaders();
  const { messages, activeSection } = await req.json();
  const template = getTemplateForTenant(tenant);
  let systemPrompt = await buildSystemPrompt(tenant);

  if (activeSection) {
    systemPrompt += `\n\nCONTEXT: The user is currently viewing the "${activeSection}" section in their dashboard editor. When they say "this", "it", "add one", "update this", etc., they are referring to ${activeSection}. Proactively reference this section in your responses.`;
  }

  // Build dynamic section enum from template
  const sectionEnum = z.enum(
    template.contentSections as [string, ...string[]]
  );

  const result = streamText({
    model: google("gemini-2.5-flash"),
    system: systemPrompt,
    messages,
    tools: {
      read_section: tool({
        description: "Read current content for a website section",
        inputSchema: z.object({
          section: sectionEnum,
        }),
        execute: async ({ section }) => {
          try {
            const { getContent } = await import("@/lib/storage");
            return await getContent(section as ContentSection, tenant);
          } catch (err) {
            return { error: `Failed to read ${section}: ${err instanceof Error ? err.message : "Unknown error"}` };
          }
        },
      }),
      update_section: tool({
        description:
          "Update content for a website section. Always read the section first, then send the COMPLETE updated data.",
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
            return {
              success: false,
              error: parsed.error.message,
            };
          }

          const { getContent, setContent } = await import("@/lib/storage");
          const current = (await getContent(section as ContentSection, tenant)) as unknown as Record<
            string,
            unknown
          >;
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
                  error: `This would remove ${oldLen - newLen} of ${oldLen} ${key}. Please confirm you want to remove these specific items.`,
                };
              }
            }
          }

          await setContent(
            section as ContentSection,
            parsed.data as Parameters<typeof setContent>[1],
            tenant
          );

          const { revalidatePath } = await import("next/cache");
          revalidatePath("/");

          if (process.env.SLACK_WEBHOOK_URL) {
            fetch(process.env.SLACK_WEBHOOK_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: `Site updated *${section}* via AI chat`,
              }),
            }).catch(() => {});
          }

          try {
            const { logActivity, recordSectionUpdate } = await import("@/lib/storage");
            const { diffFields } = await import("@/lib/utils");
            const changes = diffFields(current, data as Record<string, unknown>);
            await logActivity({
              text: `AI updated ${section}`,
              time: new Date().toISOString(),
              type: "ai",
              section,
              actor: "ai",
              changes,
            }, tenant);
            await recordSectionUpdate(section, tenant);
          } catch {}

          return {
            success: true,
            section,
            message: `Updated ${section} successfully`,
          };
          } catch (err) {
            return { success: false, error: `Failed to update ${section}: ${err instanceof Error ? err.message : "Unknown error"}` };
          }
        },
      }),
      upload_image: tool({
        description: "Upload an image to the website. Use when the client shares a photo or wants to add an image to their site.",
        inputSchema: z.object({
          imageData: z.string().describe("Base64-encoded image data URL (e.g. data:image/jpeg;base64,...)"),
          filename: z.string().optional().describe("Desired filename for the image"),
        }),
        execute: async ({ imageData, filename }) => {
          try {
            // Parse data URL: data:image/jpeg;base64,/9j/4AAQ...
            const match = imageData.match(/^data:(image\/\w+);base64,(.+)$/);
            if (!match) {
              return { success: false, error: "Invalid image data. Expected a base64-encoded data URL (data:image/type;base64,...)." };
            }
            const mimeType = match[1];
            const base64Data = match[2];
            const buffer = Buffer.from(base64Data, "base64");

            const ext = mimeType.split("/")[1] || "png";
            const finalFilename = filename || `upload-${Date.now()}.${ext}`;

            // Create a File-like object for uploadFile
            const blob = new Blob([buffer], { type: mimeType });
            const file = new File([blob], finalFilename, { type: mimeType });

            const { uploadFile } = await import("@/lib/storage");
            const { url } = await uploadFile(file);

            return { success: true, url, filename: finalFilename };
          } catch (err) {
            return { success: false, error: `Upload failed: ${err instanceof Error ? err.message : "Unknown error"}` };
          }
        },
      }),
      send_newsletter: tool({
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

            if (active.length === 0) {
              return { success: false, error: "No active subscribers" };
            }

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
                    from: `${fromName} <newsletter@${process.env.RESEND_DOMAIN || "updates.rohlaxwellness.com"}>`,
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
      list_subscribers: tool({
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
            const label =
              toolName === "read_section" ? `Reading your ${section || "content"}...` :
              toolName === "update_section" ? `Updating your ${section || "content"}...` :
              toolName === "upload_image" ? "Uploading image..." :
              toolName === "send_newsletter" ? "Sending newsletter..." :
              toolName === "list_subscribers" ? "Checking subscribers..." :
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
