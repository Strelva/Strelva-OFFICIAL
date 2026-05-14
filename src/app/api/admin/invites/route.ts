import { NextResponse } from "next/server";
import {
  CLIENT_ROLES,
  isSuperAdmin,
  getCurrentUserEmail,
  assignUserToTenant,
  requireTenantPermission,
  type ClientRole,
} from "@/lib/auth";
import { getTenantConfig } from "@/lib/tenants";
import { createInvite } from "@/lib/invites";
import { clerkClient } from "@clerk/nextjs/server";
import { getTenantDashboardUrl } from "@/lib/tenant-urls";
import { buildInviteEmailHtml, buildInviteEmailText, sanitizeEmailSubjectText } from "@/lib/invite-email";

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

  const client = await clerkClient();
  const existingUsers = await client.users.getUserList({ emailAddress: [email] });

  if (existingUsers.data.length > 0) {
    const userId = existingUsers.data[0].id;
    const assigned = await assignUserToTenant(userId, tenantId, role);
    if (!assigned) {
      return NextResponse.json({ error: "Failed to assign existing user" }, { status: 500 });
    }
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

  const signUpUrl = getInviteSignUpUrl(
    getTenantDashboardUrl(tenantConfig, "/sign-up", "production"),
    email,
  );
  const siteNameText = sanitizeEmailSubjectText(tenantConfig.siteName);

  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);

      const result = await resend.emails.send({
        from: `Scaffold Web <hello@${process.env.RESEND_DOMAIN || "scaffoldweb.com"}>`,
        to: email,
        subject: `You're invited to manage ${siteNameText}`,
        html: buildInviteEmailHtml({ email, siteName: tenantConfig.siteName, signUpUrl }),
        text: buildInviteEmailText({ email, siteName: tenantConfig.siteName, signUpUrl }),
      });
      if (result.error || !result.data?.id) {
        throw new Error(result.error?.message || "Resend did not return an email id.");
      }

      return NextResponse.json({
        success: true,
        emailSent: true,
        signUpUrl,
        message: `Invite sent to ${email}`,
      });
    } catch (err) {
      console.error("[invite] Email send failed:", err);
      return NextResponse.json({
        success: true,
        emailSent: false,
        signUpUrl,
        message: `Invite created but email failed. Share this link: ${signUpUrl}`,
      });
    }
  }

  return NextResponse.json({
    success: true,
    emailSent: false,
    signUpUrl,
    message: `Invite created. Share this link with ${email}: ${signUpUrl}`,
  });
}
