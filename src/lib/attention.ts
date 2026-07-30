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

  // Onboarding progress is NOT an urgent "needs you" item — a fresh client still
  // in build is the normal state, and surfacing it here as high-severity made the
  // overview cry wolf (5 identical red "launch" flags = the whole feed). Launch
  // progress already lives in the Portfolio launch-readiness meter + each Your-book
  // row's launch bar, so keep it LOW (drops out of the needs-you feed). A client
  // that's genuinely stuck surfaces on its own detail page's "Next action" banner.
  for (const t of s.tenants) {
    if (t.launchStatus === "blocked") {
      items.push({
        severity: "low",
        kind: "launch",
        tenant: t.id,
        message: `${t.siteName || t.ownerName || t.id} isn't ready to launch yet — ${t.launchScore}% there`,
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
  // Use the snapshot's own timestamp rather than wall-clock now so that a
  // cached snapshot produces consistent results regardless of when it's read.
  const snapshotMs = new Date(s.snapshotAt).getTime();
  const referenceMs = Number.isFinite(snapshotMs) ? snapshotMs : Date.now();
  for (const t of s.tenants) {
    if (t.lastActivity) {
      const days = Math.floor((referenceMs - new Date(t.lastActivity).getTime()) / 86_400_000);
      if (days >= STALE_TENANT_DAYS) {
        items.push({
          severity: "low",
          kind: "stale",
          tenant: t.id,
          message: `No activity in ${days}d: ${t.siteName || t.ownerName || t.id}`,
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
      // Invisible in AI answers is a growth OPPORTUNITY (the wedge), not an
      // urgent "needs you" action — low severity so it lives on the "Ready to
      // work" screen, not the operator's alarm feed.
      items.push({
        severity: "low",
        kind: "visibility",
        tenant: t.id,
        message: `Invisible in AI answers: ${t.siteName || t.ownerName || t.id} (cited 0/${v.aiProbed})`,
        href: `/admin/tenants/${t.id}`,
      });
    } else if (v.problemCount > 0) {
      // Visibility gaps are opportunities too — keep them off the urgent feed.
      items.push({
        severity: "low",
        kind: "visibility",
        tenant: t.id,
        message: `${v.problemCount} visibility gap(s): ${t.siteName || t.ownerName || t.id}`,
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
        message: `${t.draftCount} draft(s) waiting: ${t.siteName || t.ownerName || t.id}`,
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
