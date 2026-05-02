#!/usr/bin/env npx tsx
/**
 * Production Readiness Checklist for REB
 *
 * Run with: npx tsx scripts/production-checklist.ts
 *
 * Validates all external dependencies, env vars, and webhook configurations.
 */

import { createClient } from "@sanity/client";
import { Redis } from "@upstash/redis";
import Stripe from "stripe";

type Status = "ok" | "warn" | "fail" | "skip";

interface CheckResult {
  name: string;
  status: Status;
  message: string;
}

const results: CheckResult[] = [];

function log(result: CheckResult) {
  const icons = { ok: "✓", warn: "⚠", fail: "✗", skip: "○" };
  const colors = { ok: "\x1b[32m", warn: "\x1b[33m", fail: "\x1b[31m", skip: "\x1b[90m" };
  console.log(`${colors[result.status]}${icons[result.status]}\x1b[0m ${result.name}: ${result.message}`);
  results.push(result);
}

// ─────────────────────────────────────────────────────────────────────────────
// ENV VAR CHECKS
// ─────────────────────────────────────────────────────────────────────────────

function checkEnvVar(name: string, required: boolean, secret = true): boolean {
  const value = process.env[name];
  if (!value) {
    log({
      name: `ENV: ${name}`,
      status: required ? "fail" : "skip",
      message: required ? "Not set (REQUIRED)" : "Not set (optional)",
    });
    return false;
  }
  const display = secret ? `${value.slice(0, 8)}...` : value;
  log({ name: `ENV: ${name}`, status: "ok", message: `Set (${display})` });
  return true;
}

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  REB Production Readiness Checklist");
console.log("═══════════════════════════════════════════════════════════════\n");

console.log("─── Core Auth (Clerk) ───────────────────────────────────────────");
checkEnvVar("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", true);
checkEnvVar("CLERK_SECRET_KEY", true);
checkEnvVar("CLERK_WEBHOOK_SECRET", true);
checkEnvVar("SUPER_ADMIN_EMAILS", true, false);

console.log("\n─── AI Agent ────────────────────────────────────────────────────");
checkEnvVar("GOOGLE_GENERATIVE_AI_API_KEY", true);

console.log("\n─── Content Storage (Sanity) ────────────────────────────────────");
const hasSanityProject = checkEnvVar("NEXT_PUBLIC_SANITY_PROJECT_ID", true, false);
checkEnvVar("NEXT_PUBLIC_SANITY_DATASET", false, false);
const hasSanityToken = checkEnvVar("SANITY_API_TOKEN", true);
checkEnvVar("SANITY_WEBHOOK_SECRET", true);

console.log("\n─── Redis (Upstash) ─────────────────────────────────────────────");
const hasRedisUrl = checkEnvVar("UPSTASH_REDIS_REST_URL", true, false);
const hasRedisToken = checkEnvVar("UPSTASH_REDIS_REST_TOKEN", true);

console.log("\n─── Billing (Stripe) ────────────────────────────────────────────");
const hasStripeKey = checkEnvVar("STRIPE_SECRET_KEY", true);
checkEnvVar("STRIPE_SCAFFOLD_PRICE_ID", true, false);
checkEnvVar("STRIPE_WEBHOOK_SECRET", true);

console.log("\n─── Email (Resend) ──────────────────────────────────────────────");
checkEnvVar("RESEND_API_KEY", true);
checkEnvVar("RESEND_DOMAIN", true, false);

console.log("\n─── Image Upload (Vercel Blob) ──────────────────────────────────");
checkEnvVar("BLOB_READ_WRITE_TOKEN", false);

console.log("\n─── Cron & Internal API Security ────────────────────────────────");
checkEnvVar("CRON_SECRET", true);
checkEnvVar("INTERNAL_API_SECRET", true);

console.log("\n─── Notifications ───────────────────────────────────────────────");
checkEnvVar("SLACK_WEBHOOK_URL", false, false);
checkEnvVar("FOUNDER_CLERK_USER_ID", false, false);

console.log("\n─── SMS (Twilio) ────────────────────────────────────────────────");
const hasTwilioSid = checkEnvVar("TWILIO_ACCOUNT_SID", false, false);
const hasTwilioToken = checkEnvVar("TWILIO_AUTH_TOKEN", false);
checkEnvVar("TWILIO_PHONE_NUMBER", false, false);
checkEnvVar("SMS_SUGGESTIONS_ENABLED", false, false);

console.log("\n─── OAuth Connections ───────────────────────────────────────────");
checkEnvVar("GOOGLE_CLIENT_ID", false, false);
checkEnvVar("GOOGLE_CLIENT_SECRET", false);
checkEnvVar("INSTAGRAM_CLIENT_ID", false, false);
checkEnvVar("INSTAGRAM_CLIENT_SECRET", false);
checkEnvVar("CALENDLY_CLIENT_ID", false, false);
checkEnvVar("CALENDLY_CLIENT_SECRET", false);

console.log("\n─── External Webhook Secrets ────────────────────────────────────");
checkEnvVar("VEGARO_WEBHOOK_SECRET", false);
checkEnvVar("CALENDLY_WEBHOOK_SECRET", false);

console.log("\n─── Site Configuration ──────────────────────────────────────────");
checkEnvVar("NEXT_PUBLIC_SITE_URL", true, false);
checkEnvVar("CUSTOM_DOMAIN_MAP", false, false);

console.log("\n─── Google Search Console ───────────────────────────────────────");
checkEnvVar("GOOGLE_SEARCH_CONSOLE_KEY", false);

// ─────────────────────────────────────────────────────────────────────────────
// CONNECTIVITY CHECKS
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  Connectivity Checks");
console.log("═══════════════════════════════════════════════════════════════\n");

async function checkSanity() {
  if (!hasSanityProject || !hasSanityToken) {
    log({ name: "Sanity connectivity", status: "skip", message: "Missing credentials" });
    return;
  }

  try {
    const client = createClient({
      projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
      dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
      apiVersion: "2024-01-01",
      useCdn: false,
      token: process.env.SANITY_API_TOKEN,
    });

    const count = await client.fetch<number>(`count(*[_type == "tenant"])`);
    log({ name: "Sanity connectivity", status: "ok", message: `Connected (${count} tenants)` });

    // Check if dataset exists and has tenant data
    if (count === 0) {
      log({ name: "Sanity dataset health", status: "warn", message: "No tenants in dataset" });
    } else {
      log({ name: "Sanity dataset health", status: "ok", message: `${count} tenant(s) configured` });
    }
  } catch (err) {
    log({ name: "Sanity connectivity", status: "fail", message: `Error: ${(err as Error).message}` });
  }
}

async function checkRedis() {
  if (!hasRedisUrl || !hasRedisToken) {
    log({ name: "Redis connectivity", status: "skip", message: "Missing credentials" });
    return;
  }

  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    const pong = await redis.ping();
    log({ name: "Redis connectivity", status: "ok", message: `Connected (PING: ${pong})` });

    // Check for tenant cache
    const tenantCache = await redis.get("reb:tenants:all");
    if (tenantCache) {
      log({ name: "Redis tenant cache", status: "ok", message: "Cache populated" });
    } else {
      log({ name: "Redis tenant cache", status: "warn", message: "Cache empty (will populate on first request)" });
    }
  } catch (err) {
    log({ name: "Redis connectivity", status: "fail", message: `Error: ${(err as Error).message}` });
  }
}

async function checkStripe() {
  if (!hasStripeKey) {
    log({ name: "Stripe connectivity", status: "skip", message: "Missing credentials" });
    return;
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-03-31.basil" as Stripe.LatestApiVersion,
    });

    // Verify API key works
    await stripe.balance.retrieve();
    log({ name: "Stripe connectivity", status: "ok", message: "API key valid" });

    // Check price ID
    const priceId = process.env.STRIPE_SCAFFOLD_PRICE_ID;
    if (priceId) {
      try {
        const price = await stripe.prices.retrieve(priceId);
        log({
          name: "Stripe price ID",
          status: "ok",
          message: `Valid (${price.unit_amount ? `$${price.unit_amount / 100}/${price.recurring?.interval}` : "custom"})`,
        });
      } catch {
        log({ name: "Stripe price ID", status: "fail", message: "Invalid price ID" });
      }
    }
  } catch (err) {
    log({ name: "Stripe connectivity", status: "fail", message: `Error: ${(err as Error).message}` });
  }
}

async function checkTwilio() {
  if (!hasTwilioSid || !hasTwilioToken) {
    log({ name: "Twilio connectivity", status: "skip", message: "Not configured" });
    return;
  }

  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (res.ok) {
      const data = await res.json();
      log({ name: "Twilio connectivity", status: "ok", message: `Account: ${data.friendly_name}` });
    } else {
      log({ name: "Twilio connectivity", status: "fail", message: `HTTP ${res.status}` });
    }
  } catch (err) {
    log({ name: "Twilio connectivity", status: "fail", message: `Error: ${(err as Error).message}` });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOK URL REFERENCE
// ─────────────────────────────────────────────────────────────────────────────

function printWebhookUrls() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://scaffoldweb.com";

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Webhook URLs (configure in external services)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  console.log("Clerk Webhook:");
  console.log(`  URL: ${baseUrl}/api/clerk/webhook`);
  console.log("  Events: user.created");
  console.log("  Secret: Set CLERK_WEBHOOK_SECRET to match\n");

  console.log("Stripe Webhook:");
  console.log(`  URL: ${baseUrl}/api/billing/webhook`);
  console.log("  Events: checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.deleted");
  console.log("  Secret: Set STRIPE_WEBHOOK_SECRET to match\n");

  console.log("Sanity Webhook:");
  console.log(`  URL: ${baseUrl}/api/sanity/webhook`);
  console.log("  Trigger: on create/update/delete");
  console.log("  Filter: _type in ['tenant', 'hero', 'services', 'story', ...] && defined(tenant)");
  console.log("  Secret: Set SANITY_WEBHOOK_SECRET to match\n");

  console.log("Twilio SMS Webhook:");
  console.log(`  URL: ${baseUrl}/api/sms/webhook`);
  console.log("  Method: HTTP POST");
  console.log("  Note: Signature validated via TWILIO_AUTH_TOKEN\n");

  console.log("Calendly Webhook (if using):");
  console.log(`  URL: ${baseUrl}/api/webhooks/calendly`);
  console.log("  Secret: Set CALENDLY_WEBHOOK_SECRET to match\n");

  console.log("Vegaro Webhook (if using):");
  console.log(`  URL: ${baseUrl}/api/webhooks/vegaro`);
  console.log("  Secret: Set VEGARO_WEBHOOK_SECRET to match\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// VERCEL DOMAIN MAPPING
// ─────────────────────────────────────────────────────────────────────────────

function printDomainChecklist() {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Vercel Domain Mapping Checklist");
  console.log("═══════════════════════════════════════════════════════════════\n");

  console.log("For each custom domain, ensure:");
  console.log("  1. Domain is added to Vercel project (vercel domains add <domain>)");
  console.log("  2. DNS is configured (CNAME to cname.vercel-dns.com or A records)");
  console.log("  3. SSL certificate is provisioned (automatic after DNS propagation)");
  console.log("  4. Domain is in tenant config: productionDomain or customDomains[]");
  console.log("  5. For www redirects: both apex and www domains added to Vercel\n");

  const customDomainMap = process.env.CUSTOM_DOMAIN_MAP;
  if (customDomainMap) {
    try {
      const map = JSON.parse(customDomainMap);
      console.log("CUSTOM_DOMAIN_MAP entries (env var fallback):");
      for (const [domain, tenant] of Object.entries(map)) {
        console.log(`  ${domain} → ${tenant}`);
      }
    } catch {
      console.log("  (Could not parse CUSTOM_DOMAIN_MAP)");
    }
  } else {
    console.log("  CUSTOM_DOMAIN_MAP not set (custom domains resolved from tenant config)");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TENANT REVALIDATION SECRETS
// ─────────────────────────────────────────────────────────────────────────────

async function checkTenantRevalidation() {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Per-Tenant Revalidation Secrets");
  console.log("═══════════════════════════════════════════════════════════════\n");

  if (!hasSanityProject || !hasSanityToken) {
    console.log("  (Skipped - Sanity not configured)\n");
    return;
  }

  try {
    const client = createClient({
      projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
      dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
      apiVersion: "2024-01-01",
      useCdn: false,
      token: process.env.SANITY_API_TOKEN,
    });

    const tenants = await client.fetch<Array<{
      id: string;
      name: string;
      revalidateUrl?: string;
      revalidationSecret?: string;
    }>>(`*[_type == "tenant"] { id, name, revalidateUrl, revalidationSecret }`);

    for (const tenant of tenants) {
      if (tenant.revalidateUrl) {
        if (tenant.revalidationSecret) {
          log({
            name: `Tenant ${tenant.id} revalidation`,
            status: "ok",
            message: `URL set, secret configured`,
          });
        } else {
          log({
            name: `Tenant ${tenant.id} revalidation`,
            status: "warn",
            message: `URL set but NO SECRET (generate with: openssl rand -hex 32)`,
          });
        }
      } else {
        log({
          name: `Tenant ${tenant.id} revalidation`,
          status: "skip",
          message: "No revalidateUrl configured",
        });
      }
    }
  } catch (err) {
    console.log(`  Error fetching tenants: ${(err as Error).message}\n`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CRON JOBS
// ─────────────────────────────────────────────────────────────────────────────

function printCronJobs() {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Vercel Cron Jobs");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const crons = [
    { path: "/api/cron/weekly-report", schedule: "0 14 * * 1", desc: "Weekly reports (Mon 2pm UTC)" },
    { path: "/api/cron/staleness", schedule: "0 6 * * *", desc: "Content staleness check (daily 6am UTC)" },
    { path: "/api/cron/sms-suggestion", schedule: "0 15 * * 1", desc: "SMS suggestions (Mon 3pm UTC)" },
    { path: "/api/cron/search-console", schedule: "0 7 * * *", desc: "Search console sync (daily 7am UTC)" },
    { path: "/api/cron/daily-summary", schedule: "0 8 * * *", desc: "Daily summary (daily 8am UTC)" },
    { path: "/api/cron/poll-yelp", schedule: "0 6 * * *", desc: "Yelp reviews (daily 6am UTC)" },
    { path: "/api/cron/poll-google-reviews", schedule: "0 6 * * *", desc: "Google reviews (daily 6am UTC)" },
    { path: "/api/cron/poll-instagram", schedule: "0 6 * * *", desc: "Instagram feed (daily 6am UTC)" },
  ];

  console.log("Defined in vercel.json:");
  for (const cron of crons) {
    console.log(`  ${cron.path}`);
    console.log(`    Schedule: ${cron.schedule}`);
    console.log(`    Purpose: ${cron.desc}\n`);
  }

  console.log("All cron routes require Authorization: Bearer <CRON_SECRET> header.");
  console.log("Vercel automatically sends this header when CRON_SECRET is set.\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  await checkSanity();
  await checkRedis();
  await checkStripe();
  await checkTwilio();

  printWebhookUrls();
  printDomainChecklist();
  await checkTenantRevalidation();
  printCronJobs();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Summary");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const failed = results.filter(r => r.status === "fail").length;
  const warned = results.filter(r => r.status === "warn").length;
  const passed = results.filter(r => r.status === "ok").length;
  const skipped = results.filter(r => r.status === "skip").length;

  console.log(`  Passed:  ${passed}`);
  console.log(`  Warned:  ${warned}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Skipped: ${skipped}`);
  console.log();

  if (failed > 0) {
    console.log("\x1b[31m  PRODUCTION NOT READY - Fix the failed checks above.\x1b[0m\n");
    process.exit(1);
  } else if (warned > 0) {
    console.log("\x1b[33m  PRODUCTION READY (with warnings) - Review warnings above.\x1b[0m\n");
    process.exit(0);
  } else {
    console.log("\x1b[32m  PRODUCTION READY\x1b[0m\n");
    process.exit(0);
  }
}

run().catch(err => {
  console.error("Checklist failed:", err);
  process.exit(1);
});
