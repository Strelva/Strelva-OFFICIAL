#!/usr/bin/env npx tsx
/**
 * Convert one managed tenant into a customer business workspace.
 *
 *   npx tsx scripts/convert-tenant-to-workspace.ts <slug>                                   # dry run (default)
 *   npx tsx scripts/convert-tenant-to-workspace.ts <slug> --operator-email=<super admin>    # dry run + link state
 *   npx tsx scripts/convert-tenant-to-workspace.ts <slug> --apply --operator-email=<email>  # local database only
 *
 * A dry run reads the tenant, content, booking config, leads, bookings and
 * account through the existing src/lib readers and prints the exact plan. It
 * writes nothing: no Postgres, no Redis (the tenant row is read directly so the
 * tenant-list cache is not refreshed), no email.
 *
 * --apply writes through one atomic RPC (convert_tenant_to_business). It
 * refuses unless SUPABASE_URL is a loopback host, or --i-have-jacobs-yes is
 * passed: a production conversion is Jacob's call. It never changes the tenant
 * row, `reb:` keys, /api/v1, memberships, Stripe, and never invites anyone.
 * Reruns are no-ops; a failed run left nothing behind and can simply rerun.
 */
import { getSupabase, type Row } from "../src/lib/db/client";
import { getTenantConfig, rowToTenant } from "../src/lib/tenants";
import { getStoredContent } from "../src/lib/storage/content-store";
import { getBookingConfig, getBookings, getDateOverrides } from "../src/lib/storage/booking-store";
import { DEFAULT_BOOKING_CONFIG } from "../src/lib/booking";
import { getLeads } from "../src/lib/leads";
import { getAccountForTenant } from "../src/lib/accounts";
import { billingMonthlyCents, resolveBillingType } from "../src/lib/billing-type";
import { isGrandfathered } from "../src/lib/subscription";
import { PROTECTED_TENANTS } from "../src/lib/deprovision";
import { convertTenantToBusiness, readTenantWorkspaceLink } from "../src/platform/business-record";
import { parseConversionArgs, runTenantConversion, type ConversionSources } from "./tenant-conversion";

async function readTenant(slug: string) {
  const db = getSupabase();
  if (!db) return getTenantConfig(slug);
  const { data, error } = await db.from("tenants").select("*").eq("id", slug).maybeSingle();
  if (error) throw new Error(`Tenant read failed: ${error.message}`);
  return data ? rowToTenant(data as Row<"tenants">) : undefined;
}

async function read(slug: string): Promise<ConversionSources> {
  const tenant = await readTenant(slug);
  if (!tenant) return { tenant, contact: null, settings: null, footer: null, services: null, bookingConfig: null, leads: [], bookings: [], billing: null, account: null };
  const [contact, settings, footer, services, config, overrides, leads, bookings, account] = await Promise.all([
    getStoredContent("contact", slug),
    getStoredContent("settings", slug),
    getStoredContent("footer", slug),
    getStoredContent("services", slug),
    getBookingConfig(slug),
    getDateOverrides(slug),
    getLeads(slug, 500),
    getBookings(slug),
    getAccountForTenant(slug),
  ]);
  return {
    tenant,
    contact,
    settings,
    footer,
    services: services?.services ?? null,
    bookingConfig: {
      timezone: config.timezone,
      customised: JSON.stringify(config) !== JSON.stringify(DEFAULT_BOOKING_CONFIG),
      overrides: overrides.length,
    },
    leads,
    bookings,
    billing: {
      billingType: resolveBillingType(tenant),
      subscriptionStatus: tenant.subscriptionStatus ?? null,
      subscriptionPlan: tenant.subscriptionPlan ?? null,
      monthlyCents: billingMonthlyCents(tenant),
      hasStripeSubscription: Boolean(tenant.stripeSubscriptionId),
      grandfathered: PROTECTED_TENANTS.has(slug) || isGrandfathered(slug),
    },
    account: account ? {
      id: account.id,
      name: account.name.slice(0, 120),
      tenantIds: account.tenantIds.slice(0, 100),
      multiSite: account.tenantIds.length > 1,
    } : null,
  };
}

async function main() {
  const options = parseConversionArgs(process.argv.slice(2));
  const hasDb = Boolean(getSupabase());
  const outcome = await runTenantConversion({ ...options, databaseUrl: process.env.SUPABASE_URL }, {
    read,
    readLink: hasDb ? readTenantWorkspaceLink : null,
    convert: convertTenantToBusiness,
    log: options.json ? () => undefined : (line) => console.log(line),
  });
  if (options.json) console.log(JSON.stringify(outcome, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
