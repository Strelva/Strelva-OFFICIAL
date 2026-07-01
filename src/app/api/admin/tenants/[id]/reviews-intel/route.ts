import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/auth";
import { getTenantConfig } from "@/lib/tenants";
import { getReviews } from "@/lib/reviews";
import { getAdminReviewIntelligence } from "@/lib/reviews/intelligence";

/**
 * Operator review intelligence for one tenant — the admin-only picture of a
 * client's reputation: sentiment breakdown, the urgent-first "needs a reply"
 * queue, unanswered negatives, and emerging concerns.
 *
 * This is deliberately admin-side. The client dashboard and the weekly report
 * show only the positive summary (`getClientReviewSummary`); the issues and the
 * response queue live here for Jacob / super-admins to act on. Super-admin only.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const config = await getTenantConfig(id);
  if (!config) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const reviews = await getReviews(id).catch(() => []);
  const intelligence = getAdminReviewIntelligence(reviews);

  return NextResponse.json(intelligence);
}
