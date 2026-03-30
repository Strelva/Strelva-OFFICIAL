import { streamText, tool, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { verifyAuth } from "@/lib/auth";
import { getContent, getClickCounts } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";

async function buildSystemPrompt(tenant: string): Promise<string> {
  const [settings, services, contact, events, faq, shop, bookingClicks] = await Promise.all([
    getContent("settings", tenant),
    getContent("services", tenant),
    getContent("contact", tenant),
    getContent("events", tenant),
    getContent("faq", tenant),
    getContent("shop", tenant),
    getClickCounts("booking-click", tenant),
  ]);

  const serviceList = services.services
    .map((s) => `- ${s.name} (${s.duration}, $${s.price}) [id: ${s.id}]`)
    .join("\n");

  const futureEvents = events.events
    .filter((e) => new Date(e.date) >= new Date())
    .map((e) => `- ${e.title} (${e.date})`)
    .join("\n");

  const ownerName = settings.ownerName || "the owner";
  const ownerTitle = settings.ownerTitle || "";

  return `You are the website assistant for ${settings.siteName}.

ABOUT THE BUSINESS:
- Owner: ${ownerName}${ownerTitle ? `, ${ownerTitle}` : ""}
- Phone: ${contact.phone}
- Email: ${contact.email}
- Address: ${contact.address}
- Hours: ${contact.hours}
- Booking: ${settings.bookingUrl}

CURRENT SERVICES (${services.services.length} listed):
${serviceList}

${futureEvents ? `UPCOMING EVENTS:\n${futureEvents}` : "No upcoming events listed."}

SITE PERFORMANCE:
- Booking clicks: ${bookingClicks.total} total (${bookingClicks.thisWeek} this week)

You can read and update any section of the website. Always read the current content first before making changes. When updating, send back the COMPLETE section data — do not send partial updates.

FAQ: ${faq.faqs.length} questions listed.
SHOP: ${shop.items.length} products listed.

Available sections: hero, services, story, testimonials, events, providers, contact, settings, faq, shop.

BOOKING: All booking is handled through Vagaro at ${settings.bookingUrl}. When someone asks about booking, direct them to Vagaro. You cannot book appointments directly — always link to Vagaro.

NEWSLETTER: You can send email newsletters to subscribers and check the subscriber list. When asked to send a newsletter, compose a subject and body, then use send_newsletter.

Be conversational, warm, and helpful — ${ownerName} talks to you like a coworker, not a robot. Confirm changes after making them. If a request is ambiguous, ask for clarification.

Never remove content unless explicitly asked. For array items (services, events, testimonials, providers), preserve all existing items unless told to remove specific ones.

When ${ownerName} asks "how's my site?" or similar, give a plain-English summary: how many services are listed, how many booking clicks, upcoming events, upcoming bookings, and suggest what to update next.`;
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
  let systemPrompt = await buildSystemPrompt(tenant);

  if (activeSection) {
    systemPrompt += `\n\nCONTEXT: The user is currently viewing the "${activeSection}" section in their dashboard editor. When they say "this", "it", "add one", "update this", etc., they are referring to ${activeSection}. Proactively reference this section in your responses.`;
  }

  const result = streamText({
    model: google("gemini-2.5-flash"),
    system: systemPrompt,
    messages,
    tools: {
      read_section: tool({
        description: "Read current content for a website section",
        inputSchema: z.object({
          section: z.enum([
            "hero",
            "services",
            "story",
            "testimonials",
            "events",
            "providers",
            "contact",
            "settings",
            "faq",
            "shop",
          ]),
        }),
        execute: async ({ section }) => {
          const { getContent } = await import("@/lib/storage");
          return await getContent(section, tenant);
        },
      }),
      update_section: tool({
        description:
          "Update content for a website section. Always read the section first, then send the COMPLETE updated data.",
        inputSchema: z.object({
          section: z.enum([
            "hero",
            "services",
            "story",
            "testimonials",
            "events",
            "providers",
            "contact",
            "settings",
            "faq",
            "shop",
          ]),
          data: z.record(z.string(), z.unknown()),
        }),
        execute: async ({ section, data }) => {
          const { sectionSchemas } = await import("@/lib/schemas");
          const schema = sectionSchemas[section];
          const parsed = schema.safeParse(data);
          if (!parsed.success) {
            return {
              success: false,
              error: parsed.error.message,
            };
          }

          const { getContent, setContent } = await import("@/lib/storage");
          const current = (await getContent(section, tenant)) as unknown as Record<
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
            section,
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
