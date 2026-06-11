/**
 * POST /api/reviews/reply-approval
 *
 * Approves a queued review-reply draft and publishes it to Google Business
 * Profile via the GBP reviews.updateReply API. Requires super-admin auth
 * (only Jacob approves — owner approval flows are not yet wired in the
 * dashboard UI).
 *
 * Body: { eventId: string, tenantId: string }
 *
 * Resolves the pending event to "approved", then calls publishReviewReply.
 * The publish path emits its own change_verified / change_verify_failed events.
 */

import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/auth";
import { getEvent, updateEvent } from "@/lib/events";
import { publishReviewReply } from "@/lib/gbp-replies";
import { readJsonObject } from "@/lib/request-body";

export async function POST(req: Request) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await readJsonObject(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  const tenantId = typeof body.tenantId === "string" ? body.tenantId.trim() : "";

  if (!eventId || !tenantId) {
    return NextResponse.json(
      { error: "Missing required fields: eventId, tenantId" },
      { status: 400 }
    );
  }

  // Load the pending draft event
  const event = await getEvent(eventId);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (event.tenantId !== tenantId) {
    return NextResponse.json({ error: "Tenant mismatch" }, { status: 403 });
  }
  if (event.metadata?.kind !== "review_reply_draft") {
    return NextResponse.json(
      { error: "Event is not a review_reply_draft" },
      { status: 400 }
    );
  }
  if (event.status !== "pending") {
    return NextResponse.json(
      { error: "Event is not pending", currentStatus: event.status },
      { status: 409 }
    );
  }

  const reviewId =
    typeof event.metadata?.reviewId === "string" ? event.metadata.reviewId : "";
  const replyText =
    typeof event.metadata?.draftedReply === "string"
      ? event.metadata.draftedReply
      : typeof event.body === "string"
      ? event.body
      : "";

  if (!reviewId || !replyText) {
    return NextResponse.json(
      { error: "Event is missing reviewId or draftedReply in metadata" },
      { status: 422 }
    );
  }

  // Resolve event to approved before publishing so that a publish failure
  // doesn't leave a stale "pending" entry blocking future approvals.
  await updateEvent(eventId, (e) => ({
    ...e,
    status: "approved" as const,
    resolvedAt: new Date().toISOString(),
  }));

  // Publish to GBP + read-back verify. Never throws.
  const result = await publishReviewReply(tenantId, reviewId, replyText);

  return NextResponse.json({
    ok: true,
    published: result.published,
    verified: result.verified,
    evidence: result.evidence,
  });
}
