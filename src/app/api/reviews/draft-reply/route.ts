/**
 * POST /api/reviews/draft-reply
 *
 * Generates an AI-drafted reply for a single review so the owner can copy it
 * into Google. Auth-gated like the other dashboard review routes (verifyAuth +
 * requireTenantAccess). Reuses the battle-tested `draftReviewReply` helper,
 * which lints against Google's rejection filter and falls back to a
 * deterministic template when the model is unavailable — so this never
 * hard-fails. Returns the drafted string for the panel to show in an editable
 * textarea; it does NOT publish anything.
 *
 * Body: { author: string, rating: number, text?: string }
 */

import { NextResponse } from "next/server";
import { verifyAuth, requireTenantAccess } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTenantConfig } from "@/lib/tenants";
import { draftReviewReply, buildDeterministicReply } from "@/lib/review-replies";
import { readJsonObject } from "@/lib/request-body";

export async function POST(req: Request) {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse the body ONCE here — the request stream can only be read a single
  // time, so the catch below must reuse this object, never re-read `req`.
  const body = await readJsonObject(req).catch(() => null);
  const fallbackAuthor =
    body && typeof body.author === "string" && body.author.trim()
      ? body.author.trim()
      : "there";
  const fallbackRating =
    body && Number.isFinite(Number(body.rating))
      ? Math.min(5, Math.max(1, Math.round(Number(body.rating))))
      : 5;

  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const author = typeof body.author === "string" ? body.author.trim() : "";
    const rawRating = typeof body.rating === "number" ? body.rating : Number(body.rating);
    const text = typeof body.text === "string" ? body.text : "";

    if (!author || !Number.isFinite(rawRating)) {
      return NextResponse.json(
        { error: "author and rating are required" },
        { status: 400 },
      );
    }
    const rating = Math.min(5, Math.max(1, Math.round(rawRating)));

    const config = await getTenantConfig(tenant);

    const reply = await draftReviewReply(
      { reviewId: `draft_${Date.now()}`, reviewerName: author, rating, comment: text },
      { id: tenant, siteName: config?.siteName ?? tenant },
    );

    return NextResponse.json({ reply });
  } catch {
    // Last-resort deterministic fallback so the UI always gets something usable.
    // Uses the already-parsed body (the stream is gone by now).
    return NextResponse.json({
      reply: buildDeterministicReply(fallbackAuthor, fallbackRating),
      fallback: true,
    });
  }
}
