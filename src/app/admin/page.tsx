import Link from "next/link";
import { Plus, CheckCircle2, Flag, UserPlus } from "lucide-react";
import { getAllTenants, isActiveTenant } from "@/lib/tenants";
import { getTenantSiteName } from "@/lib/tenant-display";
import { Panel, PanelLink, PanelCount, Vital, ClientLogo, Chip, LaunchBar, GroupLabel, Meter } from "./console";
import type { TenantConfig } from "@/lib/types";
import { getActivity, listDrafts } from "@/lib/storage";
import { getTenantLaunchReadinessResults } from "@/lib/production-readiness-rules";
import { getWeeklyBrief } from "@/lib/weekly-brief";
import { getEffectiveSubscriptionStatus, isGrandfathered } from "@/lib/subscription";
import { buildTenantLaunchReadiness, tenantHasOwnerMessage } from "@/lib/launch-readiness";
import { listThreads } from "@/lib/threads";
import { getPortfolioSummaryState, computeMrrDollars } from "@/lib/portfolio";
import { buildAttentionFromSnapshot, buildAttentionBriefing } from "@/lib/attention";
import { getDeliveryLeads } from "@/lib/access-request-delivery";
import { getAllLeadWorkflow } from "@/lib/lead-workflow";
import { listPendingDigests } from "@/lib/maintenance-digest";
import { getAtRiskTenants, type AtRiskSignal } from "@/lib/churn";
import type { DeliveryLead } from "@/lib/access-request-delivery";
import type { MaintenanceDigest } from "@/lib/maintenance-digest";
import { OperatorConsole } from "./OperatorConsole";
import { type TodayFlag } from "./TodayFeed";
import { readOperatorData } from "@/lib/operator-data";
import { DataAvailabilityNotice } from "./DataAvailabilityNotice";

export const dynamic = "force-dynamic";

/** Tenants that signed up in the last 7 days, newest first. Kept at module
 *  scope so the `Date.now()` read stays out of the component render. */
function recentSignups(tenants: TenantConfig[]) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return tenants
    .filter((t) => {
      const created = new Date(t.createdAt).getTime();
      return !Number.isNaN(created) && created >= cutoff;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)
    .map((t) => ({
      tenantId: t.id,
      siteName: t.siteName || t.id,
      ownerName: t.ownerName,
      createdAt: t.createdAt,
    }));
}

// Count "needs you" leads: received, still unworked, and not months-old junk
// (a missing/invalid submit date counts as recent so a real lead is never
// hidden). Lives outside the page component so the impure Date.now() isn't
// called during render (React purity rule / compiler).
function countUnworkedLeads(
  deliveryLeads: DeliveryLead[],
  leadWorkflow: Record<string, { status: string }>,
): number {
  const leadNagCutoff = Date.now() - 45 * 24 * 60 * 60 * 1000;
  return deliveryLeads.filter((l) => {
    if (l.deliveryStatus !== "received") return false;
    if ((leadWorkflow[l.statusToken]?.status ?? "new") !== "new") return false;
    const submitted = new Date(l.submittedAt).getTime();
    return Number.isNaN(submitted) || submitted >= leadNagCutoff;
  }).length;
}

export default async function AdminPage() {
  const ALL_TENANTS = await getAllTenants();
  const TENANTS = ALL_TENANTS.filter(isActiveTenant);
  const archivedTenantCount = ALL_TENANTS.length - TENANTS.length;

  // Per-tenant work counts + launch verdict. The Overview no longer lists
  // clients (that's /admin/clients) — it only needs the portfolio roll-ups.
  const tenantData = await Promise.all(
    TENANTS.map(async (t) => {
      const [activityRead, draftsRead, threadsRead, weeklyBriefRead, subscriptionRead] = await Promise.all([
        readOperatorData("client activity", () => getActivity(t.id), []),
        readOperatorData("client drafts", () => listDrafts(t.id), {} as Record<string, boolean>),
        readOperatorData("client conversations", () => listThreads(t.id), []),
        readOperatorData("weekly briefs", () => getWeeklyBrief(t.id), null),
        readOperatorData(
          "subscription status",
          () => getEffectiveSubscriptionStatus(t.id),
          t.subscriptionStatus ?? "none",
        ),
      ]);
      const activity = activityRead.data;
      const drafts = draftsRead.data;
      const threads = threadsRead.data;
      const weeklyBrief = weeklyBriefRead.data;
      const effectiveSubscriptionStatus = subscriptionRead.data;
      const launchReadiness = buildTenantLaunchReadiness({
        tenant: { ...t, subscriptionStatus: effectiveSubscriptionStatus },
        infrastructure: getTenantLaunchReadinessResults(t),
        activity,
        threadCount: threads.length,
        hasOwnerMessage: tenantHasOwnerMessage(threads),
        draftCount: Object.keys(drafts).length,
        hasWeeklyBrief: Boolean(weeklyBrief),
      });
      return {
        draftCount: Object.keys(drafts).length,
        launchReadiness,
        unavailableSources: [activityRead, draftsRead, threadsRead, weeklyBriefRead, subscriptionRead]
          .filter((read) => !read.available)
          .map((read) => read.source),
      };
    })
  );

  const activeTenants = TENANTS.filter((t) => t.active).length;
  // MRR counted in ONE place (computeMrrDollars) so this card and Mission
  // Control never disagree; grandfathered/founder-comp ($0) excluded.
  const mrr = computeMrrDollars(TENANTS);
  const activeSubscriptions = TENANTS.filter(
    (tenant) =>
      tenant.subscriptionStatus === "active" &&
      tenant.planOverride !== "founder_comp" &&
      !isGrandfathered(tenant.id),
  ).length;
  const grandfatheredCount = TENANTS.filter(
    (t) => isGrandfathered(t.id) || t.planOverride === "founder_comp",
  ).length;
  const totalDrafts = tenantData.reduce((sum, d) => sum + d.draftCount, 0);
  const launchReadyCount = tenantData.filter((d) => d.launchReadiness.status === "ready").length;
  const launchBlockedCount = tenantData.filter((d) => d.launchReadiness.status === "blocked").length;
  const launchWatchCount = tenantData.length - launchReadyCount - launchBlockedCount;

  // Portfolio attention flags — folded into the single "Needs you" feed rather
  // than a second adjacent list. Deep-link to the merged client detail URL.
  const portfolioState = await getPortfolioSummaryState();
  const portfolio = portfolioState.snapshot;
  const attention = portfolio ? buildAttentionFromSnapshot(portfolio) : await buildAttentionBriefing();
  const flags: TodayFlag[] = attention.items
    .filter((i) => i.severity !== "low")
    .slice(0, 6)
    .map((i) => ({
      message: i.message,
      href: (i.href ?? "/admin/clients").replace("/admin/tenants/", "/admin/clients/"),
      severity: i.severity,
    }));

  // Operator "needs you" aggregation. Each source degrades to empty.
  const [deliveryLeadsRead, pendingDigestsRead, atRiskRead] = await Promise.all([
    readOperatorData("delivery leads", getDeliveryLeads, [] as DeliveryLead[]),
    readOperatorData("maintenance drafts", listPendingDigests, [] as MaintenanceDigest[]),
    readOperatorData("retention signals", getAtRiskTenants, [] as AtRiskSignal[]),
  ]);
  const deliveryLeads = deliveryLeadsRead.data;
  const pendingDigests = pendingDigestsRead.data;
  const atRiskSignals = atRiskRead.data;

  const leadWorkflowRead = await readOperatorData(
    "lead workflow",
    () => getAllLeadWorkflow(deliveryLeads.map((l) => l.statusToken)),
    {} as Record<string, { status: string }>,
  );
  const leadWorkflow = leadWorkflowRead.data;
  // Age out stale unworked leads from the "needs you" nag so months-old junk
  // (never dismissed) stops perpetually flagging the overview. They remain on
  // the /admin/leads board to be worked or dismissed.
  const todayLeads = {
    total: deliveryLeads.length,
    unworked: countUnworkedLeads(deliveryLeads, leadWorkflow),
    recent: deliveryLeads.slice(0, 4).map((l) => ({
      businessName: l.businessName,
      location: l.location,
      submittedAt: l.submittedAt,
      isNew: l.deliveryStatus === "received",
    })),
  };

  const todayApprovals = {
    drafts: totalDrafts,
    digests: pendingDigests.length,
    total: totalDrafts + pendingDigests.length,
  };

  const tenantById = new Map(ALL_TENANTS.map((t) => [t.id, t]));
  const todayAtRisk = atRiskSignals.map((s) => ({
    tenantId: s.tenantId,
    siteName: tenantById.get(s.tenantId)?.siteName || s.tenantId,
    reasons: s.reasons,
    daysSinceActivity: s.daysSinceActivity,
    subscriptionStatus: s.subscriptionStatus,
  }));

  const todaySignups = recentSignups(TENANTS);

  // Aggregated pending approvals across every client — the count links into the
  // portfolio "clear everything" screen. Degrades to zero on any read failure.
  // "Your book" — the active clients, at a glance. Launch/last-activity from the
  // portfolio snapshot; at-risk from the churn signals; name via the shared resolver.
  const snapById = new Map((portfolio?.tenants ?? []).map((s) => [s.id, s]));
  const atRiskById = new Map(atRiskSignals.map((s) => [s.tenantId, s]));

  // Sort worst-first before slicing so the 6 shown are the ones most needing
  // attention. Mirrors the rank() logic in ClientsCrm: crit (at-risk) → warn
  // (low/missing launch score) → good (healthy, fully launched).
  function bookRank(t: TenantConfig): number {
    if (atRiskById.has(t.id)) return 0;
    const score = snapById.get(t.id)?.launchScore ?? null;
    if (score === null || score < 60) return 1;
    return 2;
  }
  const book = TENANTS.slice()
    .sort((a, b) => bookRank(a) - bookRank(b) || a.id.localeCompare(b.id))
    .slice(0, 6)
    .map((t) => ({
      id: t.id,
      name: getTenantSiteName(t.id, t),
      launchScore: snapById.get(t.id)?.launchScore ?? null,
      atRisk: atRiskById.has(t.id),
      quietDays: atRiskById.get(t.id)?.daysSinceActivity ?? null,
    }));

  const needsYouCount = todayLeads.unworked + todayApprovals.total + todayAtRisk.length;
  const unavailableSources = Array.from(new Set([
    ...tenantData.flatMap((data) => data.unavailableSources),
    ...[deliveryLeadsRead, pendingDigestsRead, atRiskRead, leadWorkflowRead]
      .filter((read) => !read.available)
      .map((read) => read.source),
    ...(portfolioState.availability === "unavailable" ? ["portfolio snapshot"] : []),
  ])).sort();

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-medium tracking-[-0.02em] text-warm-white sm:text-[30px]">
            Overview
          </h1>
          <p className="mt-1.5 text-[13px] text-gray-muted">
            <b className="font-semibold text-warm-white">{TENANTS.length}</b> active client{TENANTS.length !== 1 ? "s" : ""}
            {needsYouCount > 0 && (
              <> <span className="text-gray-faint">·</span> <span className="font-semibold text-critical">{needsYouCount} need attention</span></>
            )}
            {todayLeads.unworked === 0 && (<> <span className="text-gray-faint">·</span> leads all clear</>)}
            {archivedTenantCount ? (<> <span className="text-gray-faint">·</span> {archivedTenantCount} archived</>) : null}
          </p>
        </div>
        <Link href="/admin/onboard" className="inline-flex items-center gap-1.5 rounded-[9px] bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-on-accent transition hover:brightness-105">
          <Plus className="h-3.5 w-3.5" strokeWidth={2.4} /> New client
        </Link>
      </div>

      <DataAvailabilityNotice sources={unavailableSources} />

      {/* Vitals */}
      <div className="mb-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Vital label="Monthly revenue" value={`$${mrr.toLocaleString()}`}
          verdict={<>{activeSubscriptions} paid{grandfatheredCount ? ` · ${grandfatheredCount} grandfathered` : ""}</>} />
        <Vital label="Active clients" value={activeTenants}
          delta={todaySignups.length ? `+${todaySignups.length} wk` : undefined} deltaTone="good"
          verdict={todaySignups[0] ? <>{todaySignups[0].siteName} joined recently</> : "steady"} verdictTone={todaySignups[0] ? "good" : undefined} />
        <Vital label="Needs you" value={needsYouCount}
          delta={needsYouCount ? "act" : undefined} deltaTone="crit"
          verdict={<>{todayAtRisk.length} at-risk · {todayApprovals.total} approvals</>} verdictTone={needsYouCount ? "crit" : undefined} />
        <Vital label="Launch-ready" value={`${launchReadyCount}/${TENANTS.length}`}
          delta={launchBlockedCount ? `${launchBlockedCount} blocked` : undefined} deltaTone="warn"
          verdict={<>{launchWatchCount} watch · {launchBlockedCount} blocked</>} />
      </div>

      {/* Main grid */}
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Panel title="Needs you" trailing={<PanelCount>{needsYouCount} open</PanelCount>} bodyClassName="px-2 pb-2">
          {todayAtRisk.length > 0 && (
            <>
              <GroupLabel tone="crit" label="At risk" note={`${todayAtRisk.length} quiet · no AI use in 7 days`} />
              {todayAtRisk.map((c) => (
                <Link key={c.tenantId} href={`/admin/clients/${c.tenantId}`} className="group flex items-center gap-3 rounded-[10px] px-3 py-2.5 transition-colors hover:bg-glass-active">
                  <ClientLogo name={c.siteName} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold tracking-[-0.01em] text-warm-white">{c.siteName}</div>
                    <div className="mt-0.5 truncate text-[11.5px] text-gray-muted">Quiet {c.daysSinceActivity}d · {c.reasons[0]}</div>
                  </div>
                  <span className="shrink-0 rounded-[7px] bg-accent px-3 py-1.5 text-[11.5px] font-semibold text-on-accent opacity-80 transition group-hover:opacity-100">Reach out</span>
                </Link>
              ))}
            </>
          )}
          {todayApprovals.total > 0 && (
            <>
              <div className="mx-3 my-1.5 h-px bg-glass-border" />
              <GroupLabel tone="warn" label="Waiting for you" note={`${todayApprovals.total} to review`} />
              <Link href="/admin/actions" className="group flex items-center gap-3 rounded-[10px] px-3 py-2.5 transition-colors hover:bg-glass-active">
                <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] border border-glass-border bg-surface-raised"><CheckCircle2 className="h-4 w-4 text-warning" strokeWidth={1.7} /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-warm-white">{todayApprovals.total} change{todayApprovals.total !== 1 ? "s" : ""} ready to approve</div>
                  <div className="mt-0.5 text-[11.5px] text-gray-muted">{todayApprovals.drafts} draft{todayApprovals.drafts !== 1 ? "s" : ""}{todayApprovals.digests ? ` · ${todayApprovals.digests} maintenance` : ""}</div>
                </div>
                <span className="shrink-0 rounded-[7px] bg-accent px-3 py-1.5 text-[11.5px] font-semibold text-on-accent opacity-80 transition group-hover:opacity-100">Review</span>
              </Link>
            </>
          )}
          {flags.length > 0 && (
            <>
              <div className="mx-3 my-1.5 h-px bg-glass-border" />
              <GroupLabel tone="warn" label="Portfolio flags" note={`${flags.length} to clear`} />
              {flags.map((f, i) => (
                <Link key={i} href={f.href} className="group flex items-center gap-3 rounded-[10px] px-3 py-2.5 transition-colors hover:bg-glass-active">
                  <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] border border-glass-border bg-surface-raised"><Flag className="h-3.5 w-3.5 text-warning" strokeWidth={1.7} /></span>
                  <div className="min-w-0 flex-1 text-[12.5px] text-warm-white">{f.message}</div>
                  <span className="shrink-0 rounded-[7px] border border-gray-border px-3 py-1.5 text-[11.5px] font-medium text-gray-muted opacity-0 transition group-hover:opacity-100 group-hover:text-warm-white">View</span>
                </Link>
              ))}
            </>
          )}
          <div className="mx-3 my-1.5 h-px bg-glass-border" />
          <GroupLabel tone={todayLeads.unworked ? "warn" : "good"} label="Leads" note={todayLeads.unworked ? `${todayLeads.unworked} unworked` : undefined} />
          {todayLeads.unworked === 0 ? (
            <div className="flex items-center gap-2.5 px-3 py-2.5 text-[12.5px] text-gray-muted">
              <CheckCircle2 className="h-4 w-4 text-positive" strokeWidth={2} /> All clear — every lead worked or dismissed.
            </div>
          ) : (
            <Link href="/admin/leads" className="group flex items-center gap-3 rounded-[10px] px-3 py-2.5 transition-colors hover:bg-glass-active">
              <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] border border-glass-border bg-surface-raised"><UserPlus className="h-4 w-4 text-gray-muted" strokeWidth={1.7} /></span>
              <div className="min-w-0 flex-1"><div className="text-[13px] font-semibold text-warm-white">{todayLeads.unworked} lead{todayLeads.unworked !== 1 ? "s" : ""} to work</div><div className="mt-0.5 text-[11.5px] text-gray-muted">{todayLeads.recent[0]?.businessName}{todayLeads.recent.length > 1 ? ` + ${todayLeads.recent.length - 1} more` : ""}</div></div>
              <span className="shrink-0 rounded-[7px] bg-accent px-3 py-1.5 text-[11.5px] font-semibold text-on-accent opacity-80 transition group-hover:opacity-100">Open</span>
            </Link>
          )}
          <div className="h-1.5" />
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Portfolio" trailing={<PanelLink href="/admin/clients">Details →</PanelLink>} bodyClassName="space-y-4 px-[18px] pb-[18px] pt-0.5">
            <div>
              <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-faint">Launch readiness</p>
              <Meter segments={[
                { value: launchReadyCount, tone: "good", label: "ready" },
                { value: launchWatchCount, tone: "warn", label: "watch" },
                { value: launchBlockedCount, tone: "crit", label: "blocked" },
              ]} />
            </div>
            <div className="h-px bg-glass-border" />
            <div>
              <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-faint">Client health</p>
              <Meter segments={[
                { value: TENANTS.length - todayAtRisk.length, tone: "good", label: "healthy" },
                { value: todayAtRisk.length, tone: "crit", label: "at risk" },
              ]} />
            </div>
            <div className="flex items-baseline justify-between border-t border-glass-border pt-3 text-[12px]">
              <span className="text-gray-muted">Monthly revenue</span>
              <span className="font-display text-[15px] font-medium tracking-[-0.01em] text-warm-white">${mrr.toLocaleString()}<span className="ml-1 text-[11px] text-gray-faint">/ {activeSubscriptions} paid</span></span>
            </div>
          </Panel>

          <Panel title="Your book" trailing={<PanelLink href="/admin/clients">All clients →</PanelLink>} bodyClassName="px-2 pb-2.5">
            {book.map((c) => (
              <Link key={c.id} href={`/admin/clients/${c.id}`} className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 transition-colors hover:bg-glass-active">
                <ClientLogo name={c.name} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-warm-white"><span className="truncate">{c.name}</span>{c.atRisk && <Chip tone="crit">at risk</Chip>}</div>
                  <div className="mt-0.5 text-[11.5px] text-gray-muted">{c.quietDays != null ? `quiet ${c.quietDays}d` : "active"}</div>
                </div>
                {c.launchScore != null && <div className="w-[52px] shrink-0"><LaunchBar pct={c.launchScore} /></div>}
              </Link>
            ))}
            {book.length === 0 && <div className="px-3 py-4 text-[12.5px] text-gray-faint">No active clients yet.</div>}
          </Panel>
          {/* "Recent signups" was a third copy of the same clients already in
              "Your book" (and named on the Active-clients vital) — removed so no
              entity is listed three times on one screen. */}
        </div>
      </div>

      {/* Mission Control sits BELOW the queue and is collapsed by default, so the
          operator's real work ("Needs you") leads the page instead of an empty
          prompt box. */}
      <details className="group mt-6 rounded-2xl border border-glass-border bg-glass">
        <summary className="flex cursor-pointer list-none items-center justify-between px-[18px] py-3.5 text-[13px] text-warm-white [&::-webkit-details-marker]:hidden">
          <span className="font-semibold">Mission Control</span>
          <span className="text-[12px] text-gray-muted group-open:hidden">Ask about the portfolio →</span>
          <span className="hidden text-[12px] text-gray-muted group-open:inline">Collapse</span>
        </summary>
        <div className="border-t border-glass-border p-4"><OperatorConsole /></div>
      </details>

      <div className="mt-6 rounded-2xl border border-warning/20 bg-warning/10 p-4 lg:hidden">
        <p className="text-[13px] font-medium text-warning">Admin works best on desktop</p>
        <p className="mt-1 text-[11.5px] leading-5 text-warm-white/70">Tenant triage, invites, and domain checks need the full-width admin views.</p>
      </div>
    </div>
  );
}
