/**
 * Who an owner notice goes to: the one owner-recipient rule (Strelva Reborn §1).
 *
 *   1. the linked business record's owner contact (`owner_recipient` fact);
 *   2. this tenant's own `owner_email` (every unconverted tenant lands here,
 *      so live clients see exactly today's recipient);
 *   3. the business's earliest linked site's `owner_email`.
 *
 * Every tenant-model owner notice (lead, weekly/monthly report, review alert,
 * review and order nudges, health drop, inquiry owner notification) asks this
 * one function instead of reading `tenant.ownerEmail` itself.
 *
 * Fail-soft by design: if the database is unconfigured, slow (bounded at
 * 1.5 s) or the migration is not applied, the notice falls back to the
 * tenant's own `owner_email`, which is the pre-rule behavior. A notice is never
 * dropped because the resolver failed.
 */
import { z } from "zod";
import { workspacePorts } from "./workspace-ports";

export interface OwnerNoticeRecipient {
  email: string;
  name: string | null;
  /** `tenant_fallback` means the rule could not be read and the tenant's own address was used. */
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

function fallback(tenant: { ownerEmail?: string | null }): OwnerNoticeRecipient | null {
  const parsed = email.safeParse(tenant.ownerEmail ?? "");
  return parsed.success ? { email: parsed.data, name: null, from: "tenant_fallback", workspaceId: null } : null;
}

export async function resolveOwnerNoticeRecipient(
  tenant: { id: string; ownerEmail?: string | null },
): Promise<OwnerNoticeRecipient | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const outcome = await Promise.race([
      resolver(tenant.id),
      new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), RESOLVE_TIMEOUT_MS); }),
    ]);
    if (outcome === "timeout") return fallback(tenant);
    // Null: no tenant row or no address on record. The caller's own tenant
    // config is then the only source (it is the same row when it exists).
    if (!outcome) return fallback(tenant);
    const parsed = email.safeParse(outcome.email);
    if (!parsed.success) return fallback(tenant);
    return { email: parsed.data, name: outcome.name, from: outcome.from, workspaceId: outcome.workspaceId };
  } catch {
    return fallback(tenant);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
