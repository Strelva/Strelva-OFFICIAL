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

You can read and update any section of the website, manage bookings, and check availability. Always read the current content first before making changes. When updating, send back the COMPLETE section data — do not send partial updates.

FAQ: ${faq.faqs.length} questions listed.
SHOP: ${shop.items.length} products listed.

Available sections: hero, services, story, testimonials, events, providers, contact, settings, faq, shop.

BOOKING: You can check availability, book appointments, and list upcoming bookings. When someone asks to book, use check_availability first, then book_appointment.

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
      check_availability: tool({
        description: "Check available booking slots for a specific date and service",
        inputSchema: z.object({
          date: z.string().describe("Date in YYYY-MM-DD format"),
          serviceId: z.string().describe("Service ID to check availability for"),
        }),
        execute: async ({ date, serviceId }) => {
          const { getAvailableSlots, getContent } = await import("@/lib/storage");
          const slots = await getAvailableSlots(date, serviceId, tenant);
          const services = await getContent("services", tenant);
          const service = services.services.find((s) => s.id === serviceId);
          return {
            date,
            service: service?.name || serviceId,
            availableSlots: slots,
            count: slots.length,
          };
        },
      }),
      book_appointment: tool({
        description: "Book an appointment for a client",
        inputSchema: z.object({
          serviceId: z.string(),
          serviceName: z.string(),
          date: z.string().describe("Date in YYYY-MM-DD format"),
          startTime: z.string().describe("Start time in HH:MM format"),
          clientName: z.string(),
          clientEmail: z.string(),
          clientPhone: z.string().optional(),
          notes: z.string().optional(),
        }),
        execute: async ({ serviceId, serviceName, date, startTime, clientName, clientEmail, clientPhone, notes }) => {
          const { getAvailableSlots, createBooking, getContent, logActivity } = await import("@/lib/storage");

          // Verify slot
          const available = await getAvailableSlots(date, serviceId, tenant);
          if (!available.includes(startTime)) {
            return { success: false, error: "This time slot is no longer available." };
          }

          // Calculate end time
          const services = await getContent("services", tenant);
          const service = services.services.find((s) => s.id === serviceId);
          const duration = service ? parseInt(service.duration) || 60 : 60;
          const [h, m] = startTime.split(":").map(Number);
          const endMin = h * 60 + m + duration;
          const endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;

          const booking = await createBooking({
            serviceId,
            serviceName,
            date,
            startTime,
            endTime,
            clientName,
            clientEmail,
            clientPhone: clientPhone || "",
            notes,
          }, tenant);

          await logActivity({
            text: `Booked ${serviceName} for ${clientName} on ${date} at ${startTime}`,
            time: new Date().toISOString(),
            type: "booking",
          }, tenant);

          return { success: true, booking };
        },
      }),
      list_bookings: tool({
        description: "List upcoming bookings",
        inputSchema: z.object({
          from: z.string().optional().describe("Start date (YYYY-MM-DD), defaults to today"),
          to: z.string().optional().describe("End date (YYYY-MM-DD), defaults to 30 days from now"),
        }),
        execute: async ({ from, to }) => {
          const { getBookings } = await import("@/lib/storage");
          const today = new Date().toISOString().slice(0, 10);
          const thirtyDays = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
          const bookings = await getBookings(tenant, {
            from: from || today,
            to: to || thirtyDays,
          });
          const active = bookings.filter((b) => b.status !== "cancelled");
          return {
            total: active.length,
            bookings: active.map((b) => ({
              id: b.id,
              service: b.serviceName,
              date: b.date,
              time: `${b.startTime}-${b.endTime}`,
              client: b.clientName,
              status: b.status,
            })),
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
      update_booking_config: tool({
        description: "Update booking availability configuration (schedule, lead time, etc.)",
        inputSchema: z.object({
          config: z.record(z.string(), z.unknown()).describe("Partial booking config to merge"),
        }),
        execute: async ({ config }) => {
          const { getBookingConfig, setBookingConfig } = await import("@/lib/storage");
          const current = await getBookingConfig(tenant);
          const updated = { ...current, ...config };
          await setBookingConfig(updated, tenant);
          return { success: true, config: updated };
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
              toolName === "check_availability" ? "Checking availability..." :
              toolName === "book_appointment" ? "Booking appointment..." :
              toolName === "list_bookings" ? "Checking your bookings..." :
              toolName === "upload_image" ? "Uploading image..." :
              toolName === "update_booking_config" ? "Updating booking settings..." :
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
