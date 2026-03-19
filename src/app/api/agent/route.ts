import { streamText, tool, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { verifyAuth } from "@/lib/auth";
import { getContent, getClickCounts } from "@/lib/storage";

async function buildSystemPrompt(): Promise<string> {
  const [settings, services, contact, events, bookingClicks] = await Promise.all([
    getContent("settings"),
    getContent("services"),
    getContent("contact"),
    getContent("events"),
    getClickCounts("booking-click"),
  ]);

  const serviceList = services.services
    .map((s) => `- ${s.name} (${s.duration}, $${s.price})`)
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
- Booking: ${settings.vagaroUrl}

CURRENT SERVICES (${services.services.length} listed):
${serviceList}

${futureEvents ? `UPCOMING EVENTS:\n${futureEvents}` : "No upcoming events listed."}

SITE PERFORMANCE:
- Booking clicks: ${bookingClicks.total} total (${bookingClicks.thisWeek} this week)

You can read and update any section of the website. Always read the current content first before making changes. When updating, send back the COMPLETE section data — do not send partial updates.

Available sections: hero, services, story, testimonials, events, providers, contact, settings.

Be conversational, warm, and helpful — ${ownerName} talks to you like a coworker, not a robot. Confirm changes after making them. If a request is ambiguous, ask for clarification.

Never remove content unless explicitly asked. For array items (services, events, testimonials, providers), preserve all existing items unless told to remove specific ones.

When ${ownerName} asks "how's my site?" or similar, give a plain-English summary: how many services are listed, how many booking clicks, upcoming events, and suggest what to update next.`;
}

export async function POST(req: Request) {
  const authed = await verifyAuth();
  if (!authed) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { messages } = await req.json();
  const systemPrompt = await buildSystemPrompt();

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
          ]),
        }),
        execute: async ({ section }) => {
          const { getContent } = await import("@/lib/storage");
          return await getContent(section);
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
          const current = (await getContent(section)) as unknown as Record<
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
            parsed.data as Parameters<typeof setContent>[1]
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
            }).catch(() => { /* Slack notification is best-effort */ });
          }

          // Log activity + record freshness timestamp
          try {
            const { logActivity, recordSectionUpdate } = await import("@/lib/storage");
            await logActivity({
              text: `AI updated ${section}`,
              time: new Date().toISOString(),
              type: "ai",
            });
            await recordSectionUpdate(section);
          } catch {
            // Activity logging is best-effort
          }

          return {
            success: true,
            section,
            message: `Updated ${section} successfully`,
          };
        },
      }),
    },
    stopWhen: stepCountIs(5),
  });

  return result.toTextStreamResponse();
}
