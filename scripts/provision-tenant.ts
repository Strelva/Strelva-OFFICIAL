#!/usr/bin/env npx tsx
/**
 * Tenant Provisioning Script
 *
 * Usage:
 *   pnpm provision-tenant --id mysite --subdomain mysite --siteName "My Site" --ownerName "John" --industry wellness --ownerEmail john@example.com
 *
 * Or run interactively:
 *   pnpm provision-tenant
 *
 * Flags:
 *   --dry-run  Show what would be created without writing anything
 *
 * Required fields:
 *   --id, --subdomain, --siteName, --ownerName, --industry, --ownerEmail
 *
 * Optional fields:
 *   --template, --features, --customDomains, --productionDomain, --adminDomain,
 *   --bookingProvider, --bookingUrl, --ownerPhone, --referredBy
 *
 * Environment variables:
 *   VERCEL_TOKEN    If set, will create Vercel project automatically
 *   VERCEL_TEAM_ID  Team ID for Vercel (optional)
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as readline from "readline";

const TENANTS_FILE = path.join(__dirname, "..", "dev-tenants.json");

const VALID_INDUSTRIES = [
  "wellness",
  "food-brand",
  "restaurant",
  "trades",
  "professional",
  "fashion-stylist",
] as const;

const VALID_FEATURES = [
  "booking",
  "newsletter",
  "blog",
  "events",
  "shop",
  "products",
  "rewards",
  "providers",
  "instagram",
  "reviews",
] as const;

interface TenantConfig {
  id: string;
  subdomain: string;
  siteName: string;
  ownerName: string;
  industry: string;
  active: boolean;
  createdAt: string;
  template: string;
  deliveryModel: string;
  features: string[];
  customDomains: string[];
  productionDomain?: string;
  adminDomain?: string;
  subscriptionStatus: string;
  bookingProvider?: string;
  bookingUrl?: string;
  ownerEmail: string;
  ownerPhone?: string;
  referredBy?: string;
  resendDomain?: string;
  siteUrl: string;
  revalidateUrl: string;
  revalidationSecret?: string;
  branding?: {
    initials?: string;
    tagline?: string;
    bgColor?: string;
    accentColor?: string;
    fgColor?: string;
  };
}

interface ProvisionFlags {
  dryRun: boolean;
}

function generateSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

function normalizeDomain(domain: string | undefined): string | undefined {
  const normalized = domain
    ?.trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  return normalized || undefined;
}

function validateId(id: string): string | null {
  if (!/^[a-z0-9-]+$/.test(id))
    return "Tenant ID must be lowercase letters, numbers, and hyphens only";
  if (id.length < 2 || id.length > 63)
    return "Tenant ID must be between 2 and 63 characters";
  if (id.startsWith("-") || id.endsWith("-"))
    return "Tenant ID cannot start or end with a hyphen";
  return null;
}

function validateEmail(email: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return "Invalid email address format";
  return null;
}

function validateIndustry(industry: string): string | null {
  if (
    !VALID_INDUSTRIES.includes(industry as (typeof VALID_INDUSTRIES)[number])
  )
    return `Industry must be one of: ${VALID_INDUSTRIES.join(", ")}`;
  return null;
}

function validateFeatures(features: string[]): string | null {
  const invalid = features.filter(
    (f) => !VALID_FEATURES.includes(f as (typeof VALID_FEATURES)[number])
  );
  if (invalid.length > 0)
    return `Invalid features: ${invalid.join(", ")}. Valid: ${VALID_FEATURES.join(", ")}`;
  return null;
}

function validateUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol))
      return "URL must use http or https protocol";
    return null;
  } catch {
    return "Invalid URL format";
  }
}

function generateInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function shellEscape(s: string): string {
  return s.replace(/'/g, "'\\''");
}

function parseArgs(): { config: Partial<TenantConfig>; flags: ProvisionFlags } {
  const args = process.argv.slice(2);
  const config: Record<string, string> = {};
  const flags: ProvisionFlags = { dryRun: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") {
      flags.dryRun = true;
      continue;
    }
    if (args[i] === "--help" || args[i] === "-h") {
      console.log(`
Usage: pnpm provision-tenant [options]

Required:
  --id <id>              Tenant ID (lowercase, hyphens allowed)
  --subdomain <sub>      Subdomain for strelva.com
  --siteName <name>      Display name for the site
  --ownerName <name>     Business owner's name
  --industry <type>      ${VALID_INDUSTRIES.join(" | ")}
  --ownerEmail <email>   Owner's email address

Optional:
  --template <template>  Template (defaults to industry)
  --features <list>      Comma-separated: ${VALID_FEATURES.join(", ")}
  --productionDomain <d> Custom domain (e.g., mybusiness.com)
  --adminDomain <d>      Admin domain (defaults to admin.<productionDomain>)
  --customDomains <list> Additional domains (comma-separated)
  --bookingProvider <p>  Booking platform name
  --bookingUrl <url>     Booking URL
  --ownerPhone <phone>   Owner's phone number
  --referredBy <ref>     Referral source

Flags:
  --dry-run              Show what would be created without writing
  --help, -h             Show this help message

Run without arguments for interactive mode.
`);
      process.exit(0);
    }
    const key = args[i]?.replace(/^--/, "");
    const value = args[i + 1];
    if (key && value && !value.startsWith("--")) {
      config[key] = value;
      i++;
    } else if (key) {
      console.warn(`Warning: --${key} provided without a value, ignoring.`);
    }
  }

  return {
    config: {
      id: config.id,
      subdomain: config.subdomain,
      siteName: config.siteName,
      ownerName: config.ownerName,
      industry: config.industry,
      template: config.template,
      features: config.features?.split(",").map((f) => f.trim()),
      customDomains: config.customDomains
        ?.split(",")
        .map((d) => normalizeDomain(d))
        .filter(Boolean) as string[] | undefined,
      productionDomain: normalizeDomain(config.productionDomain),
      adminDomain: normalizeDomain(config.adminDomain),
      bookingProvider: config.bookingProvider,
      bookingUrl: config.bookingUrl,
      ownerEmail: config.ownerEmail,
      ownerPhone: config.ownerPhone,
      referredBy: config.referredBy,
    },
    flags,
  };
}

async function prompt(
  question: string,
  defaultValue?: string,
): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

async function getInteractiveConfig(): Promise<Partial<TenantConfig>> {
  console.log("\n--- Tenant Provisioning (interactive) ---\n");
  const id = await prompt("Tenant ID (lowercase, no spaces)");
  const subdomain = await prompt("Subdomain", id);
  const siteName = await prompt("Site Name");
  const ownerName = await prompt("Owner Name");
  const industry = await prompt(`Industry (${VALID_INDUSTRIES.join("/")})`);
  const ownerEmail = await prompt("Owner Email");
  const template = await prompt("Template", industry);
  const featuresStr = await prompt("Features (comma-separated)", "newsletter");
  const bookingProvider = await prompt("Booking Provider (optional)");
  const bookingUrl = await prompt("Booking URL (optional)");
  const ownerPhone = await prompt("Owner Phone (optional)");
  const productionDomain = normalizeDomain(
    await prompt("Website Domain (optional, e.g. yourbusiness.com)"),
  );
  const adminDomain = normalizeDomain(
    await prompt(
      "Admin Domain (optional)",
      productionDomain ? `admin.${productionDomain}` : undefined,
    ),
  );
  const referredBy = await prompt("Referred By (optional)");

  return {
    id,
    subdomain,
    siteName,
    ownerName,
    industry,
    ownerEmail,
    template,
    features: featuresStr
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean),
    bookingProvider: bookingProvider || undefined,
    bookingUrl: bookingUrl || undefined,
    ownerPhone: ownerPhone || undefined,
    productionDomain,
    adminDomain,
    referredBy: referredBy || undefined,
  };
}

function loadTenants(): TenantConfig[] {
  try {
    const raw = fs.readFileSync(TENANTS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      console.log("No existing tenants file found, starting fresh.");
      return [];
    }
    console.error(`Error reading ${TENANTS_FILE}: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

function saveTenants(tenants: TenantConfig[]): void {
  fs.writeFileSync(TENANTS_FILE, JSON.stringify(tenants, null, 2) + "\n");
}

async function createVercelProject(
  tenant: TenantConfig,
  dryRun: boolean,
): Promise<boolean> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) return false;

  const teamId = process.env.VERCEL_TEAM_ID;
  const projectName = `${tenant.id}-site`;

  if (dryRun) {
    console.log(`[dry-run] Would create Vercel project: ${projectName}`);
    return true;
  }

  console.log("\nCreating Vercel project...");
  try {
    const url = teamId
      ? `https://api.vercel.com/v9/projects?teamId=${teamId}`
      : "https://api.vercel.com/v9/projects";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: projectName, framework: "nextjs" }),
    });

    if (!response.ok) {
      console.error(
        `Failed to create Vercel project: ${await response.text()}`,
      );
      return false;
    }

    console.log(`Created Vercel project: ${projectName}`);
    return true;
  } catch (error) {
    console.error(`Error creating Vercel project: ${error}`);
    return false;
  }
}

function printSummary(tenant: TenantConfig, flags: ProvisionFlags): void {
  const prefix = flags.dryRun ? "[DRY RUN] " : "";
  const line = "=".repeat(60);

  console.log(`\n${line}`);
  console.log(`${prefix}TENANT PROVISIONING SUMMARY`);
  console.log(`${line}\n`);

  console.log(`  Tenant ID:          ${tenant.id}`);
  console.log(`  Site Name:          ${tenant.siteName}`);
  console.log(`  Owner:              ${tenant.ownerName} <${tenant.ownerEmail}>`);
  console.log(`  Industry:           ${tenant.industry}`);
  console.log(`  Template:           ${tenant.template}`);
  console.log(`  Delivery Model:     ${tenant.deliveryModel}`);
  console.log(`  Features:           ${tenant.features.join(", ") || "none"}`);
  console.log(`  Site URL:           ${tenant.siteUrl}`);
  console.log(`  Revalidate URL:     ${tenant.revalidateUrl}`);
  if (tenant.productionDomain) {
    console.log(`  Production Domain:  ${tenant.productionDomain}`);
    console.log(`  Admin Domain:       ${tenant.adminDomain || `admin.${tenant.productionDomain}`}`);
  }
  if (tenant.bookingProvider) {
    console.log(`  Booking:            ${tenant.bookingProvider} (${tenant.bookingUrl})`);
  }
  if (tenant.referredBy) {
    console.log(`  Referred By:        ${tenant.referredBy}`);
  }

  console.log(`\n--- Environment Variables for Client Site ---\n`);
  console.log(`TENANT_ID=${tenant.id}`);
  console.log(`SCAFFOLD_API_URL=https://app.strelva.com`);
  console.log(`NEXT_PUBLIC_SITE_NAME=${tenant.siteName}`);
  console.log(`NEXT_PUBLIC_SITE_URL=${tenant.siteUrl}`);
  console.log(`REVALIDATION_SECRET=${tenant.revalidationSecret}`);
  console.log(`OWNER_EMAIL=${tenant.ownerEmail}`);
  if (tenant.bookingUrl) console.log(`BOOKING_URL=${tenant.bookingUrl}`);

  console.log(`\n--- Vercel CLI Commands ---\n`);
  console.log(`vercel env add TENANT_ID production <<< '${tenant.id}'`);
  console.log(`vercel env add SCAFFOLD_API_URL production <<< 'https://app.strelva.com'`);
  console.log(`vercel env add NEXT_PUBLIC_SITE_NAME production <<< '${shellEscape(tenant.siteName)}'`);
  console.log(`vercel env add NEXT_PUBLIC_SITE_URL production <<< '${tenant.siteUrl}'`);
  console.log(`vercel env add REVALIDATION_SECRET production <<< '${tenant.revalidationSecret}'`);
  console.log(`vercel env add OWNER_EMAIL production <<< '${shellEscape(tenant.ownerEmail)}'`);
  if (tenant.productionDomain) {
    console.log(`vercel domains add ${tenant.productionDomain}`);
    console.log(`vercel domains add www.${tenant.productionDomain}`);
  }
  if (tenant.adminDomain) console.log(`vercel domains add ${tenant.adminDomain}`);

  console.log(`\n--- Next Steps ---\n`);
  console.log(`  [ ] Create client repo from custom-repo-starter/`);
  console.log(`  [ ] Set env vars on Vercel (see commands above)`);
  console.log(`  [ ] Run: pnpm seed-tenant ${tenant.id}`);
  console.log(`  [ ] Set Clerk publicMetadata: { tenants: ["${tenant.id}"] }`);
  if (tenant.productionDomain) {
    console.log(`  [ ] Configure DNS for ${tenant.productionDomain}`);
    console.log(`  [ ] Configure DNS for ${tenant.adminDomain || `admin.${tenant.productionDomain}`}`);
  }
  console.log(`  [ ] Test revalidation webhook (see PROVISIONING.md)`);
  console.log(`  [ ] Verify site renders with fallback content`);
  console.log(`  [ ] Deploy client repo and verify live content`);
  console.log(`\n${line}\n`);
}

async function main() {
  const { config: parsedConfig, flags } = parseArgs();
  let config = parsedConfig;

  if (flags.dryRun) console.log("\n[DRY RUN MODE] No files will be written.\n");

  if (!config.id || !config.subdomain || !config.siteName || !config.ownerName || !config.industry || !config.ownerEmail) {
    config = { ...config, ...(await getInteractiveConfig()) };
  }

  const required = ["id", "subdomain", "siteName", "ownerName", "industry", "ownerEmail"] as const;
  const errors: string[] = [];
  for (const field of required) {
    if (!config[field]) errors.push(`Missing required field: ${field}`);
  }
  if (config.id) {
    const e = validateId(config.id);
    if (e) errors.push(e);
  }
  if (config.ownerEmail) {
    const e = validateEmail(config.ownerEmail);
    if (e) errors.push(e);
  }
  if (config.industry) {
    const e = validateIndustry(config.industry);
    if (e) errors.push(e);
  }
  if (config.features && config.features.length > 0) {
    const e = validateFeatures(config.features);
    if (e) errors.push(e);
  }
  if (config.bookingUrl) {
    const e = validateUrl(config.bookingUrl);
    if (e) errors.push(`Booking URL: ${e}`);
  }
  if (errors.length > 0) {
    console.error("\nValidation errors:");
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  const tenants = loadTenants();
  if (tenants.find((t) => t.id === config.id)) {
    console.error(`Error: Tenant with ID "${config.id}" already exists`);
    process.exit(1);
  }

  const revalidationSecret = generateSecret();
  const productionDomain = normalizeDomain(config.productionDomain);
  const adminDomain = normalizeDomain(config.adminDomain) || (productionDomain ? `admin.${productionDomain}` : undefined);
  const siteUrl = productionDomain ? `https://${productionDomain}` : `https://${config.subdomain}.strelva.com`;
  const revalidateUrl = `${siteUrl}/api/v1/revalidate`;

  const tenant: TenantConfig = {
    id: config.id!,
    subdomain: config.subdomain!,
    siteName: config.siteName!,
    ownerName: config.ownerName!,
    industry: config.industry!,
    active: true,
    createdAt: new Date().toISOString().split("T")[0],
    template: config.template || config.industry!,
    deliveryModel: "custom_repo",
    features: config.features || ["newsletter"],
    customDomains: config.customDomains || [],
    productionDomain,
    adminDomain,
    // Set to "none" for new tenants. Billing is currently gated off
    // (isBillingEnabled() returns false when no Stripe price is configured).
    // When billing is enabled, this should be changed to "trialing" or handled
    // by the checkout flow setting it to "active".
    subscriptionStatus: "none",
    bookingProvider: config.bookingProvider,
    bookingUrl: config.bookingUrl,
    ownerEmail: config.ownerEmail!,
    ownerPhone: config.ownerPhone,
    referredBy: config.referredBy,
    siteUrl,
    revalidateUrl,
    revalidationSecret,
    branding: { initials: generateInitials(config.siteName!) },
  };

  if (!flags.dryRun) {
    tenants.push(tenant);
    saveTenants(tenants);
    console.log(`\nTenant "${tenant.siteName}" added to dev-tenants.json`);
    if (process.env.VERCEL_TOKEN) await createVercelProject(tenant, false);
  }

  printSummary(tenant, flags);
  if (flags.dryRun) console.log("[DRY RUN] No changes were made. Remove --dry-run to provision.\n");
}

main().catch(console.error);
