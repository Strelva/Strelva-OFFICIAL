import { NextResponse } from "next/server";
import { isSuperAdmin, getCurrentUserEmail, assignUserToTenant } from "@/lib/auth";
import { getTenantConfig } from "@/lib/tenants";
import { createInvite } from "@/lib/invites";
import { clerkClient } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  const admin = await isSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { email, tenant } = await req.json();
  if (!email || !tenant) {
    return NextResponse.json({ error: "Missing email or tenant" }, { status: 400 });
  }

  const tenantConfig = await getTenantConfig(tenant);
  if (!tenantConfig) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const client = await clerkClient();
  const existingUsers = await client.users.getUserList({ emailAddress: [email] });

  if (existingUsers.data.length > 0) {
    const userId = existingUsers.data[0].id;
    const assigned = await assignUserToTenant(userId, tenant);
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
  await createInvite(email, tenant, invitedBy || undefined);

  const signUpUrl = tenantConfig.productionDomain
    ? `https://${tenantConfig.productionDomain}/sign-up`
    : `https://${tenant}.scaffoldweb.com/sign-up`;

  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);

      await resend.emails.send({
        from: `Scaffold Web <hello@${process.env.RESEND_DOMAIN || "scaffoldweb.com"}>`,
        to: email,
        subject: `You're invited to manage ${tenantConfig.siteName}`,
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
            <h1 style="font-size: 24px; font-weight: 600; color: #111; margin-bottom: 16px;">
              Your dashboard is ready
            </h1>
            <p style="font-size: 16px; color: #444; line-height: 1.6; margin-bottom: 24px;">
              You now have access to manage <strong>${tenantConfig.siteName}</strong>.
              See what's happening with your site, make updates, and get weekly reports.
            </p>
            <a href="${signUpUrl}" style="display: inline-block; background: #111; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
              Create your account
            </a>
            <p style="font-size: 14px; color: #888; margin-top: 32px;">
              This link will work for the next 30 days.
            </p>
          </div>
        `,
      });

      return NextResponse.json({
        success: true,
        emailSent: true,
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
