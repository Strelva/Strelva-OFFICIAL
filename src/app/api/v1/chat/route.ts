import { NextRequest, NextResponse } from "next/server";
import { generateText, tool, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { withAPIAuth, APIClient } from "@/lib/api-auth";

const requestSchema = z.object({
  message: z.string().min(1),
  content: z.record(z.string(), z.unknown()),
  sections: z.array(z.string()).optional(),
  context: z
    .object({
      siteName: z.string().optional(),
      ownerName: z.string().optional(),
      industry: z.string().optional(),
    })
    .optional(),
});

function buildSystemPrompt(
  client: APIClient,
  content: Record<string, unknown>,
  context?: { siteName?: string; ownerName?: string; industry?: string }
): string {
  const siteName = context?.siteName || client.name;
  const ownerName = context?.ownerName || "the owner";

  const contentSummary = Object.entries(content)
    .map(([section, data]) => `${section}: ${JSON.stringify(data).slice(0, 500)}...`)
    .join("\n\n");

  return `You are an AI assistant managing the website for ${siteName}.
You help ${ownerName} update their site content through conversation.

CURRENT SITE CONTENT:
${contentSummary}

CAPABILITIES:
- Read and understand all site sections
- Suggest updates to any section
- Generate new content (blog posts, service descriptions, etc.)
- Answer questions about the site

RULES:
- Be concise and helpful
- When suggesting changes, use the update_section tool
- Always confirm significant changes before applying
- Match the tone and style of existing content

When you need to update content, call the update_section tool with the section name and new data.
The client application will handle actually saving the changes.`;
}

export async function POST(req: NextRequest) {
  return withAPIAuth(req, async (client) => {
    try {
      const body = await req.json();
      const parsed = requestSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid request", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const { message, content, context } = parsed.data;
      const systemPrompt = buildSystemPrompt(client, content, context);

      const toolCalls: Array<{ tool: string; args: Record<string, unknown>; result: unknown }> = [];

      const tools = {
        update_section: tool({
          description: "Update a section of the website. Returns the proposed update for client to apply.",
          inputSchema: z.object({
            section: z.string().describe("The section to update (e.g., hero, services, contact)"),
            data: z.record(z.string(), z.unknown()).describe("The new content for the section"),
            reason: z.string().describe("Brief explanation of the change"),
          }),
          execute: async ({ section, data, reason }: { section: string; data: Record<string, unknown>; reason: string }) => {
            toolCalls.push({
              tool: "update_section",
              args: { section, data, reason },
              result: { proposed: true, section, data },
            });
            return { success: true, message: `Proposed update to ${section}: ${reason}` };
          },
        }),
        create_content: tool({
          description: "Create new content like a blog post or event.",
          inputSchema: z.object({
            type: z.enum(["blog_post", "event", "service"]),
            content: z.record(z.string(), z.unknown()),
          }),
          execute: async ({ type, content: newContent }: { type: string; content: Record<string, unknown> }) => {
            toolCalls.push({
              tool: "create_content",
              args: { type, content: newContent },
              result: { proposed: true, type, content: newContent },
            });
            return { success: true, message: `Proposed new ${type}` };
          },
        }),
      };

      const result = await generateText({
        model: google("gemini-2.5-flash"),
        system: systemPrompt,
        messages: [{ role: "user", content: message }],
        tools,
        stopWhen: stepCountIs(3),
      });

      return NextResponse.json({
        response: result.text,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      });
    } catch (error) {
      console.error("[v1/chat] Error:", error);
      return NextResponse.json(
        { error: "Failed to process chat request" },
        { status: 500 }
      );
    }
  });
}
