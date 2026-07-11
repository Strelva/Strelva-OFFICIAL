/**
 * Portfolio actions — the operator's single "clear the whole portfolio" surface.
 *
 * Aggregates every pending approval/draft across ALL clients into one queue,
 * grouped by client, so one operator managing many sites sees "12 items across
 * 4 clients waiting for you" instead of opening each dashboard. Bulk-approve
 * resolves each item through the SAME governed spine as the client dashboard
 * (`resolveEventAction`) — never a shortcut that bypasses approval — so an
 * external write that fails leaves its item pending and is reported honestly.
 *
 * Pure of auth/HTTP: the page reads `getPortfolioActions`, the server action
 * gates super-admin then calls `bulkResolvePortfolioActions`. Every read
 * degrades to empty so a transient backend blip can never 500 the overview.
 */
import { getAllTenants, isActiveTenant } from "@/lib/tenants";
import { getEvents } from "@/lib/events";
import { resolveEventAction } from "@/lib/event-actions";
import type { UnifiedEvent } from "@/lib/types";

export interface PortfolioActionItem {
  id: string;
  tenantId: string;
  /** Human label for what this is: "Review reply", "Google post", "Content update", … */
  label: string;
  title: string;
  createdAt: string;
  /** Event type + metadata, threaded so the bulk-approve queue can render the
   *  SAME before→after diff / GBP post / hours detail the client Today queue
   *  shows (`QueueEventDetail`) — so a bulk-approver reads the real change, not
   *  just the label, before approving. */
  type: UnifiedEvent["type"];
  metadata?: UnifiedEvent["metadata"];
}

export interface PortfolioActionGroup {
  tenantId: string;
  siteName: string;
  items: PortfolioActionItem[];
  /** True when the tenant's pending read hit the fetch cap, so more may be
   *  waiting than shown. Drives an honest "showing first N" marker. */
  capped: boolean;
}

export interface PortfolioActionsSnapshot {
  groups: PortfolioActionGroup[];
  totalItems: number;
  totalClients: number;
}

/**
 * The pending event kinds the portfolio queue can bulk-approve: the drafts and
 * external-write approvals an operator "makes live". Custom-build change requests
 * are excluded — they run a multi-step workflow (triage → ship), not a one-click
 * approve — and raw signal events (bookings, mentions) aren't approvals at all.
 */
export function isPortfolioApprovable(event: UnifiedEvent): boolean {
  if (event.status !== "pending") return false;
  if (event.type === "content_update") return true;
  if (event.type === "newsletter_draft") return true;
  if (event.type === "review" && event.metadata?.kind === "review_reply_draft") return true;
  return false;
}

/** What this pending item is, in plain operator language. */
export function describePortfolioAction(event: UnifiedEvent): string {
  if (event.type === "review") return "Review reply";
  if (event.type === "newsletter_draft") return "Newsletter";
  if (event.type === "content_update") {
    const kind = event.metadata?.kind;
    if (kind === "gbp_post_draft") return "Google post";
    if (kind === "gbp_hours_draft") return "Business hours";
    if (kind === "gbp_photo_draft") return "Google photo";
    if (kind === "manual_structural_change") return "Structural change";
    return "Content update";
  }
  return "Update";
}

/**
 * Every pending approval across every active client, grouped by client and
 * ordered by how much each client is waiting on (busiest first). Per-tenant and
 * per-read failures degrade to empty rather than failing the whole snapshot.
 */
/** Per-tenant pending fetch cap. When a tenant's pending read returns this many
 *  raw events, more may be waiting than we surface — flagged as `capped`. */
export const PORTFOLIO_EVENTS_LIMIT = 100;

export async function getPortfolioActions(): Promise<PortfolioActionsSnapshot> {
  const tenants = (await getAllTenants().catch(() => [])).filter(isActiveTenant);

  const groups = await Promise.all(
    tenants.map(async (t): Promise<PortfolioActionGroup> => {
      const events = await getEvents(t.id, {
        status: "pending",
        limit: PORTFOLIO_EVENTS_LIMIT,
      }).catch(() => [] as UnifiedEvent[]);
      const items = events.filter(isPortfolioApprovable).map(
        (e): PortfolioActionItem => ({
          id: e.id,
          tenantId: t.id,
          label: describePortfolioAction(e),
          title: e.title,
          createdAt: e.createdAt,
          type: e.type,
          metadata: e.metadata,
        }),
      );
      return {
        tenantId: t.id,
        siteName: t.siteName || t.id,
        items,
        capped: events.length >= PORTFOLIO_EVENTS_LIMIT,
      };
    }),
  );

  const nonEmpty = groups
    .filter((g) => g.items.length > 0)
    .sort((a, b) => b.items.length - a.items.length);
  const totalItems = nonEmpty.reduce((sum, g) => sum + g.items.length, 0);

  return { groups: nonEmpty, totalItems, totalClients: nonEmpty.length };
}

export interface PortfolioResolveInput {
  tenantId: string;
  eventId: string;
}

export interface PortfolioResolveResult {
  tenantId: string;
  eventId: string;
  changed: boolean;
  reason?: string;
}

/**
 * Approve a batch of items, each through `resolveEventAction` — the governed
 * path that performs the external write (post to Google, publish reply, apply
 * content) BEFORE flipping the event to resolved. Honest partial failure: a
 * write that fails comes back `changed:false` with the underlying reason and the
 * item stays pending, never silently marked done. Sequential so concurrent
 * external writes don't stampede an integration; the batch is a handful of items.
 */
export async function bulkResolvePortfolioActions(
  items: PortfolioResolveInput[],
): Promise<PortfolioResolveResult[]> {
  const results: PortfolioResolveResult[] = [];
  for (const item of items) {
    try {
      const res = await resolveEventAction(item.tenantId, item.eventId, "approved");
      results.push({
        tenantId: item.tenantId,
        eventId: item.eventId,
        changed: res.changed,
        reason: res.reason,
      });
    } catch (err) {
      // A single item throwing must not abort the rest of the batch.
      results.push({
        tenantId: item.tenantId,
        eventId: item.eventId,
        changed: false,
        reason: err instanceof Error ? err.message : "error",
      });
    }
  }
  return results;
}
