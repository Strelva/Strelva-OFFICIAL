/**
 * Who an owner notice goes to: the one owner-recipient rule (Strelva Reborn §1).
 *
 *   1. a converted site: its business's trusted owner address, and nothing
 *      else (imported at conversion or set by the owner; an `owner_recipient`
 *      or `owner_email` an operator or agency edited is never used, #524);
 *   2. a site with no business: its own `owner_email` (live unconverted
 *      clients see exactly today's recipient).
 *
 * Every tenant-model owner notice (lead, weekly/monthly report, review alert,
 * review and order nudges, health drop, inquiry owner notification) asks this
 * one function instead of reading `tenant.ownerEmail` itself.
 *
 * Fail-closed: if the database is slow (bounded at 1.5 s), errors, or names
 * nobody, the notice is not sent and the reason is logged. The tenant's own
 * `owner_email` is read only when no database is configured at all (local
 * development and unit tests), where no site can have a business.
 */
import { z } from "zod";
import { workspacePorts } from "./workspace-ports";
import { isSupabaseConfigured } from "@/platform/infra/db/client";
import { isProductionEnv } from "@/platform/infra/production-guard";

export interface OwnerNoticeRecipient {
  email: string;
  name: string | null;
  /** `tenant_fallback`: no database is configured, so the tenant's own address was used. */
  from: "record" | "tenant" | "linked_tenant" | "tenant_fallback";
  workspaceId: string | null;
}

const RESOLVE_TIMEOUT_MS = 1500;
const email = z.string().trim().toLowerCase().email().max(254);

type Resolver = (tenantId: string) => Promise<{ email: string; name: string | null; from: "record" | "tenant" | "linked_tenant"; workspaceId: string | null } | null>;
/** The business record's resolver (resolve_tenant_owner_recipient), through
 * the port src/lib declares (Strelva Reborn section 7). */
const resolveTenantOwnerRecipient: Resolver = async (tenantId) =>
  (await workspacePorts().businessRecord()).resolveTenantOwnerRecipient(tenantId);
let resolver: Resolver = resolveTenantOwnerRecipient;

/** Tests may replace the database resolver. */
export function setOwnerRecipientResolver(next: Resolver | null): void {
  resolver = next ?? resolveTenantOwnerRecipient;
}

function withoutDatabase(tenant: { ownerEmail?: string | null }): OwnerNoticeRecipient | null {
  const parsed = email.safeParse(tenant.ownerEmail ?? "");
  return parsed.success ? { email: parsed.data, name: null, from: "tenant_fallback", workspaceId: null } : null;
}

function localNoDatabaseFallbackAllowed(): boolean {
  const nodeEnvironment = process.env.NODE_ENV;
  const vercelEnvironment = process.env.VERCEL_ENV?.trim().toLowerCase();
  const deployed = isProductionEnv()
    || nodeEnvironment === "production"
    || (Boolean(vercelEnvironment) && vercelEnvironment !== "development");

  return !deployed && (nodeEnvironment === "development" || nodeEnvironment === "test");
}

type NotSent = "resolver_timeout" | "resolver_error" | "no_owner_recipient" | "malformed_owner_recipient" | "owner_recipient_unavailable";

async function resolve(tenant: { id: string; ownerEmail?: string | null }): Promise<OwnerNoticeRecipient | NotSent> {
  if (resolver === resolveTenantOwnerRecipient && !isSupabaseConfigured()) {
    if (!localNoDatabaseFallbackAllowed()) return "owner_recipient_unavailable";
    return withoutDatabase(tenant) ?? "no_owner_recipient";
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const outcome = await Promise.race([
      resolver(tenant.id),
      new Promise<"timeout">((done) => { timer = setTimeout(() => done("timeout"), RESOLVE_TIMEOUT_MS); }),
    ]);
    if (outcome === "timeout") return "resolver_timeout";
    // Null: no tenant row, a converted site with no trusted address, or an
    // unconverted site with no owner_email.
    if (!outcome) return "no_owner_recipient";
    const parsed = email.safeParse(outcome.email);
    if (!parsed.success) return "malformed_owner_recipient";
    return { email: parsed.data, name: outcome.name, from: outcome.from, workspaceId: outcome.workspaceId };
  } catch {
    return "resolver_error";
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function resolveOwnerNoticeRecipient(
  tenant: { id: string; ownerEmail?: string | null },
): Promise<OwnerNoticeRecipient | null> {
  const outcome = await resolve(tenant);
  if (typeof outcome !== "string") return outcome;
  if (outcome === "owner_recipient_unavailable") {
    console.warn(`[owner-recipient] not sent: owner recipient unavailable for ${tenant.id}`);
  } else {
    console.warn(`[owner-recipient] owner notice not sent for ${tenant.id}: ${outcome}`);
  }
  return null;
}

/**
 * Whether a legacy tenant approve link (src/lib/approve-link.ts, no recipient
 * bound) may still decide. Only for a site with no business: a converted
 * site's owner decides through Needs you, whose links are bound to the
 * trusted address. Unknown (database error or timeout) is no. Without a
 * database no site has a business.
 */
export async function legacyOwnerLinkAllowed(tenant: { id: string; ownerEmail?: string | null }): Promise<boolean> {
  if (resolver === resolveTenantOwnerRecipient && !isSupabaseConfigured()) return localNoDatabaseFallbackAllowed();
  const outcome = await resolve(tenant);
  return typeof outcome !== "string" && outcome.workspaceId === null;
}

/** Convenience for senders that only need the address. */
export async function ownerNoticeEmail(tenant: { id: string; ownerEmail?: string | null }): Promise<string | null> {
  return (await resolveOwnerNoticeRecipient(tenant))?.email ?? null;
}

/** Added notice paths retain their exact legacy recipient until rollout. */
export function businessRecordReadsEnabled(): boolean {
  return process.env.STRELVA_WORKSPACE_RELEASE === "1" && process.env.STRELVA_BUSINESS_RECORD_READS === "1";
}

export async function releasedOwnerNoticeEmail(tenant: { id: string; ownerEmail?: string | null }): Promise<string | null> {
  return businessRecordReadsEnabled() ? ownerNoticeEmail(tenant) : tenant.ownerEmail || null;
}
