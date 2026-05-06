#!/usr/bin/env npx tsx
/**
 * Tenant Provisioning Script
 *
 * Usage:
 *   npx tsx scripts/provision-tenant.ts --id mysite --subdomain mysite --siteName "My Site" --ownerName "John" --industry wellness --ownerEmail john@example.com
 *
 * Or run interactively:
 *   npx tsx scripts/provision-tenant.ts
 *
 * Required fields:
 *   --id           Unique tenant identifier (lowercase, no spaces)
 *   --subdomain    Subdomain for the site
 *   --siteName     Display name for the site
 *   --ownerName    Owner's first name
 *   --industry     Industry type (wellness, food-brand, restaurant, trades, professional)
 *   --ownerEmail   Owner's email address
 *
 * Optional fields:
 *   --template           Template to use (defaults to industry)
 *   --features           Comma-separated features (e.g. "booking,newsletter")
 *   --customDomains      Comma-separated custom domains
 *   --productionDomain   Customer-facing domain (e.g. yourbusiness.com)
 *   --adminDomain        Dashboard domain (defaults to admin.<productionDomain>)
 *   --bookingProvider    Booking provider name
 *   --bookingUrl         Booking URL
 *   --ownerPhone         Owner's phone number
 *
 * Environment variables:
 *   VERCEL_TOKEN         If set, will create Vercel project automatically
 *   VERCEL_TEAM_ID       Team ID for Vercel (optional)
 *
 * Example:
 *   npx tsx scripts/provision-tenant.ts \
 *     --id "buffalo-barber" \
 *     --subdomain "buffalo-barber" \
 *     --siteName "Buffalo Barber Co" \
 *     --ownerName "Mike" \
 *     --industry "trades" \
 *     --ownerEmail "mike@buffalobarber.com" \
 *     --features "booking,newsletter" \
 *     --bookingProvider "Square" \
 *     --bookingUrl "https://squareup.com/appointments/book/buffalo-barber"
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as readline from 'readline';

const TENANTS_FILE = path.join(__dirname, '..', 'dev-tenants.json');

interface TenantConfig {
  id: string;
  subdomain: string;
  siteName: string;
  ownerName: string;
  industry: string;
  active: boolean;
  createdAt: string;
  template: string;
  features: string[];
  customDomains: string[];
  productionDomain?: string;
  adminDomain?: string;
  subscriptionStatus: string;
  bookingProvider?: string;
  bookingUrl?: string;
  ownerEmail: string;
  ownerPhone?: string;
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

function generateSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

function normalizeDomain(domain: string | undefined): string | undefined {
  const normalized = domain?.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return normalized || undefined;
}

function parseArgs(): Partial<TenantConfig> {
  const args = process.argv.slice(2);
  const config: Record<string, string> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '');
    const value = args[i + 1];
    if (key && value) {
      config[key] = value;
    }
  }

  return {
    id: config.id,
    subdomain: config.subdomain,
    siteName: config.siteName,
    ownerName: config.ownerName,
    industry: config.industry,
    template: config.template,
    features: config.features?.split(',').map(f => f.trim()),
    customDomains: config.customDomains?.split(',').map(d => normalizeDomain(d)).filter(Boolean) as string[] | undefined,
    productionDomain: normalizeDomain(config.productionDomain),
    adminDomain: normalizeDomain(config.adminDomain),
    bookingProvider: config.bookingProvider,
    bookingUrl: config.bookingUrl,
    ownerEmail: config.ownerEmail,
    ownerPhone: config.ownerPhone,
  };
}

async function prompt(question: string, defaultValue?: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const suffix = defaultValue ? ` [${defaultValue}]` : '';

  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

async function getInteractiveConfig(): Promise<Partial<TenantConfig>> {
  console.log('\n--- Tenant Provisioning ---\n');

  const id = await prompt('Tenant ID (lowercase, no spaces)');
  const subdomain = await prompt('Subdomain', id);
  const siteName = await prompt('Site Name');
  const ownerName = await prompt('Owner Name');
  const industry = await prompt('Industry (wellness/food-brand/restaurant/trades/professional)');
  const ownerEmail = await prompt('Owner Email');
  const template = await prompt('Template', industry);
  const featuresStr = await prompt('Features (comma-separated)', 'newsletter');
  const bookingProvider = await prompt('Booking Provider (optional)');
  const bookingUrl = await prompt('Booking URL (optional)');
  const ownerPhone = await prompt('Owner Phone (optional)');
  const productionDomain = normalizeDomain(await prompt('Website Domain (optional, e.g. yourbusiness.com)'));
  const adminDomain = normalizeDomain(await prompt(
    'Admin Domain (optional)',
    productionDomain ? `admin.${productionDomain}` : undefined
  ));

  return {
    id,
    subdomain,
    siteName,
    ownerName,
    industry,
    ownerEmail,
    template,
    features: featuresStr.split(',').map(f => f.trim()).filter(Boolean),
    bookingProvider: bookingProvider || undefined,
    bookingUrl: bookingUrl || undefined,
    ownerPhone: ownerPhone || undefined,
    productionDomain,
    adminDomain,
  };
}

function loadTenants(): TenantConfig[] {
  try {
    const data = fs.readFileSync(TENANTS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    console.error('Warning: Could not load tenants file, starting fresh');
    return [];
  }
}

function saveTenants(tenants: TenantConfig[]): void {
  fs.writeFileSync(TENANTS_FILE, JSON.stringify(tenants, null, 2) + '\n');
}

async function createVercelProject(tenant: TenantConfig): Promise<boolean> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) return false;

  console.log('\nCreating Vercel project...');

  const teamId = process.env.VERCEL_TEAM_ID;
  const projectName = `${tenant.id}-site`;

  try {
    const url = teamId
      ? `https://api.vercel.com/v9/projects?teamId=${teamId}`
      : 'https://api.vercel.com/v9/projects';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: projectName,
        framework: 'nextjs',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to create Vercel project: ${error}`);
      return false;
    }

    console.log(`Created Vercel project: ${projectName}`);
    return true;
  } catch (error) {
    console.error(`Error creating Vercel project: ${error}`);
    return false;
  }
}

async function main() {
  let config = parseArgs();

  // If required fields missing, go interactive
  if (!config.id || !config.subdomain || !config.siteName || !config.ownerName || !config.industry || !config.ownerEmail) {
    config = { ...config, ...(await getInteractiveConfig()) };
  }

  // Validate required fields
  const required = ['id', 'subdomain', 'siteName', 'ownerName', 'industry', 'ownerEmail'] as const;
  for (const field of required) {
    if (!config[field]) {
      console.error(`Error: Missing required field: ${field}`);
      process.exit(1);
    }
  }

  // Load existing tenants
  const tenants = loadTenants();

  // Check for duplicate ID
  if (tenants.find(t => t.id === config.id)) {
    console.error(`Error: Tenant with ID "${config.id}" already exists`);
    process.exit(1);
  }

  // Generate secrets and URLs
  const revalidationSecret = generateSecret();
  const productionDomain = normalizeDomain(config.productionDomain);
  const adminDomain = normalizeDomain(config.adminDomain) || (productionDomain ? `admin.${productionDomain}` : undefined);
  const siteUrl = productionDomain ? `https://${productionDomain}` : `https://${config.subdomain}.scaffoldweb.com`;
  const revalidateUrl = `${siteUrl}/api/v1/revalidate`;

  // Build full tenant config
  const tenant: TenantConfig = {
    id: config.id!,
    subdomain: config.subdomain!,
    siteName: config.siteName!,
    ownerName: config.ownerName!,
    industry: config.industry!,
    active: true,
    createdAt: new Date().toISOString().split('T')[0],
    template: config.template || config.industry!,
    features: config.features || ['newsletter'],
    customDomains: config.customDomains || [],
    productionDomain,
    adminDomain,
    subscriptionStatus: 'active',
    bookingProvider: config.bookingProvider,
    bookingUrl: config.bookingUrl,
    ownerEmail: config.ownerEmail!,
    ownerPhone: config.ownerPhone,
    siteUrl,
    revalidateUrl,
    revalidationSecret,
  };

  // Add to tenants
  tenants.push(tenant);
  saveTenants(tenants);

  console.log(`\n✓ Tenant "${tenant.siteName}" added to dev-tenants.json`);

  // Try Vercel project creation
  if (process.env.VERCEL_TOKEN) {
    await createVercelProject(tenant);
  }

  // Output env vars needed for client site
  console.log('\n--- Environment Variables for Client Site Deployment ---\n');
  console.log(`TENANT_ID=${tenant.id}`);
  console.log(`NEXT_PUBLIC_SITE_NAME=${tenant.siteName}`);
  console.log(`NEXT_PUBLIC_SITE_URL=${tenant.siteUrl}`);
  console.log(`REVALIDATE_SECRET=${revalidationSecret}`);
  console.log(`OWNER_EMAIL=${tenant.ownerEmail}`);
  if (tenant.bookingUrl) {
    console.log(`BOOKING_URL=${tenant.bookingUrl}`);
  }

  console.log('\n--- Vercel CLI Commands ---\n');
  console.log(`# Set env vars:`);
  console.log(`vercel env add TENANT_ID production <<< "${tenant.id}"`);
  console.log(`vercel env add REVALIDATE_SECRET production <<< "${revalidationSecret}"`);
  if (tenant.productionDomain) {
    console.log(`vercel domains add ${tenant.productionDomain}`);
    console.log(`vercel domains add www.${tenant.productionDomain}`);
  }
  if (tenant.adminDomain) {
    console.log(`vercel domains add ${tenant.adminDomain}`);
  }

  console.log('\n--- Done ---\n');
}

main().catch(console.error);
