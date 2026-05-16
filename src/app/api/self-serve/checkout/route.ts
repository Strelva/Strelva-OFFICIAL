import { NextResponse } from "next/server";
import { z } from "zod";
import { createTenantSubscriptionCheckout, BillingConfigurationError } from "@/lib/billing";
import { getCurrentUserEmail, requireTenantPermission, verifyAuth } from "@/lib/auth";
import { getTenantConfig } from "@/lib/tenants";

const checkoutSchema = z.object({
  tenantId: z.string().trim().min(3).max(80).regex(/^[a-z0-9-]+$/),
});

export async function POST(req: Request) {
  if (!(await verifyAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = checkoutSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "tenantId is required." }, { status: 400 });
  }

  const tenantId = parsed.data.tenantId;
  const denied = await requireTenantPermission(tenantId, "billing:manage");
  if (denied) return denied;

  const tenant = await getTenantConfig(tenantId);
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
  }

  try {
    const checkout = await createTenantSubscriptionCheckout({
      tenant,
      customerEmail: tenant.ownerEmail || (await getCurrentUserEmail()) || undefined,
      customerName: tenant.ownerName,
    });

    return NextResponse.json(checkout);
  } catch (err) {
    const status = err instanceof BillingConfigurationError ? 500 : 502;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not start checkout." },
      { status },
    );
  }
}
