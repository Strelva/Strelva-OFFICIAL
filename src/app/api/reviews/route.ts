import { NextResponse } from "next/server";
import { verifyAuth, requireTenantAccess, requireTenantPermission } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getReviews, addReview, replyToReview } from "@/lib/reviews";
import { requireActiveSubscription } from "@/lib/subscription";

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
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;
    const permissionDenied = await requireTenantPermission(tenant, "content:write");
    if (permissionDenied) return permissionDenied;
    const blocked = await requireActiveSubscription(tenant);
    if (blocked) return blocked;

    const body = await req.json();

    const { source, author, rating, text, date } = body;
    if (!author || !text || rating == null) {
      return NextResponse.json(
        { error: "author, text, and rating are required" },
        { status: 400 },
      );
    }

    const review = await addReview(tenant, {
      source: source || "manual",
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
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;
    const permissionDenied = await requireTenantPermission(tenant, "content:write");
    if (permissionDenied) return permissionDenied;
    const blocked = await requireActiveSubscription(tenant);
    if (blocked) return blocked;

    const body = await req.json();

    const { reviewId, replyText } = body;
    if (!reviewId || !replyText) {
      return NextResponse.json(
        { error: "reviewId and replyText are required" },
        { status: 400 },
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
