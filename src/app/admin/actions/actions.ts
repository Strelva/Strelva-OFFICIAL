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
