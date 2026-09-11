import { NextResponse } from "next/server";
import { getAuthUserId, requireTenantAccess, requireTenantPermission, verifyAuth } from "@/lib/auth";
import { readJsonObject } from "@/lib/request-body";
import { getTenantConfig } from "@/lib/tenants";
import {
  approveInquiryMessageReview,
  inquiryReleaseEnabled,
  prepareInquiryMessageReview,
} from "@/products/inquiries";
import type {
  InquiryMessageReviewAction,
  InquiryMessageReviewOutcome,
  InquiryMessageReviewPrepareInput,
  InquiryMessageReviewPreview,
} from "@/products/inquiries";

export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
const OUTCOME_STATUSES = new Set<InquiryMessageReviewOutcome["status"]>([
  "ready",
  "awaiting_approval",
  "not_due",
  "paused",
  "budget_exhausted",
  "disabled",
  "sending",
  "accepted",
  "verified",
  "delivered",
  "bounced",
  "deferred",
  "suppressed",
  "accepted_unverified",
  "failed",
  "reconciliation_required",
  "retry_exhausted",
  "unavailable",
  "blocked",
]);

function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers });
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return false;
  return request.headers.get("sec-fetch-site") !== "cross-site";
}

function tenantId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const tenant = value.trim();
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(tenant) ? tenant : null;
}

function inquiryId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id.length > 0 && id.length <= 256 ? id : null;
}

function reviewToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim();
  return token.length > 0 && token.length <= 512 ? token : null;
}

function messageDigest(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digest = value.trim().toLowerCase();
  return /^[a-f0-9]{32,128}$/.test(digest) ? digest : null;
}

function action(value: unknown): InquiryMessageReviewAction | null {
  return value === "reply" || value === "owner_notification" || value === "schedule_follow_up" ? value : null;
}

function operation(value: unknown): "prepare" | "approve" | null {
  return value === "prepare" || value === "approve" ? value : null;
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

async function contextFor(body: Record<string, unknown>) {
  const tenant = tenantId(body.tenantId);
  if (!tenant) return { error: json({ error: "A tenantId is required." }, 400) } as const;
  const denied = await requireTenantAccess(tenant);
  if (denied) return { error: denied } as const;
  const config = await getTenantConfig(tenant);
  if (!config || !config.active) return { error: json({ error: "Business unavailable." }, 404) } as const;
  return { tenantId: tenant, businessId: config.stableId ?? tenant } as const;
}

function errorDetails(error: unknown): { code: string; message: string; status: number } {
  const row = error && typeof error === "object" ? error as { code?: unknown; message?: unknown; name?: unknown } : {};
  const code = typeof row.code === "string" ? row.code : typeof row.name === "string" ? row.name : "delivery_approval_failed";
  const known: Record<string, { message: string; status: number }> = {
    review_expired: { message: "This message review expired. Prepare a fresh review.", status: 409 },
    review_stale: { message: "This message review is stale. Prepare a fresh review.", status: 409 },
    approval_stale: { message: "This message review is stale. Prepare a fresh review.", status: 409 },
    review_revoked: { message: "This message review was revoked. Prepare a fresh review.", status: 409 },
    approval_revoked: { message: "This message review was revoked. Prepare a fresh review.", status: 409 },
    responsibility_revoked: { message: "The responsibility for this message was revoked. Prepare a fresh review.", status: 409 },
    message_mismatch: { message: "The reviewed message changed. Prepare a fresh review before sending.", status: 409 },
    message_digest_mismatch: { message: "The reviewed message changed. Prepare a fresh review before sending.", status: 409 },
    review_token_mismatch: { message: "This message review is no longer valid. Prepare a fresh review.", status: 409 },
    policy_changed: { message: "The current responsibility policy changed. Prepare a fresh review.", status: 409 },
    inquiry_changed: { message: "This inquiry changed. Refresh and prepare a fresh review.", status: 409 },
    recipient_route_changed: { message: "The recipient route changed. Prepare a fresh review.", status: 409 },
    approval_required: { message: "This message still requires an explicit review.", status: 409 },
    inquiry_not_found: { message: "Inquiry record unavailable.", status: 404 },
    recipient_unavailable: { message: "A permitted recipient is not configured.", status: 422 },
    permission_denied: { message: "You do not have permission to send this message.", status: 403 },
    delivery_approval_unavailable: { message: "Message delivery is temporarily unavailable.", status: 503 },
    current_policy_unavailable: { message: "The current responsibility policy is temporarily unavailable.", status: 503 },
    persistence_unavailable: { message: "The message review could not be saved.", status: 503 },
    delivery_unavailable: { message: "Message delivery is temporarily unavailable.", status: 503 },
  };
  const matched = known[code];
  if (matched) return { code, ...matched };
  return { code, message: "The message review could not be completed. Refresh and try again.", status: 503 };
}

function safeOutcome(outcome: InquiryMessageReviewOutcome, inquiryId: string, action: InquiryMessageReviewOutcome["action"]): InquiryMessageReviewOutcome | null {
  if (outcome.inquiryId !== inquiryId || outcome.action !== action || !OUTCOME_STATUSES.has(outcome.status) || typeof outcome.retryable !== "boolean") return null;
  const providerAccepted = ["accepted", "verified", "delivered", "accepted_unverified", "reconciliation_required"].includes(outcome.status);
  return { ...outcome, retryable: providerAccepted ? false : outcome.retryable };
}

function safeReview(review: InquiryMessageReviewPreview, inquiryId: string, action: InquiryMessageReviewAction): InquiryMessageReviewPreview | null {
  if (
    review.inquiryId !== inquiryId ||
    review.action !== action ||
    !hasText(review.reviewToken) ||
    !/^[a-f0-9]{32,128}$/.test(review.messageDigest) ||
    !hasText(review.recipient) ||
    !hasText(review.subject) ||
    !hasText(review.body) ||
    !hasText(review.policyVersion) ||
    !hasText(review.preparedAt) ||
    (review.expiresAt !== null && !hasText(review.expiresAt)) ||
    (review.capabilityVersion !== null && (!Number.isSafeInteger(review.capabilityVersion) || review.capabilityVersion < 1))
  ) return null;
  return review;
}

export async function POST(request: Request) {
  if (!inquiryReleaseEnabled()) return json({ error: "Inquiry workspace is not enabled." }, 503);
  if (!(await verifyAuth())) return json({ error: "Unauthorized" }, 401);
  if (!sameOrigin(request)) return json({ error: "Open Strelva directly to make this change." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Send a JSON request." }, 415);

  try {
    const body = await readJsonObject(request);
    if (!body) return json({ error: "Invalid request body." }, 400);
    const context = await contextFor(body);
    if ("error" in context && context.error) return context.error;
    const actorId = await getAuthUserId();
    if (!actorId) return json({ error: "Unauthorized" }, 401);
    const requestOperation = operation(body.operation);
    const id = inquiryId(body.inquiryId);
    const requestedAction = action(body.action);
    if (!requestOperation || !id || !requestedAction) return json({ error: "A review operation, inquiryId, and action are required." }, 400);
    const denied = await requireTenantPermission(context.tenantId, "content:write");
    if (denied) return denied;

    const baseInput: InquiryMessageReviewPrepareInput = {
      tenantId: context.tenantId,
      businessId: context.businessId,
      inquiryId: id,
      action: requestedAction,
      actorId,
    };
    if (requestOperation === "prepare") {
      // Preparation only renders and records a review token. It never calls a
      // transport or claims a delivery attempt.
      const review = await prepareInquiryMessageReview(baseInput);
      const safe = safeReview(review, id, requestedAction);
      if (!safe) return json({ error: "The message review could not be confirmed. Refresh before trying again.", code: "invalid_message_review" }, 503);
      return json({ review: safe });
    }

    const token = reviewToken(body.reviewToken);
    const digest = messageDigest(body.messageDigest);
    if (!token || !digest) return json({ error: "A server-issued review token and message digest are required." }, 400);
    const outcome = await approveInquiryMessageReview({ ...baseInput, reviewToken: token, messageDigest: digest });
    const safe = safeOutcome(outcome, id, requestedAction);
    if (!safe) return json({ error: "The send outcome could not be confirmed. Refresh before trying again.", code: "invalid_delivery_outcome" }, 503);
    return json({ outcome: safe });
  } catch (error) {
    const details = errorDetails(error);
    return json({ error: details.message, code: details.code }, details.status);
  }
}

export async function GET() {
  return json({ error: "Use POST to prepare or approve one message review." }, 405);
}
