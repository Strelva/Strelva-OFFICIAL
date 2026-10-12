"use server";

/** Support may route work to its owner, but never author or approve it. */
import { isSuperAdmin } from "@/platform/infra/auth";
import { auditOperatorDecision, operatorStillActive, verifiedOperator } from "@/lib/operator-decisions";
import { getAllTenants } from "@/lib/tenants";
import { escalateEventToOwner } from "@/lib/event-actions";
import {
  type PortfolioResolveInput,
  type PortfolioResolveResult,
} from "./portfolio-actions";
import {
  type OpportunityKind,
  type OpportunityDraftResult,
} from "./portfolio-opportunities";

const MAX_BATCH = 500;

export async function resolvePortfolioActions(
  items: PortfolioResolveInput[],
): Promise<{ ok: boolean; results: PortfolioResolveResult[] }> {
  const operator = await verifiedOperator();
  if (!operator) return { ok: false, results: [] };
  if (!Array.isArray(items) || items.length === 0) return { ok: true, results: [] };

  return { ok: false, results: items.slice(0, MAX_BATCH).filter(item => item && typeof item.tenantId === "string" && typeof item.eventId === "string")
    .map(item => ({ ...item, changed: false, reason: "platform_content_authority_retired" })) };
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
  const operator = await verifiedOperator();
  if (!operator) return { ok: false, results: [] };
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

  // An escalation is audited like an approval: no attempt row, no change.
  const results = await Promise.all(
    safe.map(async (i) => {
      const audit = { operator, tenantId: i.tenantId, eventId: i.eventId, action: "portfolio.draft.escalate" };
      try {
        await auditOperatorDecision({ ...audit, phase: "attempt" });
      } catch {
        return { eventId: i.eventId, changed: false, reason: "audit_unavailable" };
      }
      const result = await operatorStillActive(operator)
        ? await escalateEventToOwner(i.tenantId, i.eventId)
        : { changed: false, reason: "operator_access_changed" };
      await auditOperatorDecision({ ...audit, phase: "result", detail: { changed: result.changed, reason: result.reason ?? null } })
        .catch(() => console.error(`[admin/actions] audit result row failed for ${i.eventId}; its attempt row stands.`));
      return { eventId: i.eventId, ...result };
    }),
  );
  return { ok: true, results };
}

/** Retired compatibility action. Platform support never authors client work. */
export async function draftPortfolioOpportunity(
  _kind: OpportunityKind,
  tenantIds: string[],
): Promise<{ ok: boolean; results: OpportunityDraftResult[] }> {
  if (!await isSuperAdmin()) return { ok: false, results: [] };
  return { ok: false, results: Array.isArray(tenantIds) ? tenantIds.slice(0, MAX_BATCH).filter(id => typeof id === "string")
    .map(tenantId => ({ tenantId, drafted: false, reason: "platform_content_authority_retired" })) : [] };
}
