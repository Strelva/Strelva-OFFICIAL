import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { scoreAiVisibility, type ScoreInput } from "@/lib/ai-visibility/score";

/**
 * Public AI-visibility audit endpoint (sales lead-magnet front door).
 *
 * POST { business, url?, category?, city? } -> AiVisibilityResult JSON.
 *
 * Reuses the existing scorer in `src/lib/ai-visibility/score.ts` verbatim — no
 * scoring logic lives here. The scorer already degrades gracefully without
 * GOOGLE_GENERATIVE_AI_API_KEY (readiness-only mode), so a missing key is not an
 * error here. This route only validates input and surfaces failures cleanly.
 */
export async function POST(request: NextRequest) {
  let body: { business?: string; url?: string; category?: string; city?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const business = body.business?.trim();
  if (!business) {
    return NextResponse.json({ error: "Business name is required." }, { status: 400 });
  }

  const url = body.url?.trim();
  // Validate URL shape when provided (the scorer normalizes scheme itself).
  if (url) {
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    try {
      new URL(normalized);
    } catch {
      return NextResponse.json(
        { error: "Please enter a valid website URL (e.g., example.com)." },
        { status: 400 }
      );
    }
  }

  const input: ScoreInput = {
    business,
    url: url || undefined,
    category: body.category?.trim() || undefined,
    location: body.city?.trim() || undefined,
  };

  try {
    const result = await scoreAiVisibility(input);
    return NextResponse.json(result);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { feature: "ai-visibility-audit" },
      extra: { business, url },
    });
    return NextResponse.json(
      { error: "We couldn't run the audit right now. Please try again." },
      { status: 500 }
    );
  }
}
