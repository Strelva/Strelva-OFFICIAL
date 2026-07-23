import { NextResponse } from "next/server";
import {
  CLIENT_ROLES,
  isSuperAdmin,
  getCurrentUserEmail,
  assignUserToTenant,
  requireTenantPermission,
  getActorContext,
  findUserIdByEmail,
  type ClientRole,
} from "@/lib/auth";
import { logAuditEvent } from "@/lib/storage";
import { getTenantConfig } from "@/lib/tenants";
import { createInvite } from "@/lib/invites";
import { getTenantDashboardUrl } from "@/lib/tenant-urls";
import { buildInviteEmailHtml, buildInviteEmailText, sanitizeEmailSubjectText } from "@/lib/invite-email";
import { emailSendingPaused } from "@/lib/email-enabled";
import { sendEmail } from "@/lib/email/send";
import { sendWelcomeEmail } from "@/lib/delivery-email";

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function getInviteSignUpUrl(baseSignUpUrl: string, email: string): string {
  try {
    const url = new URL(baseSignUpUrl);
    url.searchParams.set("email", email);
    return url.toString();
  } catch {
    const separator = baseSignUpUrl.includes("?") ? "&" : "?";
    return `${baseSignUpUrl}${separator}email=${encodeURIComponent(email)}`;
  }
}

/**
 * Alert when an invite was created but the email did NOT go out, so the client
 * never silently goes un-invited. Awaited (flushes before the function freezes
 * on Vercel); failure must not fail the route.
 */
async function alertInviteEmailGap(params: {
  email: string;
  tenantId: string;
  signUpUrl: string;
  reason: string;
}): Promise<void> {
  if (!process.env.SLACK_WEBHOOK_URL) return;
  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `⚠ Invite email NOT sent to ${params.email} (${params.tenantId}): ${params.reason}. Share manually: ${params.signUpUrl}`,
    }),
  }).catch(() => {});
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { email: rawEmail, tenant, role: requestedRole } = body as {
    email?: unknown;
    tenant?: unknown;
    role?: unknown;
  };
  const email = normalizeEmail(rawEmail);
  if (!email || typeof tenant !== "string" || !tenant.trim()) {
    return NextResponse.json({ error: "Missing email or tenant" }, { status: 400 });
  }
  const tenantId = tenant.trim();
  const role: ClientRole =
    typeof requestedRole === "string" && CLIENT_ROLES.includes(requestedRole as ClientRole)
      ? (requestedRole as ClientRole)
      : "owner";

  if (!(await isSuperAdmin())) {
    const denied = await requireTenantPermission(tenantId, "team:manage");
    if (denied) return denied;
  }

  const tenantConfig = await getTenantConfig(tenantId);
  if (!tenantConfig) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const existingUserId = await findUserIdByEmail(email);

  if (existingUserId) {
    const userId = existingUserId;
    const assigned = await assignUserToTenant(userId, tenantId, role);
    if (!assigned) {
      return NextResponse.json({ error: "Failed to assign existing user" }, { status: 500 });
    }
    await logAuditEvent({
      tenant: tenantId,
      action: "invite.send",
      targetType: "user",
      targetId: email,
      actor: await getActorContext(tenantId),
      metadata: { role, emailSent: false },
    });
    return NextResponse.json({
      success: true,
      existingUser: true,
      message: `${email} already has an account — assigned to ${tenantConfig.siteName}`,
    });
  }

  const invitedBy = await getCurrentUserEmail();
  try {
    await createInvite(email, tenantId, invitedBy || undefined, role);
  } catch (err) {
    console.error("[invite] Redis invite storage failed:", err);
    return NextResponse.json(
      { error: "Invite could not be stored. No email was sent." },
      { status: 500 }
    );
  }

  // A brand-new OWNER is being granted dashboard access here (the existing-user
  // branch above returned already, so this only runs for a not-yet-registered
  // owner — never a re-invite/re-assign, which is why we don't double-send). The
  // welcome sets the "we manage, you ask, you get a monthly report" expectation.
  // Best-effort and gated on the client emailSendingPaused() switch inside the
  // sender, so it stays silent during the test-tenant phase and can never block
  // the invite.
  if (role === "owner") {
    await sendWelcomeEmail({
      email,
      businessName: tenantConfig.siteName,
      ownerName: tenantConfig.ownerName?.trim() || undefined,
      dashboardUrl: getTenantDashboardUrl(tenantConfig, "/dashboard", "production"),
      logPrefix: "[invite]",
    }).catch(() => false);
  }

  const signUpUrl = getInviteSignUpUrl(
    getTenantDashboardUrl(tenantConfig, "/sign-up", "production"),
    email,
  );
  const siteNameText = sanitizeEmailSubjectText(tenantConfig.siteName);

  if (emailSendingPaused()) {
    console.warn(`[invites] email paused (EMAIL_SENDING_ENABLED != true) — invite recorded but not emailed to ${email}`);
    return NextResponse.json({
      success: true,
      emailed: false,
      reason: "email_sending_paused",
    });
  }

  if (process.env.RESEND_API_KEY) {
    // Route through the shared transport boundary (correct from-domain — never
    // the root Google-Workspace domain — replyTo default, audience gate). We
    // already returned above when email is paused. sendEmail THROWS on a real
    // provider failure (it only returns false for an intentional suppression /
    // missing key), so catch it — a Resend error must yield the share-link
    // fallback + alert + audit log, NOT an unhandled 500 with a dead invite.
    let sent = false;
    let sendError: string | null = null;
    try {
      sent = await sendEmail({
        audience: "client",
        to: email,
        subject: `You're invited to manage ${siteNameText}`,
        html: buildInviteEmailHtml({ email, siteName: tenantConfig.siteName, signUpUrl }),
        text: buildInviteEmailText({ email, siteName: tenantConfig.siteName, signUpUrl }),
      });
    } catch (err) {
      sendError = err instanceof Error ? err.message : "Resend send failed";
      console.error("[invite] Email send failed:", err);
    }

    await logAuditEvent({
      tenant: tenantId,
      action: "invite.send",
      targetType: "user",
      targetId: email,
      actor: await getActorContext(tenantId),
      metadata: { role, emailSent: sent },
    });

    if (!sent) {
      await alertInviteEmailGap({
        email,
        tenantId,
        signUpUrl,
        reason: sendError ?? "Resend send failed",
      });
      return NextResponse.json({
        success: true,
        emailSent: false,
        signUpUrl,
        message: `Invite created but email failed. Share this link: ${signUpUrl}`,
      });
    }

    return NextResponse.json({
      success: true,
      emailSent: true,
      signUpUrl,
      message: `Invite sent to ${email}`,
    });
  }

  await alertInviteEmailGap({
    email,
    tenantId,
    signUpUrl,
    reason: "RESEND_API_KEY not configured",
  });
  await logAuditEvent({
    tenant: tenantId,
    action: "invite.send",
    targetType: "user",
    targetId: email,
    actor: await getActorContext(tenantId),
    metadata: { role, emailSent: false },
  });
  return NextResponse.json({
    success: true,
    emailSent: false,
    signUpUrl,
    message: `Invite created. Share this link with ${email}: ${signUpUrl}`,
  });
}
