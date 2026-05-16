import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createTenantSubscriptionCheckout, BillingConfigurationError } from "@/lib/billing";
import {
  createSelfServeTenant,
  normalizeTenantSlug,
  SelfServeProvisioningError,
  validateTenantSlug,
} from "@/lib/self-serve";
import type { TemplateId } from "@/lib/types";

const selfServeTenantSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  ownerName: z.string().trim().max(120).optional(),
  industry: z.string().trim().max(80).optional(),
  template: z.string().trim().max(80).optional(),
  requestedSlug: z.string().trim().max(80).optional(),
  description: z.string().trim().max(600).optional(),
  location: z.string().trim().max(160).optional(),
  currentWebsite: z.string().trim().max(240).optional(),
  bookingUrl: z.string().trim().max(240).optional(),
  ownerPhone: z.string().trim().max(40).optional(),
  referredBy: z.string().trim().max(120).optional(),
  startCheckout: z.boolean().optional().default(false),
});

function getUserEmail(user: Awaited<ReturnType<typeof currentUser>>): string | null {
  return user?.emailAddresses?.[0]?.emailAddress?.toLowerCase() || null;
}

function getUserName(user: Awaited<ReturnType<typeof currentUser>>, fallback: string): string {
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  return fullName || fallback;
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await currentUser();
  const ownerEmail = getUserEmail(user);
  if (!ownerEmail) {
    return NextResponse.json(
      { error: "Your account needs a verified email before creating a site." },
      { status: 400 },
    );
  }

  const parsed = selfServeTenantSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid signup data." },
      { status: 400 },
    );
  }

  const body = parsed.data;
  if (body.requestedSlug) {
    const slugError = validateTenantSlug(normalizeTenantSlug(body.requestedSlug));
    if (slugError) return NextResponse.json({ error: slugError }, { status: 400 });
  }

  try {
    const result = await createSelfServeTenant(
      {
        businessName: body.businessName,
        ownerName: body.ownerName || getUserName(user, body.businessName),
        ownerEmail,
        clerkUserId: userId,
        industry: body.industry,
        template: body.template as TemplateId | undefined,
        requestedSlug: body.requestedSlug,
        description: body.description,
        location: body.location,
        currentWebsite: body.currentWebsite,
        bookingUrl: body.bookingUrl,
        ownerPhone: body.ownerPhone,
        referredBy: body.referredBy,
      },
      {
        userId,
        email: ownerEmail,
        type: "user",
        isSuperAdmin: false,
      },
    );

    let checkout: { checkoutUrl: string; stripeCustomerId: string } | null = null;
    if (body.startCheckout) {
      checkout = await createTenantSubscriptionCheckout({
        tenant: result.tenant,
        customerEmail: ownerEmail,
        customerName: result.tenant.ownerName,
        successUrl: result.dashboardUrl,
      });
    }

    return NextResponse.json(
      {
        tenantId: result.tenant.id,
        siteName: result.tenant.siteName,
        subscriptionStatus: result.tenant.subscriptionStatus || "none",
        dashboardUrl: result.dashboardUrl,
        publicUrl: result.publicUrl,
        seededSections: result.seededSections,
        checkoutUrl: checkout?.checkoutUrl || null,
        stripeCustomerId: checkout?.stripeCustomerId || result.tenant.stripeCustomerId || null,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof SelfServeProvisioningError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof BillingConfigurationError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    console.error("[self-serve tenant POST]", err);
    return NextResponse.json({ error: "Could not create the site." }, { status: 500 });
  }
}
