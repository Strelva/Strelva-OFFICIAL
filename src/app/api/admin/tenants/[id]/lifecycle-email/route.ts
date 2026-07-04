import { NextResponse } from "next/server";
import { isSuperAdmin, getActorContext } from "@/lib/auth";
import { getTenantConfig } from "@/lib/tenants";
import { logAuditEvent } from "@/lib/storage";
import { emailSendingPaused } from "@/lib/email-enabled";
import { getTenantDashboardUrl } from "@/lib/tenant-urls";
import {
  sendWelcomeEmail,
  sendSiteLiveEmail,
  sendReviewRequestEmail,
} from "@/lib/delivery-email";

/**
 * Operator "send" actions for the three client lifecycle emails (welcome,
 * site-live, review-request). An operator triggers one of these for a specific
 * client from the admin CRM drawer.
 *
 * POST body: { type: "welcome" | "site-live" | "review-request", reviewUrl?: string }
 *
 * The tenant's contact + URLs are resolved from the trusted tenant config, never
 * from request input. The underlying senders already gate on emailSendingPaused()
 * and fail soft (return false). Because false can mean either "paused" or "send
 * failed", when a send returns false AND client email is paused we return
 * 200 { sent: false, paused: true } so the UI can say "email is paused" rather
 * than showing a failure. Super-admin only, audit-logged.
 */

const TYPES = ["welcome", "site-live", "review-request"] as const;
type LifecycleType = (typeof TYPES)[number];

function isLifecycleType(value: unknown): value is LifecycleType {
  return typeof value === "string" && (TYPES as readonly string[]).includes(value);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const config = await getTenantConfig(id);
  if (!config) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { type, reviewUrl } = (body ?? {}) as { type?: unknown; reviewUrl?: unknown };

  if (!isLifecycleType(type)) {
    return NextResponse.json(
      { error: `type must be one of: ${TYPES.join(", ")}.` },
      { status: 400 },
    );
  }

  const email = config.ownerEmail?.trim();
  if (!email) {
    return NextResponse.json(
      { error: "This client has no owner email on file. Add one before sending." },
      { status: 400 },
    );
  }

  const businessName = config.siteName;
  const ownerName = config.ownerName?.trim() || undefined;
  const dashboardUrl = getTenantDashboardUrl(config);

  let sent = false;
  if (type === "welcome") {
    sent = await sendWelcomeEmail({ email, businessName, ownerName, dashboardUrl });
  } else if (type === "site-live") {
    const siteUrl = config.siteUrl?.trim();
    if (!siteUrl) {
      return NextResponse.json({ error: "This client has no site URL on file." }, { status: 400 });
    }
    sent = await sendSiteLiveEmail({ email, businessName, siteUrl, dashboardUrl });
  } else {
    const url = typeof reviewUrl === "string" ? reviewUrl.trim() : "";
    if (!url) {
      return NextResponse.json({ error: "A review URL is required." }, { status: 400 });
    }
    sent = await sendReviewRequestEmail({ email, businessName, reviewUrl: url, ownerName });
  }

  // A false return can mean "paused" or "send failed". Surface paused distinctly
  // so the UI reads it as an off-switch, not an error.
  if (!sent && emailSendingPaused()) {
    return NextResponse.json({ sent: false, paused: true });
  }

  await logAuditEvent({
    tenant: id,
    action: "lifecycle-email.send",
    targetType: "tenant",
    targetId: id,
    actor: await getActorContext(id),
    metadata: { type, sent },
  }).catch(() => {});

  return NextResponse.json({ sent });
}
