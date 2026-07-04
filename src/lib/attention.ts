/**
 * The "needs attention" briefing: a prioritized, plain-English digest of what an
 * operator should act on, derived from the cached portfolio brain. Powers the
 * Mission Control attention panel, an operator-agent read tool, and a daily
 * Slack digest cron — one source so all three agree.
 */

import {
  buildPortfolioSnapshot,
  getPortfolioSummary,
  type PortfolioSnapshot,
} from "./portfolio";

export type AttentionSeverity = "high" | "medium" | "low";
export type AttentionKind = "launch" | "ops" | "drafts" | "stale" | "visibility";

/** A tenant with no activity in this many days is flagged as quiet. */
const STALE_TENANT_DAYS = 21;

export interface AttentionItem {
  severity: AttentionSeverity;
  kind: AttentionKind;
  tenant?: string;
  message: string;
  href?: string;
}

export interface AttentionBriefing {
  generatedAt: string;
  counts: Record<AttentionSeverity, number>;
  items: AttentionItem[];
}

const SEVERITY_ORDER: Record<AttentionSeverity, number> = { high: 0, medium: 1, low: 2 };

export function buildAttentionFromSnapshot(s: PortfolioSnapshot): AttentionBriefing {
  const items: AttentionItem[] = [];

  // Launch-blocked tenants — the highest-stakes "a client can't go live".
  for (const t of s.tenants) {
    if (t.launchStatus === "blocked") {
      items.push({
        severity: "high",
        kind: "launch",
        tenant: t.id,
        message: `Launch blocked — ${t.siteName || t.ownerName || t.id} (readiness ${t.launchScore}/100)`,
        href: `/admin/tenants/${t.id}`,
      });
    }
  }

  // Operational breakage.
  const m = s.ops.metrics;
  if (m.webhookFailures > 0)
    items.push({ severity: "high", kind: "ops", message: `${m.webhookFailures} webhook failure(s)`, href: "/admin/ops" });
  if (m.revalidationFailures > 0)
    items.push({ severity: "high", kind: "ops", message: `${m.revalidationFailures} revalidation failure(s)`, href: "/admin/ops" });
  if (m.failedAiWrites > 0)
    items.push({ severity: "medium", kind: "ops", message: `${m.failedAiWrites} failed AI write(s)`, href: "/admin/ops" });
  if (m.staleSmsApprovals > 0)
    items.push({ severity: "medium", kind: "ops", message: `${m.staleSmsApprovals} stale SMS approval(s)`, href: "/admin/ops" });
  if (m.tenantDomainDrift.length > 0)
    items.push({ severity: "medium", kind: "ops", message: `${m.tenantDomainDrift.length} tenant domain drift`, href: "/admin/ops" });

  // Quiet tenants — no activity in a while (a check-in / churn signal).
  const now = Date.now();
  for (const t of s.tenants) {
    if (t.lastActivity) {
      const days = Math.floor((now - new Date(t.lastActivity).getTime()) / 86_400_000);
      if (days >= STALE_TENANT_DAYS) {
        items.push({
          severity: "low",
          kind: "stale",
          tenant: t.id,
          message: `No activity in ${days}d — ${t.siteName || t.ownerName || t.id}`,
          href: `/admin/tenants/${t.id}`,
        });
      }
    }
  }

  // AI-search / SERP visibility gaps — the differentiated wedge. Only surfaces
  // for tenants the visibility cron has actually measured (t.visibility set).
  for (const t of s.tenants) {
    const v = t.visibility;
    if (!v) continue;
    if (v.aiProbed > 0 && v.aiPresent === 0) {
      // Invisible in AI answers is the highest-stakes visibility gap.
      items.push({
        severity: "high",
        kind: "visibility",
        tenant: t.id,
        message: `Invisible in AI answers — ${t.siteName || t.ownerName || t.id} (cited 0/${v.aiProbed})`,
        href: `/admin/tenants/${t.id}`,
      });
    } else if (v.problemCount > 0) {
      items.push({
        severity: v.problemCount >= 3 ? "medium" : "low",
        kind: "visibility",
        tenant: t.id,
        message: `${v.problemCount} visibility gap(s) — ${t.siteName || t.ownerName || t.id}`,
        href: `/admin/tenants/${t.id}`,
      });
    }
  }

  // Drafts waiting on review.
  for (const t of s.tenants) {
    if (t.draftCount > 0) {
      items.push({
        severity: t.draftCount >= 3 ? "medium" : "low",
        kind: "drafts",
        tenant: t.id,
        message: `${t.draftCount} draft(s) waiting — ${t.siteName || t.ownerName || t.id}`,
        href: "/admin/drafts",
      });
    }
  }

  items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const counts: Record<AttentionSeverity, number> = { high: 0, medium: 0, low: 0 };
  for (const it of items) counts[it.severity]++;

  return { generatedAt: s.snapshotAt, counts, items };
}

/** Build the briefing from the cached portfolio brain (recompute on miss). */
export async function buildAttentionBriefing(): Promise<AttentionBriefing> {
  const snapshot = (await getPortfolioSummary()) ?? (await buildPortfolioSnapshot());
  return buildAttentionFromSnapshot(snapshot);
}
