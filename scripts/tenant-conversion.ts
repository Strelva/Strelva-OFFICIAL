/**
 * Tenant -> business workspace conversion (Strelva Reborn item 3), and its
 * rollback (a full unlink).
 *
 * Logic only; the CLI is scripts/convert-tenant-to-workspace.ts. Readers and
 * writers are injected so a dry run is provably read-only in tests.
 */
import type { TenantConfig } from "../src/lib/types";
import {
  planTenantImport,
  planTenantUnlink,
  type ConversionAccount,
  type ConversionBilling,
  type ConversionReceipt,
  type TenantImportPayload,
  type TenantImportPlan,
  type TenantImportSource,
  type TenantLinkState,
  type TenantUnlinkCommand,
  type TenantUnlinkPreview,
  type TenantUnlinkReceipt,
} from "../src/platform/business-record";

export interface ConversionSources {
  tenant: TenantConfig | undefined;
  contact: TenantImportSource["contact"];
  settings: TenantImportSource["settings"];
  footer: TenantImportSource["footer"];
  services: TenantImportSource["services"];
  bookingConfig: { timezone: string; customised: boolean; overrides: number } | null;
  leads: NonNullable<TenantImportSource["leads"]>;
  bookings: NonNullable<TenantImportSource["bookings"]>;
  billing: ConversionBilling | null;
  account: ConversionAccount | null;
}

export interface ConversionDeps {
  read(slug: string): Promise<ConversionSources>;
  /** Null when no database is configured; reads only. */
  readLink: ((operatorEmail: string, tenantId: string) => Promise<TenantLinkState>) | null;
  convert(operatorEmail: string, payload: TenantImportPayload, plan: { commandId: string; digest: string }): Promise<ConversionReceipt>;
  log(line: string): void;
}

export interface ConversionOptions {
  slug: string;
  apply: boolean;
  /** Reverse the conversion instead of running it. */
  rollback?: boolean;
  operatorEmail?: string;
  jacobsYes: boolean;
  databaseUrl?: string;
}

export interface ConversionOutcome {
  mode: "dry-run" | "apply";
  plan: TenantImportPlan;
  link: TenantLinkState | null;
  targetWorkspaceId: string | null;
  receipt: ConversionReceipt | null;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** True only for a loopback database host. Anything else is production-like. */
export function isLocalDatabaseUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const host = new URL(value).hostname.toLowerCase();
    return LOOPBACK.has(host) || host.endsWith(".localhost");
  } catch {
    return false;
  }
}

export function parseConversionArgs(argv: string[]): ConversionOptions & { json: boolean; rollback: boolean } {
  const slug = argv.find((arg) => !arg.startsWith("--"));
  if (!slug) throw new Error("Usage: convert-tenant-to-workspace <tenant-slug> [--rollback] [--apply] [--operator-email=<email>] [--json]");
  const operator = argv.find((arg) => arg.startsWith("--operator-email="))?.slice("--operator-email=".length);
  const unknown = argv.filter((arg) => arg.startsWith("--") && !/^--(?:apply|dry-run|rollback|json|i-have-jacobs-yes|operator-email=.+)$/.test(arg));
  if (unknown.length) throw new Error(`Unknown flag(s): ${unknown.join(", ")}`);
  const apply = argv.includes("--apply");
  if (apply && argv.includes("--dry-run")) throw new Error("Choose --dry-run or --apply, not both.");
  return {
    slug, apply, rollback: argv.includes("--rollback"), operatorEmail: operator,
    jacobsYes: argv.includes("--i-have-jacobs-yes"), json: argv.includes("--json"),
  };
}

function assertApplyAllowed(options: ConversionOptions): void {
  if (!options.apply) return;
  if (!options.operatorEmail) throw new Error("--apply needs --operator-email=<a Strelva super admin>.");
  if (!isLocalDatabaseUrl(options.databaseUrl) && !options.jacobsYes) {
    throw new Error("Refusing --apply: the database is not a local loopback host. A production conversion needs Jacob's yes (--i-have-jacobs-yes).");
  }
}

function sourceFor(sources: ConversionSources): TenantImportSource {
  const tenant = sources.tenant!;
  return {
    tenant: {
      id: tenant.id,
      stableId: tenant.stableId,
      siteName: tenant.siteName,
      ownerName: tenant.ownerName,
      ownerEmail: tenant.ownerEmail,
      ownerPhone: tenant.ownerPhone,
      siteUrl: tenant.siteUrl,
      productionDomain: tenant.productionDomain,
      bookingUrl: tenant.bookingUrl,
      businessHours: tenant.businessHours,
      visibility: tenant.visibility,
      branding: tenant.branding,
    },
    contact: sources.contact,
    settings: sources.settings,
    footer: sources.footer,
    services: sources.services,
    leads: sources.leads,
    bookings: sources.bookings,
    billing: sources.billing,
    account: sources.account,
    defaultTimezone: sources.bookingConfig?.timezone,
  };
}

function describe(value: unknown): string {
  const text = JSON.stringify(value);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

export async function runTenantConversion(options: ConversionOptions, deps: ConversionDeps): Promise<ConversionOutcome> {
  const mode = options.apply ? "apply" : "dry-run";
  assertApplyAllowed(options);
  const sources = await deps.read(options.slug);
  if (!sources.tenant) throw new Error(`No tenant "${options.slug}".`);

  let link: TenantLinkState | null = null;
  let targetWorkspaceId: string | null = null;
  const siblingLinks: string[] = [];
  if (deps.readLink && options.operatorEmail) {
    link = await deps.readLink(options.operatorEmail, options.slug);
    if (!link.link && sources.account?.multiSite) {
      for (const sibling of sources.account.tenantIds.filter((id) => id !== options.slug)) {
        const state = await deps.readLink(options.operatorEmail, sibling).catch(() => null);
        if (state?.link) {
          siblingLinks.push(`${sibling} -> ${state.link.workspaceId}`);
          targetWorkspaceId ??= state.link.workspaceId;
        }
      }
    }
  }

  const plan = planTenantImport(sourceFor(sources), targetWorkspaceId ? { targetWorkspaceId } : {});
  const log = deps.log;
  log(`Tenant conversion: ${options.slug} (${mode})`);
  log(`  database: ${options.databaseUrl ? (isLocalDatabaseUrl(options.databaseUrl) ? "local" : "NOT local") : "not configured"}`);
  log(`  tenant: ${sources.tenant.siteName} stableId=${sources.tenant.stableId ?? "unknown"} active=${sources.tenant.active}`);
  log(`  link: ${!deps.readLink || !options.operatorEmail ? "unknown (needs a database and --operator-email)" : link?.link ? `already linked to ${link.link.workspaceId}; apply is a no-op` : "none"}`);
  const billing = sources.billing;
  log(`  billing: ${billing ? `${billing.billingType} status=${billing.subscriptionStatus ?? "none"} plan=${billing.subscriptionPlan ?? "none"} monthly=${billing.monthlyCents}c stripeSubscription=${billing.hasStripeSubscription}${billing.grandfathered ? " GRANDFATHERED" : ""}` : "unknown"} (recorded only; Stripe and allowances unchanged)`);
  const account = sources.account;
  log(`  account: ${account ? `${account.name} (${account.tenantIds.length} site${account.tenantIds.length === 1 ? "" : "s"})${account.multiSite ? " MULTI-SITE: all sites share one business workspace" : ""}` : "none"}`);
  if (siblingLinks.length) log(`  sibling sites already converted: ${siblingLinks.join(", ")}`);
  log(`  would ${link?.link ? "do nothing" : targetWorkspaceId ? `join business ${targetWorkspaceId} (fill only missing facts)` : `create customer business "${plan.payload.workspaceName}" with the operator as admin (no client membership, no invite, no email)`}`);
  log(`  facts (${plan.counts.facts}, source tenant_import, unverified):`);
  for (const [key, entry] of Object.entries(plan.payload.patch.facts ?? {})) log(`    ${key}: ${describe(entry?.value)}`);
  log(`  services: ${plan.counts.services}${plan.payload.patch.services?.length ? ` (${plan.payload.patch.services.map((item) => item.op === "upsert" ? item.name : item.id).join(", ")})` : ""}`);
  log(`  people: ${plan.counts.people}`);
  log(`  contacts: ${plan.counts.contacts} from ${plan.counts.leadsRead} leads and ${plan.counts.bookingsRead} bookings (dedupe on email/phone happens in the database)`);
  if (sources.bookingConfig) {
    log(`  booking availability: ${sources.bookingConfig.customised ? "custom" : "default"} weekly config, ${sources.bookingConfig.overrides} date override(s); stays in the bookings store (Reborn item 2)`);
  }
  for (const item of plan.skipped) log(`  skipped ${item.field}: ${item.reason}`);
  log(`  command ${plan.commandId} digest ${plan.digest}`);

  if (!options.apply) {
    log("Dry run: nothing was written.");
    return { mode, plan, link, targetWorkspaceId, receipt: null };
  }
  if (!sources.tenant.stableId) throw new Error("This tenant has no stable id; it was not read from Postgres.");
  const receipt = await deps.convert(options.operatorEmail!, plan.payload, { commandId: plan.commandId, digest: plan.digest });
  log(receipt.alreadyConverted
    ? `Already converted: business ${receipt.workspaceId} (receipt from ${receipt.convertedAt}). Nothing written.`
    : `Converted: business ${receipt.workspaceId}, revision ${receipt.revision}, ${receipt.counts.facts} facts, ${receipt.counts.services} services, ${receipt.counts.contacts} contacts.`);
  return { mode, plan, link, targetWorkspaceId, receipt };
}

export interface RollbackDeps {
  /** Null when no database is configured; reads only. */
  preview: ((operatorEmail: string, tenantId: string) => Promise<TenantUnlinkPreview>) | null;
  unlink(operatorEmail: string, command: TenantUnlinkCommand): Promise<TenantUnlinkReceipt>;
  log(line: string): void;
}

export interface RollbackOutcome {
  mode: "dry-run" | "apply";
  preview: TenantUnlinkPreview;
  command: TenantUnlinkCommand | null;
  receipt: TenantUnlinkReceipt | null;
}

function describeKept(plan: { workspaceKeptBecause: string[]; deleteWorkspace: boolean }): string {
  return plan.deleteWorkspace ? "delete it (the conversion created it and nothing else lives there)" : `keep it (${plan.workspaceKeptBecause.join(", ")})`;
}

/** Reverse one conversion. Dry run by default: it previews through a read-only
 * RPC and writes nothing. --apply runs one atomic unlink under the same
 * local-database refusal as the forward run. */
export async function runTenantRollback(options: ConversionOptions, deps: RollbackDeps): Promise<RollbackOutcome> {
  const mode = options.apply ? "apply" : "dry-run";
  assertApplyAllowed(options);
  if (!options.operatorEmail) throw new Error("--rollback needs --operator-email=<a Strelva super admin>; the link lives in the database.");
  if (!deps.preview) throw new Error("--rollback needs a database; none is configured.");
  const preview = await deps.preview(options.operatorEmail, options.slug);
  const log = deps.log;
  log(`Tenant rollback: ${options.slug} (${mode})`);
  log(`  database: ${options.databaseUrl ? (isLocalDatabaseUrl(options.databaseUrl) ? "local" : "NOT local") : "not configured"}`);
  const plan = preview.plan;
  if (!plan) {
    const last = preview.lastUnlink;
    log(`  link: none${last ? `; last unlinked from ${last.workspaceId} at ${last.unlinkedAt}` : "; never converted"}`);
    log("Nothing to roll back. Nothing was written.");
    return { mode, preview, command: null, receipt: null };
  }
  log(`  link: ${options.slug} -> business ${plan.workspaceId} "${plan.workspaceName}" (linked ${plan.linkedAt}, import revision ${plan.importSequence})`);
  log(`  would remove ${plan.entities.removed} imported item(s), restore ${plan.entities.restored} merged contact(s), keep ${plan.entities.kept} changed since import`);
  for (const item of plan.kept) log(`    keep ${item.entity} ${item.id}: ${item.reason}`);
  log(`  would detach ${plan.leadsDetached} lead(s) from the business (lead rows stay)`);
  if (plan.systemsAdoptedFromTenant) log(`  ${plan.systemsAdoptedFromTenant} System(s) adopted from this site stay in the business`);
  log(`  business workspace: would ${describeKept(plan)}`);
  log("  tenant row, reb: keys, /api/v1, Stripe and email: untouched");
  const command = planTenantUnlink({ tenantId: preview.tenantId, tenantStableId: preview.tenantStableId, workspaceId: plan.workspaceId, linkedAt: plan.linkedAt });
  log(`  command ${command.commandId} digest ${command.digest}`);
  if (!options.apply) {
    log("Dry run: nothing was written.");
    return { mode, preview, command, receipt: null };
  }
  const receipt = await deps.unlink(options.operatorEmail, command);
  log(receipt.alreadyUnlinked
    ? `Already unlinked: business ${receipt.workspaceId} (receipt from ${receipt.unlinkedAt}). Nothing written.`
    : `Unlinked: business ${receipt.workspaceId} ${receipt.workspaceDeleted ? "deleted" : `kept (${receipt.workspaceKeptBecause.join(", ")})`}, ${receipt.entities.removed} removed, ${receipt.entities.restored} restored, ${receipt.entities.kept} kept, ${receipt.leadsDetached} lead(s) detached.`);
  return { mode, preview, command, receipt };
}
