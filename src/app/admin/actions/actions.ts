"use server";

/**
 * Server action behind the portfolio bulk-approve buttons. Re-verifies
 * super-admin independently (the /admin layout gate does NOT protect a server
 * action's POST surface), then resolves each item through the governed
 * `bulkResolvePortfolioActions` → `resolveEventAction` spine. Returns per-item
 * results so the UI can report honest partial failures.
 */
import { isSuperAdmin } from "@/lib/auth";
import { getAllTenants } from "@/lib/tenants";
import { escalateEventToOwner } from "@/lib/event-actions";
import {
  bulkResolvePortfolioActions,
  type PortfolioResolveInput,
  type PortfolioResolveResult,
} from "./portfolio-actions";
import {
  draftOpportunityForClients,
  type OpportunityKind,
  type OpportunityDraftResult,
} from "./portfolio-opportunities";

const MAX_BATCH = 500;

export async function resolvePortfolioActions(
  items: PortfolioResolveInput[],
): Promise<{ ok: boolean; results: PortfolioResolveResult[] }> {
  if (!(await isSuperAdmin())) return { ok: false, results: [] };
  if (!Array.isArray(items) || items.length === 0) return { ok: true, results: [] };

  // Validate tenantIds against known DB records so client-supplied IDs cannot
  // reference tenants that don't exist. The event resolution also enforces
  // per-event tenant binding (wrong_tenant check), but filtering here makes the
  // guard explicit and avoids unnecessary work for entirely bogus IDs.
  const knownTenantIds = new Set((await getAllTenants().catch(() => [])).map((t) => t.id));

  const safe = items
    .filter(
      (i) =>
        i &&
        typeof i.tenantId === "string" &&
        typeof i.eventId === "string" &&
        knownTenantIds.has(i.tenantId),
    )
    .slice(0, MAX_BATCH);

  const results = await bulkResolvePortfolioActions(safe);
  return { ok: true, results };
}

/**
 * "Ask the client" — escalate a pending operator-approval draft to the owner's
 * queue when the operator is unsure. Re-verifies super-admin (the layout gate does
 * not protect a server action POST). Nothing publishes; the item just moves to the
 * client's "Needs you" for their decision.
 */
export async function escalatePortfolioActions(
  items: PortfolioResolveInput[],
): Promise<{ ok: boolean; results: Array<{ eventId: string; changed: boolean; reason?: string }> }> {
  if (!(await isSuperAdmin())) return { ok: false, results: [] };
  if (!Array.isArray(items) || items.length === 0) return { ok: true, results: [] };

  const knownTenantIds = new Set((await getAllTenants().catch(() => [])).map((t) => t.id));

  const safe = items
    .filter(
      (i) =>
        i &&
        typeof i.tenantId === "string" &&
        typeof i.eventId === "string" &&
        knownTenantIds.has(i.tenantId),
    )
    .slice(0, MAX_BATCH);

  const results = await Promise.all(
    safe.map(async (i) => ({ eventId: i.eventId, ...(await escalateEventToOwner(i.tenantId, i.eventId)) })),
  );
  return { ok: true, results };
}

const OPPORTUNITY_KINDS: ReadonlySet<OpportunityKind> = new Set([
  "unreplied_reviews",
  "stale_sites",
  "low_health",
]);

/**
 * "Draft these" for a portfolio opportunity. Re-verifies super-admin (the /admin
 * layout gate does NOT protect a server action's POST surface), then fans the
 * selected clients through the governed draft path — every draft lands PENDING for
 * approval, nothing is published. Returns per-client results for honest reporting.
 */
export async function draftPortfolioOpportunity(
  kind: OpportunityKind,
  tenantIds: string[],
): Promise<{ ok: boolean; results: OpportunityDraftResult[] }> {
  if (!(await isSuperAdmin())) return { ok: false, results: [] };
  if (!OPPORTUNITY_KINDS.has(kind)) return { ok: false, results: [] };
  if (!Array.isArray(tenantIds) || tenantIds.length === 0) return { ok: true, results: [] };

  const knownTenantIds = new Set((await getAllTenants().catch(() => [])).map((t) => t.id));

  const safe = tenantIds
    .filter((id) => typeof id === "string" && id.length > 0 && knownTenantIds.has(id))
    .slice(0, MAX_BATCH);

  const results = await draftOpportunityForClients(kind, safe);
  return { ok: true, results };
}
