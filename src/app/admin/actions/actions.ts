"use server";

/**
 * Server action behind the portfolio bulk-approve buttons. Re-verifies
 * super-admin independently (the /admin layout gate does NOT protect a server
 * action's POST surface), then resolves each item through the governed
 * `bulkResolvePortfolioActions` → `resolveEventAction` spine. Returns per-item
 * results so the UI can report honest partial failures.
 */
import { isSuperAdmin } from "@/lib/auth";
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

  const safe = items
    .filter((i) => i && typeof i.tenantId === "string" && typeof i.eventId === "string")
    .slice(0, MAX_BATCH);

  const results = await bulkResolvePortfolioActions(safe);
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

  const safe = tenantIds
    .filter((id) => typeof id === "string" && id.length > 0)
    .slice(0, MAX_BATCH);

  const results = await draftOpportunityForClients(kind, safe);
  return { ok: true, results };
}
