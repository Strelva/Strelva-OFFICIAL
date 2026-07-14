import { NextResponse } from "next/server";
import { getAiVisibilityResult } from "@/lib/ai-visibility/results";
import {
  createDeliveryStatusToken,
  getExistingLeadToken,
  saveDeliveryLead,
} from "@/lib/access-request-delivery";
import { isRateLimitedWindowedAsync, rateLimitKey } from "@/lib/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (await isRateLimitedWindowedAsync(rateLimitKey(request, "ai-visibility-monitor"), 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }
  const { id } = await params;
  const stored = await getAiVisibilityResult(id);
  if (!stored) return NextResponse.json({ error: "Scorecard not found." }, { status: 404 });

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 160);
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  // Existing prospects already have an operator-visible lifecycle; do not
  // overwrite their richer intake record with this lighter monitoring signal.
  if (await getExistingLeadToken(email)) {
    return NextResponse.json({ success: true, existing: true });
  }

  const now = new Date().toISOString();
  const persisted = await saveDeliveryLead({
    businessName: stored.result.business,
    description: `Requested the AI Visibility monitoring pilot after a ${stored.result.grade} (${stored.result.score}/100) scorecard.`,
    location: stored.input.location ?? null,
    email,
    phone: null,
    currentWebsite: stored.result.url ?? null,
    plan: null,
    referredBy: `ai-visibility:${stored.id}`,
    statusToken: createDeliveryStatusToken(),
    deliveryStatus: "received",
    submittedAt: now,
    statusUpdatedAt: now,
  });
  if (!persisted) {
    return NextResponse.json({ error: "Monitoring signup is temporarily unavailable." }, { status: 503 });
  }
  return NextResponse.json({ success: true, existing: false });
}
