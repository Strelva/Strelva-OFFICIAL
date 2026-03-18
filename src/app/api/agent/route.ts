import { streamText, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

async function verifyAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("rohlax-admin-token")?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
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

  const result = streamText({
    model: anthropic("claude-sonnet-4-5-20250514"),
    system: `You are the website assistant for Rohlax Wellness, a stretching and wellness studio in Williamsville, NY run by Chelsea.

You can read and update any section of the website. Always read the current content first before making changes. When updating, send back the COMPLETE section data with your changes applied — do not send partial updates.

Available sections: hero, services, story, testimonials, events, providers, contact, settings.

Be conversational and helpful. Confirm changes after making them. If a request is ambiguous, ask for clarification.

Never remove content unless explicitly asked. For array items (services, events, testimonials, providers), preserve all existing items unless told to remove specific ones.`,
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

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await setContent(section, parsed.data as any);

          const { revalidatePath } = await import("next/cache");
          revalidatePath("/");

          if (process.env.SLACK_WEBHOOK_URL) {
            fetch(process.env.SLACK_WEBHOOK_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: `Chelsea updated *${section}* via AI chat`,
              }),
            }).catch(() => {});
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

  return result.toUIMessageStreamResponse();
}
