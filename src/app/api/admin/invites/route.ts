import { getSupabase } from "@/platform/infra/db/client";
import { readPlatformStaffStrict } from "@/platform/infra/platform-staff-read";
import { NextResponse } from "next/server";
import {
  CLIENT_ROLES,
  isSuperAdmin,
  getCurrentUserEmail,
  assignUserToTenant,
  getActorContext,
  findUserIdByEmail,
  type ClientRole,
} from "@/platform/infra/auth";
import { logAuditEvent } from "@/lib/storage";
import { getTenantConfig } from "@/lib/tenants";
import { createInvite } from "@/lib/invites";
import { getTenantDashboardUrl } from "@/lib/tenant-urls";
import { inviteEmailOptions, sanitizeEmailSubjectText } from "@/lib/invite-email";
import { emailSendingPaused } from "@/platform/infra/email/enabled";
import { sendEmail } from "@/platform/infra/email/send";
import { sendWelcomeEmail } from "@/lib/delivery-email";
import { releaseWorkspaceForTenant } from "@/platform/release-flags/store";
import { NON_OWNER_ON_BUSINESS, operatorOwnerInvitationContext, oneInvitationPathEnabled, ownerInvitationsReleaseEnabled } from "@/platform/owner-entry/operator-invitations";
import { issueWorkspaceInvitation } from "@/platform/workspaces/invitations";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";

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

  const { email: rawEmail, tenant, role: requestedRole, reason: rawReason } = body as {
    email?: unknown;
    tenant?: unknown;
    role?: unknown;
    reason?: unknown;
  };
  const email = normalizeEmail(rawEmail);
  if (!email || typeof tenant !== "string" || !tenant.trim()) {
    return NextResponse.json({ error: "Missing email or tenant" }, { status: 400 });
  }
  if (requestedRole !== undefined && (typeof requestedRole !== "string" || !CLIENT_ROLES.includes(requestedRole as ClientRole))) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  const tenantId = tenant.trim();
  const role: ClientRole =
    typeof requestedRole === "string" && CLIENT_ROLES.includes(requestedRole as ClientRole)
      ? (requestedRole as ClientRole)
      : "owner";

  // This route lives under /api/admin and is super-admin-only. The tenantId
  // is taken from the request body, which makes a non-super-admin fallback
  // unsafe (a caller could supply an arbitrary tenantId). Tenant-owner
  // invite flows belong on a tenant-scoped route such as /api/dashboard/team/*
  // where the tenant comes from the authenticated session, not from
  // caller-supplied input.
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantConfig = await getTenantConfig(tenantId);
  if (!tenantConfig) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const actor = await getActorContext(tenantId);
  if (!actor.userId || !actor.isSuperAdmin || actor.isImpersonating) {
    return NextResponse.json({ error: "Verified platform operator required" }, { status: 403 });
  }
  if (actor.email?.trim().toLowerCase() === email) {
    return NextResponse.json({ error: "Platform operators cannot invite themselves to a client." }, { status: 403 });
  }
  let existingUserId: string | null;
  try {
    // The legacy lookup is best-effort; confirm absence before preparing an
    // invite so a failed identity read cannot become an owner invitation.
    const foundUserId = await findUserIdByEmail(email);
    const db = getSupabase();
    if (!db) throw new Error("Identity check unavailable");
    const { data: target, error } = await db.from("users").select("id").eq("email", email).maybeSingle();
    if (error || (foundUserId && foundUserId !== target?.id)) throw new Error("Identity check unavailable");
    existingUserId = target?.id ?? null;
    if (existingUserId === actor.userId || (existingUserId && role !== "viewer" && await readPlatformStaffStrict(existingUserId))) {
      return NextResponse.json({ error: "Platform staff cannot receive client content-writing access." }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Access checks are unavailable. Try again later." }, { status: 503 });
  }

  const reason = typeof rawReason === "string" ? rawReason.trim() : "";
  if (!reason || reason.length > 1000) return NextResponse.json({ error: "Give a reason for this access change (up to 1000 characters)." }, { status: 400 });
  // A converted business is invited through workspace invitations only. An
  // operator invites its owner; nobody is assigned a tenant role directly.
  let legacy = false;
  if (oneInvitationPathEnabled()) {
    let workspaceId: string | null;
    try {
      workspaceId = await releaseWorkspaceForTenant(tenantId);
    } catch {
      return NextResponse.json({ error: "Access checks are unavailable. Try again later." }, { status: 503 });
    }
    if (workspaceId) {
      if (role !== "owner") return NextResponse.json({ error: NON_OWNER_ON_BUSINESS }, { status: 409 });
      if (!ownerInvitationsReleaseEnabled()) return NextResponse.json({ error: "Owner invitations are not released." }, { status: 409 });
      try {
        await logAuditEvent({ tenant: tenantId, action: "invite.requested", targetType: "user", targetId: email, actor, metadata: { role, reason, path: "workspace_invitation" } });
      } catch {
        return NextResponse.json({ error: "Invitation could not be recorded. No invitation was created." }, { status: 503 });
      }
      try {
        const context = await operatorOwnerInvitationContext(tenantId);
        const issued = await issueWorkspaceInvitation({
          workspaceId: context.state.workspaceId,
          recipientEmail: email,
          role: "owner",
          issuer: { kind: "operator", actor: context.actor, authTime: context.authTime, auditContext: { source: "web" } },
        });
        return NextResponse.json({
          success: true,
          workspaceInvitation: true,
          invitation: issued.invitation,
          delivery: issued.delivery,
          ...(issued.delivery.status !== "accepted" ? { acceptUrl: issued.acceptUrl } : {}),
        });
      } catch (error) {
        if (error instanceof WorkspaceConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
        if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: "An active Strelva operator with business admin membership is required." }, { status: 403 });
        console.error("[invite] Workspace owner invitation failed:", error);
        return NextResponse.json({ error: "Owner invitation storage is unavailable. Refresh the invitation state before trying again." }, { status: 503 });
      }
    }
    legacy = true;
  }
  if (existingUserId) {
    const userId = existingUserId;
    try {
      await logAuditEvent({ tenant: tenantId, action: "tenant.assign_user_requested", targetType: "user", targetId: userId, actor, metadata: { role, email, reason, source: "invite" } });
    } catch {
      return NextResponse.json({ error: "Access change could not be recorded. No access was granted." }, { status: 503 });
    }
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
      metadata: { role, emailSent: false, reason },
    });
    return NextResponse.json({
      success: true,
      ...(legacy ? { legacy: true } : {}),
      existingUser: true,
      message: `${email} already has an account — assigned to ${tenantConfig.siteName}`,
    });
  }

  try {
    await logAuditEvent({ tenant: tenantId, action: "invite.requested", targetType: "user", targetId: email, actor, metadata: { role, reason } });
  } catch {
    return NextResponse.json({ error: "Invitation could not be recorded. No invitation was created." }, { status: 503 });
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

  const signUpUrl = getInviteSignUpUrl(
    getTenantDashboardUrl(tenantConfig, "/sign-up", "production"),
    email,
  );
  const siteNameText = sanitizeEmailSubjectText(tenantConfig.siteName);

  if (emailSendingPaused()) {
    console.warn(`[invites] email paused (EMAIL_SENDING_ENABLED != true) — invite recorded but not emailed to ${email}`);
    return NextResponse.json({
      success: true,
      ...(legacy ? { legacy: true } : {}),
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

    // A brand-new OWNER is being granted dashboard access. The welcome email
    // sets the "we manage, you ask, you get a monthly report" expectation.
    // Sent here — after emailSendingPaused() returned false — so the welcome
    // never fires during the test-tenant phase. Best-effort; failure does not
    // block the invite email that follows.
    if (role === "owner") {
      await sendWelcomeEmail({
        email,
        businessName: tenantConfig.siteName,
        tenantId,
        ownerName: tenantConfig.ownerName?.trim() || undefined,
        dashboardUrl: getTenantDashboardUrl(tenantConfig, "/dashboard", "production"),
        logPrefix: "[invite]",
      }).catch(() => false);
    }

    let sent = false;
    let sendError: string | null = null;
    try {
      sent = await sendEmail({
        audience: "client",
        tenantId,
        to: email,
        subject: `You're invited to manage ${siteNameText}`,
        options: inviteEmailOptions({ email, siteName: tenantConfig.siteName, signUpUrl }),
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
      metadata: { role, emailSent: sent, reason },
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
      ...(legacy ? { legacy: true } : {}),
        emailSent: false,
        signUpUrl,
        message: `Invite created but email failed. Share this link: ${signUpUrl}`,
      });
    }

    return NextResponse.json({
      success: true,
      ...(legacy ? { legacy: true } : {}),
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
    metadata: { role, emailSent: false, reason },
  });
  return NextResponse.json({
    success: true,
      ...(legacy ? { legacy: true } : {}),
    emailSent: false,
    signUpUrl,
    message: `Invite created. Share this link with ${email}: ${signUpUrl}`,
  });
}
