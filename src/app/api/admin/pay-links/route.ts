import { authorizeAdminOperatorRead } from "@/platform/operator-read-audit/admission";
import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/platform/infra/auth";
import { listBuildPayments } from "@/lib/revenue";
import { listPayLinks, PayLinkStorageError } from "@/lib/pay-links";

/** Platform support cannot sell agency work, with either billing flag value. */
export async function POST(_request: Request) {
  if (!await isSuperAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ error: "Create pay links through your verified ordinary agency workspace.", agencyPath: "/api/agency/pay-links" }, { status: 410 });
}

/**
 * Super-admin only. Lists every minted pay link (newest first) so Jacob can see
 * what's outstanding — including slug, door, amount(s), createdAt, createdBy.
 */
export async function GET() {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await authorizeAdminOperatorRead("admin.pay-links.read");

  let payLinks;
  try {
    payLinks = await listPayLinks();
  } catch (err) {
    if (err instanceof PayLinkStorageError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    throw err;
  }

  // Cross-reference the build-payment money trail so the UI can show which links
  // actually converted (a payment whose paySlug matches the link's slug), with
  // enriched data (amount paid, customer email, when it happened).
  const payments = await listBuildPayments().catch(() => []);

  // Build a map: slug -> most-recent payment detail (amountCents, customerEmail, paidAt).
  // A slug can theoretically convert more than once; keep the most-recent by createdAt.
  const paidPayments: Record<string, { amountCents: number; customerEmail?: string; paidAt: string }> = {};
  for (const p of payments) {
    if (!p.paySlug) continue;
    const existing = paidPayments[p.paySlug];
    if (!existing || p.createdAt > existing.paidAt) {
      paidPayments[p.paySlug] = {
        amountCents: p.amountCents,
        customerEmail: p.customerEmail,
        paidAt: p.createdAt,
      };
    }
  }

  return NextResponse.json({ payLinks, count: payLinks.length, paidPayments });
}

/** Existing service invoices are inspected here; changes belong to their agency. */
export async function DELETE(_request: Request) {
  if (!await isSuperAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ error: "Manage service invoices through ordinary agency access. Nothing changed." }, { status: 410 });
}
