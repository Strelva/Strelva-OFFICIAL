import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { withAPIAuth } from "@/lib/api-auth";

const requestSchema = z.object({
  siteName: z.string(),
  content: z.record(z.string(), z.unknown()),
  analytics: z.object({
    visitors: z.number(),
    pageViews: z.number().optional(),
    clicks: z.record(z.string(), z.number()).optional(),
    topPages: z.array(z.string()).optional(),
  }),
  period: z.object({
    start: z.string(),
    end: z.string(),
  }),
});

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

      const { siteName, analytics, period } = parsed.data;

      const bookingClicks = analytics.clicks?.["booking"] || 0;
      const contactClicks = analytics.clicks?.["contact"] || 0;

      const prompt = `Generate a brief, friendly weekly report for ${siteName}.

METRICS THIS WEEK (${period.start} to ${period.end}):
- Visitors: ${analytics.visitors}
- Page views: ${analytics.pageViews || "N/A"}
- Booking clicks: ${bookingClicks}
- Contact clicks: ${contactClicks}
- Top pages: ${analytics.topPages?.join(", ") || "N/A"}

Write 2-3 sentences summarizing performance in plain English.
- Use "people" not "visitors" or "users"
- Lead with the most interesting number
- End with one actionable suggestion
- Keep it warm and encouraging
- No jargon, no marketing speak

Example tone: "47 people found you this week, and 3 clicked Book Now. Your services page is getting attention — maybe add a photo?"`;

      const result = await generateText({
        model: google("gemini-2.5-flash"),
        messages: [{ role: "user", content: prompt }],
      });

      return NextResponse.json({
        summary: result.text,
        metrics: {
          visitors: analytics.visitors,
          pageViews: analytics.pageViews,
          bookingClicks,
          contactClicks,
          period,
        },
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[v1/report] Error:", error);
      return NextResponse.json(
        { error: "Failed to generate report" },
        { status: 500 }
      );
    }
  });
}
