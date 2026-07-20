import { NextResponse } from "next/server";
import { getActorContext, isSuperAdmin } from "@/lib/auth";
import { logAuditEvent } from "@/lib/storage";
import { readJsonObject } from "@/lib/request-body";
import { provisionTenant } from "@/lib/provisioning";
import { getTenantConfig } from "@/lib/tenants";
import { setLeadWorkflowStatus } from "@/lib/lead-workflow";
import type { BillingType, CommercialPlanKey, PresenceProfile } from "@/lib/types";

const LEAD_TOKEN_RE = /^[a-f0-9]{36}$/;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNumber(value: unknown): number | undefined {
  if (typeof value === "number" && isFinite(value) && value >= 0) return Math.round(value);
  if (typeof value === "string") {
    const n = parseFloat(value);
    if (isFinite(n) && n >= 0) return Math.round(n);
  }
  return undefined;
}

const VALID_BILLING_TYPES: BillingType[] = ["tier", "custom", "case_study", "none"];
const VALID_TIERS: CommercialPlanKey[] = ["presence", "growth", "scale"];
const VALID_PRESENCE: PresenceProfile[] = ["local", "online", "hybrid"];

export async function POST(req: Request) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await readJsonObject(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const subdomain = clean(body.subdomain).toLowerCase();
  const siteName = clean(body.siteName);
  const ownerName = clean(body.ownerName);
  const industry = clean(body.industry);

  if (!subdomain || !siteName || !ownerName || !industry) {
    return NextResponse.json(
      { error: "subdomain, siteName, ownerName, and industry are required" },
      { status: 400 }
    );
  }
  if (!/^[a-z0-9-]{2,63}$/.test(subdomain) || subdomain.startsWith("-") || subdomain.endsWith("-")) {
    return NextResponse.json(
      { error: "subdomain must be 2-63 lowercase letters, numbers, or hyphens" },
      { status: 400 }
    );
  }

  // Billing fields — optional but validated if present.
  const rawBillingType = clean(body.billingType);
  const billingType: BillingType | undefined =
    rawBillingType && VALID_BILLING_TYPES.includes(rawBillingType as BillingType)
      ? (rawBillingType as BillingType)
      : undefined;

  const rawTier = clean(body.subscriptionPlan);
  const subscriptionPlan: CommercialPlanKey | undefined =
    billingType === "tier" && VALID_TIERS.includes(rawTier as CommercialPlanKey)
      ? (rawTier as CommercialPlanKey)
      : billingType === "tier"
      ? "growth" // safe default for tier
      : undefined;

  const planMonthlyCents: number | undefined =
    billingType === "custom" ? cleanNumber(body.planMonthlyCents) : undefined;

  // Presence — defaults to "local" if not supplied or invalid.
  const rawPresence = clean(body.presence);
  const presence: PresenceProfile =
    VALID_PRESENCE.includes(rawPresence as PresenceProfile)
      ? (rawPresence as PresenceProfile)
      : "local";

  // Check subdomain uniqueness before provisioning.
  try {
    const existing = await getTenantConfig(subdomain);
    if (existing) {
      return NextResponse.json(
        { error: "subdomain already in use" },
        { status: 409 }
      );
    }
  } catch {
    // getTenantConfig throws on not found; that's the happy path. Other
    // errors (Redis down, storage fail) will surface when provisionTenant runs.
  }

  const result = await provisionTenant({
    subdomain,
    siteName,
    ownerName,
    ownerEmail: clean(body.ownerEmail) || undefined,
    industry,
    template: clean(body.template) || undefined,
    productionDomain: clean(body.productionDomain) || undefined,
    adminDomain: clean(body.adminDomain) || undefined,
    billingType,
    subscriptionPlan,
    planMonthlyCents,
    presence,
  });

  await logAuditEvent({
    tenant: result.tenantId,
    action: "tenant.provision",
    targetType: "tenant",
    targetId: result.tenantId,
    actor: await getActorContext(result.tenantId),
    metadata: { steps: result.steps.map((s) => ({ key: s.key, status: s.status })) },
  });

  // Flip the originating lead to "converted" only now that a tenant record
  // actually exists (the tenant step didn't fail). Fail-soft: a workflow-store
  // hiccup must never fail the provision response.
  const leadToken = clean(body.leadToken);
  const tenantCreated = result.steps.some((s) => s.key === "tenant" && s.status !== "failed");
  if (leadToken && LEAD_TOKEN_RE.test(leadToken) && tenantCreated) {
    await setLeadWorkflowStatus(leadToken, "converted").catch(() => {});
  }

  return NextResponse.json(result);
}
