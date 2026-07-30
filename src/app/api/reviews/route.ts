import { NextResponse } from "next/server";
import { verifyAuth, requireTenantAccess, requireTenantPermission } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getReviews, getReviewById, addReview, replyToReview } from "@/lib/reviews";
import { requireActiveSubscription } from "@/lib/subscription";
import { readJsonObject } from "@/lib/request-body";

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const reviews = await getReviews(tenant);
    return NextResponse.json(reviews);
  } catch {
    return NextResponse.json({ error: "Failed to load reviews" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tenant = await getTenantFromHeaders();
    const permissionDenied = await requireTenantPermission(tenant, "content:write");
    if (permissionDenied) return permissionDenied;
    const blocked = await requireActiveSubscription(tenant);
    if (blocked) return blocked;

    const body = await readJsonObject(req);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const source =
      body.source === "google" || body.source === "yelp" || body.source === "manual"
        ? body.source
        : "manual";
    const author = typeof body.author === "string" ? body.author : "";
    const rating = typeof body.rating === "number" ? body.rating : null;
    const text = typeof body.text === "string" ? body.text : "";
    const date = typeof body.date === "string" ? body.date : undefined;
    if (!author || !text || rating == null) {
      return NextResponse.json(
        { error: "author, text, and rating are required" },
        { status: 400 },
      );
    }

    const review = await addReview(tenant, {
      source,
      author,
      rating: Math.min(5, Math.max(1, Number(rating))),
      text,
      date: date || new Date().toISOString().slice(0, 10),
    });

    return NextResponse.json(review, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to add review" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tenant = await getTenantFromHeaders();
    const permissionDenied = await requireTenantPermission(tenant, "content:write");
    if (permissionDenied) return permissionDenied;
    const blocked = await requireActiveSubscription(tenant);
    if (blocked) return blocked;

    const body = await readJsonObject(req);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const reviewId = typeof body.reviewId === "string" ? body.reviewId : "";
    const replyText = typeof body.replyText === "string" ? body.replyText : "";
    if (!reviewId || !replyText) {
      return NextResponse.json(
        { error: "reviewId and replyText are required" },
        { status: 400 },
      );
    }

    // Guard: Google reviews must go through /api/reviews/reply which routes the
    // reply through the governed review_reply_draft → GBP publish path. Bypassing
    // it via PATCH would persist a reply locally without publishing to Google, and
    // permanently suppress the auto-reply backlog for this review.
    const target = await getReviewById(tenant, reviewId);
    if (target?.source === "google") {
      return NextResponse.json(
        { error: "Google reviews must be replied to via POST /api/reviews/reply" },
        { status: 409 },
      );
    }

    const updated = await replyToReview(tenant, reviewId, replyText);
    if (!updated) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed to reply to review" }, { status: 500 });
  }
}
