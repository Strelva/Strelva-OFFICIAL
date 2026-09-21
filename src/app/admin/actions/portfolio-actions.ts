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
 * gates super-admin then calls `bulkResolvePortfolioActions`. A transient read
 * failure keeps the overview usable, but is carried as an explicit incomplete
 * source so an empty result can never masquerade as a verified clear queue.
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

export type PortfolioActionsAvailability = "complete" | "partial" | "unavailable";

/** A source that was not read successfully while building the snapshot. */
export interface PortfolioActionsIncompleteRead {
  /** Stable source identity for the operator UI and future telemetry. */
  source: "client_directory" | "pending_approvals";
  /** Present for a tenant-scoped pending-approval read. */
  tenantId?: string;
  /** Safe display identity captured before the failed tenant-scoped read. */
  siteName?: string;
  /** A bounded read can be successful yet still leave unseen pending events. */
  capped?: boolean;
}

export interface PortfolioActionsSnapshot {
  groups: PortfolioActionGroup[];
  totalItems: number;
  totalClients: number;
  /** `complete` is the only state in which an empty queue means clear. */
  availability: PortfolioActionsAvailability;
  /** Explicit source/tenant identity for reads that could not be verified. */
  incomplete: PortfolioActionsIncompleteRead[];
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
 * ordered by how much each client is waiting on (busiest first). Successful
 * tenants remain usable when another tenant fails, while every failed source is
 * carried in `incomplete` so the caller can make the uncertainty visible.
 */
/** Per-tenant pending fetch cap. When a tenant's pending read returns this many
 *  raw events, more may be waiting than we surface — flagged as `capped`. */
export const PORTFOLIO_EVENTS_LIMIT = 100;

export async function getPortfolioActions(): Promise<PortfolioActionsSnapshot> {
  let tenants: Awaited<ReturnType<typeof getAllTenants>>;
  try {
    tenants = (await getAllTenants()).filter(isActiveTenant);
  } catch (error) {
    // Without the directory we do not know which clients exist, so this is a
    // fully unavailable snapshot rather than a verified empty portfolio.
    console.error(
      "[portfolio-actions] client directory unavailable:",
      error instanceof Error ? error.message : error,
    );
    return {
      groups: [],
      totalItems: 0,
      totalClients: 0,
      availability: "unavailable",
      incomplete: [{ source: "client_directory" }],
    };
  }

  const reads = await Promise.all(
    tenants.map(async (t) => {
      const siteName = t.siteName || t.id;
      try {
        const events = await getEvents(t.id, {
          status: "pending",
          limit: PORTFOLIO_EVENTS_LIMIT,
        });
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
          group: {
            tenantId: t.id,
            siteName,
            items,
            capped: events.length >= PORTFOLIO_EVENTS_LIMIT,
          } satisfies PortfolioActionGroup,
          incomplete:
            events.length >= PORTFOLIO_EVENTS_LIMIT
              ? {
                  source: "pending_approvals" as const,
                  tenantId: t.id,
                  siteName,
                  capped: true,
                }
              : null,
        };
      } catch (error) {
        // Keep other clients visible, but do not present this tenant as clear.
        console.error(
          `[portfolio-actions] pending approvals unavailable for ${t.id}:`,
          error instanceof Error ? error.message : error,
        );
        return {
          group: null,
          incomplete: {
            source: "pending_approvals" as const,
            tenantId: t.id,
            siteName,
          },
        };
      }
    }),
  );

  const incomplete = reads.flatMap((read) => (read.incomplete ? [read.incomplete] : []));
  const groups = reads.flatMap((read) => (read.group ? [read.group] : []));

  const nonEmpty = groups
    .filter((g) => g.items.length > 0)
    .sort((a, b) => b.items.length - a.items.length);
  const totalItems = nonEmpty.reduce((sum, g) => sum + g.items.length, 0);

  return {
    groups: nonEmpty,
    totalItems,
    totalClients: nonEmpty.length,
    availability: incomplete.length > 0 ? "partial" : "complete",
    incomplete,
  };
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
