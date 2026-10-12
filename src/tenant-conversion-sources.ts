/** Application-edge adapter for the operator conversion engine. Reads the
 * existing tenant stores; CLI and app share these explicit source readers. */
/** Operator-only capture of the pre-workspace Redis source.
 * Never a runtime fallback, read-cutover selection or parity qualification. */
import { getRedis } from "./platform/infra/redis";
import { DEFAULT_BOOKING_CONFIG } from "./lib/booking";
import { normalizeLegacyAccount, type Account } from "./lib/accounts";
import type { BookingConfig, DateOverride } from "./lib/types";
import { getSupabase, type Row } from "./platform/infra/db/client";
import { getTenantConfig, rowToTenant } from "./lib/tenants";
import { getStoredContent } from "./lib/storage/content-store";
import { legacyGetBookings as getBookings } from "./platform/bookings/legacy-store";
import { getRedisLeads as getLeads } from "./lib/leads";
import { billingMonthlyCents, resolveBillingType } from "./lib/billing-type";
import { isGrandfathered } from "./lib/subscription";
import { PROTECTED_TENANTS } from "./lib/deprovision";
import type { ConversionSources } from "./server/tenant-conversion/engine";

export type LegacyConversionRedis=Pick<NonNullable<ReturnType<typeof getRedis>>,"get">;
export async function captureLegacyRedisConversionSettings(tenantId:string,redis:LegacyConversionRedis|null=getRedis()):
 Promise<{config:BookingConfig;overrides:DateOverride[];account:Account|null}>{
 if(!redis)throw new Error("Legacy conversion source Redis is not configured.");
 const [rawConfig,rawOverrides,rawAccountId]=await Promise.all([
  redis.get<BookingConfig>("reb:booking:config:"+tenantId),
  redis.get<DateOverride[]>("reb:booking:overrides:"+tenantId),
  redis.get<string>("account-of:"+tenantId),
 ]);
 // Only genuine misses select the existing legacy defaults. Outage/malformed
 // source fails before planning/import; no PG runtime flag or fallback used.
 const config=rawConfig??DEFAULT_BOOKING_CONFIG;
 if(!config||typeof config.timezone!=="string"||!config.timezone.trim())throw new Error("Legacy booking timezone is invalid.");
 try{new Intl.DateTimeFormat("en",{timeZone:config.timezone});}catch{throw new Error("Legacy booking timezone is invalid.");}
 if(rawOverrides!==null&&!Array.isArray(rawOverrides))throw new Error("Legacy booking overrides are invalid.");
 let account:Account|null=null;
 if(rawAccountId!==null){
  if(typeof rawAccountId!=="string"||!rawAccountId)throw new Error("Legacy account reference is invalid.");
  account=normalizeLegacyAccount(await redis.get<unknown>("account:"+rawAccountId));
  if(!account||account.id!==rawAccountId||!account.tenantIds.includes(tenantId))throw new Error("Legacy account source does not match this tenant.");
 }
 return {config,overrides:rawOverrides??[],account};
}

async function readTenant(slug: string) {
  const db = getSupabase();
  if (!db) return getTenantConfig(slug);
  const { data, error } = await db.from("tenants").select("*").eq("id", slug).maybeSingle();
  if (error) throw new Error(`Tenant read failed: ${error.message}`);
  return data ? rowToTenant(data as Row<"tenants">) : undefined;
}

export async function readConversionSources(slug: string): Promise<ConversionSources> {
  const tenant = await readTenant(slug);
  if (!tenant) return { tenant, contact: null, settings: null, footer: null, services: null, bookingConfig: null, leads: [], bookings: [], billing: null, account: null };
  const [contact, settings, footer, services, legacy, leads, bookings] = await Promise.all([
    getStoredContent("contact", slug),
    getStoredContent("settings", slug),
    getStoredContent("footer", slug),
    getStoredContent("services", slug),
    captureLegacyRedisConversionSettings(slug),
    getLeads(slug, 500),
    getBookings(slug),
  ]);
  const {config,overrides,account}=legacy;
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
      ...(account.subscription ? { subscription: {
        status: account.subscription.status?.slice(0, 40) ?? null,
        amountCents: account.subscription.amountCents ?? null,
        currentPeriodEnd: account.subscription.currentPeriodEnd?.slice(0, 40) ?? null,
        items: account.subscription.items.slice(0, 100).map((item) => ({
          tenantId: item.tenantId.slice(0, 120), label: item.label.slice(0, 120), amountCents: Math.max(0, Math.round(item.amountCents)),
        })),
      } } : {}),
    } : null,
  };
}

