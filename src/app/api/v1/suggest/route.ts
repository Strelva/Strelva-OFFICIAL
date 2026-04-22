import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAPIAuth } from "@/lib/api-auth";

const requestSchema = z.object({
  content: z.record(z.string(), z.unknown()),
  lastUpdated: z.record(z.string(), z.string()).optional(),
  analytics: z
    .object({
      visitors: z.number().optional(),
      topPages: z.array(z.string()).optional(),
    })
    .optional(),
});

interface Suggestion {
  id: string;
  type: "stale" | "missing" | "opportunity" | "engagement";
  priority: "high" | "medium" | "low";
  message: string;
  action: string;
}

function detectStaleSections(
  content: Record<string, unknown>,
  lastUpdated: Record<string, string>
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const now = Date.now();
  const STALE_THRESHOLD = 30 * 24 * 60 * 60 * 1000; // 30 days

  for (const [section, dateStr] of Object.entries(lastUpdated)) {
    const updated = new Date(dateStr).getTime();
    const age = now - updated;

    if (age > STALE_THRESHOLD) {
      const days = Math.floor(age / (24 * 60 * 60 * 1000));
      suggestions.push({
        id: `stale-${section}`,
        type: "stale",
        priority: days > 60 ? "high" : "medium",
        message: `Your ${section} section hasn't been updated in ${days} days.`,
        action: `Review and refresh my ${section} section`,
      });
    }
  }

  return suggestions;
}

function detectMissingContent(content: Record<string, unknown>): Suggestion[] {
  const suggestions: Suggestion[] = [];

  const settings = content.settings as Record<string, unknown> | undefined;
  const contact = content.contact as Record<string, unknown> | undefined;

  if (!settings?.bookingUrl) {
    suggestions.push({
      id: "missing-booking",
      type: "missing",
      priority: "high",
      message: "You don't have a booking link set up. Visitors can't easily schedule with you.",
      action: "Help me add a booking link to my site",
    });
  }

  if (!contact?.phone && !contact?.email) {
    suggestions.push({
      id: "missing-contact",
      type: "missing",
      priority: "high",
      message: "Your contact info is missing. Make it easy for customers to reach you.",
      action: "Add my contact information",
    });
  }

  if (!content.testimonials || (Array.isArray(content.testimonials) && content.testimonials.length === 0)) {
    suggestions.push({
      id: "missing-testimonials",
      type: "missing",
      priority: "medium",
      message: "Social proof matters. Add some customer testimonials to build trust.",
      action: "Help me add testimonials to my site",
    });
  }

  return suggestions;
}

function detectOpportunities(
  content: Record<string, unknown>,
  analytics?: { visitors?: number; topPages?: string[] }
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // Blog opportunity
  const posts = content.blogPosts as unknown[] | undefined;
  if (!posts || posts.length < 3) {
    suggestions.push({
      id: "opportunity-blog",
      type: "opportunity",
      priority: "low",
      message: "A blog helps you rank in search. Want me to write a post about your expertise?",
      action: "Write a blog post about what makes my business unique",
    });
  }

  // High traffic opportunity
  if (analytics?.visitors && analytics.visitors > 100) {
    suggestions.push({
      id: "opportunity-cta",
      type: "engagement",
      priority: "medium",
      message: `You had ${analytics.visitors} visitors recently. Let's make sure your call-to-action is compelling.`,
      action: "Review and improve my main call-to-action",
    });
  }

  return suggestions;
}

export async function POST(req: NextRequest) {
  return withAPIAuth(req, async () => {
    try {
      const body = await req.json();
      const parsed = requestSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid request", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const { content, lastUpdated = {}, analytics } = parsed.data;

      const suggestions: Suggestion[] = [
        ...detectStaleSections(content, lastUpdated),
        ...detectMissingContent(content),
        ...detectOpportunities(content, analytics),
      ];

      // Sort by priority
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

      return NextResponse.json({
        suggestions: suggestions.slice(0, 5), // Top 5
        total: suggestions.length,
      });
    } catch (error) {
      console.error("[v1/suggest] Error:", error);
      return NextResponse.json(
        { error: "Failed to generate suggestions" },
        { status: 500 }
      );
    }
  });
}
