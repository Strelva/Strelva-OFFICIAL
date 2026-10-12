import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
import { tenantAgencyWorkspace } from "@/experience/operator/agency-entry";
import { authorizeAdminOperatorRead } from "@/platform/operator-read-audit/admission";
import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/platform/infra/auth";
import { getTenantConfig } from "@/lib/tenants";
import { getClickCounts, getActivity, listDrafts, getDailyMetrics } from "@/lib/storage";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { getScanSummary, getScanHistory } from "@/lib/scan-store";
import { listTenantDomainClaims, serializeDomainClaim } from "@/lib/domains";
import { getLatestSnapshots, diffSnapshots } from "@/lib/visibility/snapshots";
import { diagnoseVisibility, summarizeVisibility } from "@/lib/visibility/diagnose";
import { getReviews } from "@/lib/reviews";
import { getAdminReviewIntelligence } from "@/lib/reviews/intelligence";
import { getTenantCrm } from "@/lib/tenant-crm";
import { getAccountForTenant } from "@/lib/accounts";
import { getSuggestions, operatorSuggestions } from "@/lib/suggestions";
import { getVercelProjectStatus } from "@/lib/vercel";
import { getTenantAtRisk, type AtRiskSignal } from "@/lib/churn";
import { getTenantLaunchReadinessResults } from "@/lib/production-readiness-rules";
import { resolveBillingType } from "@/lib/billing-type";
import { getGoal } from "@/lib/goals";
import { GoalEditor } from "./GoalEditor";
import { getTenantPublicUrl, getTenantDashboardFallbackUrl } from "@/lib/tenant-urls";
import { getReportCadence } from "@/lib/report-cadence";
import { getReplyVoice } from "@/lib/reviews/reply-voice";
import { getContentAutonomy } from "@/lib/content-autonomy";
import { getClientEmailOverride } from "@/platform/infra/email/client-override";
import { emailSendingPaused } from "@/platform/infra/email/enabled";
import { TenantEditor } from "./TenantEditor";
import { OperatorControlsPanel } from "./OperatorControlsPanel";
import { ReleaseFlagsPanel } from "./ReleaseFlagsPanel";
import { OwnerInvitationsPanel } from "./OwnerInvitationsPanel";
import { loadOwnerInvitations } from "@/platform/owner-entry/operator-invitations";
import { SiteScan } from "./SiteScan";
import { ReviewIntelPanel } from "./ReviewIntelPanel";
import { DomainManager } from "./DomainManager";
import { DomainView } from "./DomainView";
import { loadDomainView } from "@/platform/operator-queue/domain-view-loader";
import { VisibilityPanel } from "./VisibilityPanel";
import { ClientCrmSections } from "./ClientCrmSections";
import { OperatorOpportunities } from "./OperatorOpportunities";
import { DeploymentStatus } from "./DeploymentStatus";
import { BillingPanel } from "./BillingPanel";
import { IntegrationsPanel } from "./IntegrationsPanel";
import { getTenantSiteName } from "@/lib/tenant-display";
import { getClientLeadsForOperator } from "@/lib/client-leads";
import { ClientLeadList } from "../../client-leads/ClientLeadList";
import { Panel, PanelLink } from "../../console";
import { BusinessEffortForSite } from "../../work/BusinessEffort";
import { loadBusinessEffort } from "../../work/effort-data";
import { StHead, StPage, StSection, StTextButton, StState, StRows, StRow } from "@/components/ui/strelva/Kit";
import styles from "@/experience/operations/operator-client.module.css";

import { createClientReadHealth, domainEvidenceIssue, scanEvidenceIssue } from "./client-read-health";

export const dynamic = "force-dynamic";

function Pulse({ label, value, sub, series }: { label: string; value: string | number; sub?: string; series?: number[] }) {
  return (
    <div className="flex flex-col rounded-2xl border border-glass-border bg-glass p-4">
      <p className="text-[11px] text-gray-muted">{label}</p>
      <p className="mt-1.5 font-display text-[23px] font-medium tracking-[-0.02em] text-warm-white">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-faint">{sub}</p>}
      {series && series.length > 1 && (
        <div className="mt-2.5">
          <Sparkline series={series} />
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3.5">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gray-faint pt-1">{label}</p>
      {children}
    </section>
  );
}

function ago(iso: string | null): string {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Defense in depth: re-check super-admin here even though the layout already
  // checked. The layout gate does NOT protect a page's data-fetching path if
  // the layout's redirect is somehow bypassed (e.g. direct RSC fetch, test
  // harness). This guard is not redundant — it is necessary. Redirect to
  // /sign-in rather than "/" to avoid a loop on the bare admin host where "/"
  // rewrites back to /admin.
  if (!(await isSuperAdmin())) redirect("/sign-in");
  await authorizeAdminOperatorRead("admin.clients.read");

  const { id } = await params;
  const tenant = await getTenantConfig(id);
  if (!tenant) redirect(`/admin/tenant-cleanup/${encodeURIComponent(id)}`);

  const noRisk: AtRiskSignal = {
    tenantId: id,
    atRisk: false,
    reasons: [],
    daysSinceActivity: null,
    engagement7d: 0,
    subscriptionStatus: null,
  };

  const readHealth = createClientReadHealth();

  // loadBusinessEffort never throws; it reports disabled/denied/unavailable states.
  const effortLoad = loadBusinessEffort();
  const domainViewLoad = loadDomainView([{ tenantId: id, label: `${tenant.siteName || id} website` }]).catch(readHealth.fallback("Domain health", null));
  const ownerInvitationsLoad = loadOwnerInvitations(id);
  const [pageViews, bookingClicks, drafts, activity, lastScan, domainClaims, scanHistory, visSnapshots, reviews, crm, atRisk, dailyMetrics, suggestions, vercelStatus, goal, account, reportCadence, replyVoice, contentAutonomy, clientEmailOverride, clientLeads] =
    await Promise.all([
      getClickCounts("page-view", id).catch(readHealth.fallback("Page visits", { thisWeek: 0, total: 0 })),
      getClickCounts("booking-click", id).catch(readHealth.fallback("Booking clicks", { thisWeek: 0, total: 0 })),
      listDrafts(id).catch(readHealth.fallback("Content drafts", {} as Record<string, boolean>)),
      getActivity(id).catch(readHealth.fallback("Activity", [])),
      getScanSummary(id, { requireStore: true }).catch(readHealth.fallback("Site scan", null)),
      listTenantDomainClaims(id).catch(readHealth.fallback("Domain claims", [])),
      getScanHistory(id, { requireStore: true }).catch(readHealth.fallback("Scan history", [])),
      getLatestSnapshots(id, 2).catch(readHealth.fallback("Visibility", [])),
      getReviews(id).catch(readHealth.fallback("Reviews", [])),
      getTenantCrm(id).catch(readHealth.fallback("Notes and CRM", null)),
      getTenantAtRisk(id).catch(readHealth.fallback("Subscription risk", noRisk)),
      getDailyMetrics(id, 14).catch(readHealth.fallback("Daily metrics", [])),
      getSuggestions(id).catch(readHealth.fallback("Opportunities", [])),
      getVercelProjectStatus(`${id}-site`).catch(readHealth.fallback("Deployment status", null)),
      getGoal(id).catch(readHealth.fallback("Goal", null)),
      getAccountForTenant(id).catch(readHealth.fallback("Account", null)),
      getReportCadence(id).catch(readHealth.fallback("Report cadence", "monthly" as const)),
      getReplyVoice(id).catch(readHealth.fallback("Reply voice", { mode: "approve" as const, guidance: "", templates: [], updatedAt: null })),
      getContentAutonomy(id).catch(readHealth.fallback("Content controls", "approve" as const)),
      getClientEmailOverride(id).catch(readHealth.fallback("Email controls", "inherit" as const)),
      getClientLeadsForOperator({ tenant: id, limit: 5 }).catch(readHealth.fallback("Inquiries", null)),
    ]);
  const effort = await effortLoad;
  const ownerInvitations = await ownerInvitationsLoad;
  const domainView = await domainViewLoad;
  if (effort.state === "unavailable") readHealth.unavailable("Human effort");
  if (ownerInvitations?.kind === "unavailable") readHealth.unavailable("Owner invitations");
  if (!domainView) readHealth.unavailable("Domain health");
  if (!clientLeads || clientLeads.postgres === "unavailable" || clientLeads.redis === "unavailable"
    || (clientLeads.postgres !== "ok" && clientLeads.redis !== "ok")) readHealth.unavailable("Inquiries");
  if (!vercelStatus?.ok) readHealth.unavailable("Deployment status");
  const opportunities = operatorSuggestions(suggestions);
  const deployStatus = vercelStatus && vercelStatus.ok ? vercelStatus.data : null;

  const latestVis = visSnapshots[0] ?? null;
  const visSummary = latestVis ? summarizeVisibility(latestVis) : null;
  const visFindings = latestVis ? diagnoseVisibility(latestVis) : [];
  const visDiff = latestVis ? diffSnapshots(visSnapshots[1] ?? null, latestVis) : null;
  const reviewIntel = getAdminReviewIntelligence(reviews);

  // Fuse the panels' self-verdicts into ONE ranked "next action for this client".
  // Priority: churn > launch-blocked > failing site health > reviews waiting.
  // Known actions retain their priority; unavailable evidence is appended below.
  // Capture the actual failing checks (their names), not just a count — the
  // banner enumerates them so "before go-live" is actionable, not a mystery.
  let launchFailItems: string[] = [];
  try {
    launchFailItems = getTenantLaunchReadinessResults(tenant)
      .filter((r) => r.status === "fail")
      .map((r) => r.name);
  } catch {
    readHealth.unavailable("Launch readiness");
    launchFailItems = [];
  }
  const launchFails = launchFailItems.length;
  const grade = lastScan?.grade ?? null;
  const needsReply = reviewIntel.needsResponse.length;
  const scanIssue = readHealth.hasUnavailable("Site scan") ? null : scanEvidenceIssue(lastScan);
  const evidenceDetail = [readHealth.detail(), scanIssue, domainEvidenceIssue(domainView)].filter(Boolean).join(" ");

  // A brand-new client has no traffic/activity/drafts yet, so leading the top row
  // with weekly-engagement KPIs shows four zeros. For a fresh client, lead with
  // the things that ARE knowable + relevant (health, reviews, setup, plan).
  const isFreshClient =
    !["Page visits", "Activity", "Content drafts"].some(readHealth.hasUnavailable) &&
    pageViews.total === 0 && activity.length === 0 && Object.keys(drafts).length === 0;
  const planPulse =
    tenant.subscriptionStatus === "active"
      ? "Active"
      : tenant.subscriptionStatus === "past_due"
        ? "Past due"
        : "No plan yet";

  let verdict: { tone: "red" | "amber" | "emerald"; message: string; detail?: string };
  if (atRisk.atRisk && atRisk.reasons.length > 0) {
    const reason = atRisk.reasons[0]!;
    verdict = {
      tone: "red",
      message: `At risk: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}. Reach out.`,
    };
  } else if (launchFails > 0) {
    verdict = {
      tone: "amber",
      message: `Before go-live: ${launchFails} ${launchFails === 1 ? "step" : "steps"} left.`,
      detail: launchFailItems.join(" · "),
    };
  } else if (grade === "F" || grade === "D") {
    verdict = {
      tone: grade === "F" ? "red" : "amber",
      message: `${grade}-grade site. Fix the issues below.`,
    };
  } else if (needsReply > 0) {
    verdict = {
      tone: "amber",
      message: `${needsReply} review${needsReply === 1 ? "" : "s"} waiting on a reply.`,
    };
  } else if (evidenceDetail) {
    verdict = { tone: "amber", message: "Health not confirmed. Some evidence is unavailable or out of date." };
  } else {
    verdict = { tone: "emerald", message: "Healthy. Nothing needs you." };
  }
  if (evidenceDetail) verdict.detail = [verdict.detail, evidenceDetail].filter(Boolean).join(" · ");
  const publicUrl = getTenantPublicUrl(tenant);
  const dashboardUrl = getTenantDashboardFallbackUrl(tenant);

  const inspectHref = new URL(`/api/admin/inspect?on=1&to=${encodeURIComponent(new URL(dashboardUrl).pathname)}`, dashboardUrl).toString();
  const agencyWorkspace = await tenantAgencyWorkspace(tenant.id);
  const agencyWorkHref = agencyWorkspace
    ? new URL(`/api/admin/inspect?on=0&to=${encodeURIComponent("/workspace?workspaceId=" + agencyWorkspace)}`, dashboardUrl).toString()
    : "/admin/actions";
  return (
    <StPage>
      <StHead crumb={{ label: OPERATOR_DESTINATIONS.sites.label, href: "/admin/clients" }} title={getTenantSiteName(tenant.id, tenant)} meta={<>{tenant.ownerName || "Owner not recorded"} · {tenant.active ? "Active site" : "Archived site"}{account && account.tenantIds.length > 1 ? ` · ${account.name} · ${account.tenantIds.length} sites` : ""}</>} actions={<><StTextButton href={inspectHref}>Open workspace (read-only)</StTextButton><StTextButton href={inspectHref}>Inspect</StTextButton><StTextButton href={publicUrl}>Site</StTextButton><StTextButton href={`/admin/convert?slug=${encodeURIComponent(tenant.id)}`}>Conversion dry run</StTextButton></>} />
      <div className={styles.columns}>
        <ReleaseFlagsPanel tenantId={tenant.id} globalOwnerEmailPaused={emailSendingPaused()} />
        <aside className={styles.aside}>
          <StSection title="Owner"><StRows><StRow title={tenant.ownerName || "Owner not recorded"} detail={tenant.ownerEmail || "Owner email not recorded"} /></StRows></StSection>
          {ownerInvitations && <OwnerInvitationsPanel tenantId={tenant.id} load={ownerInvitations} />}
          <StSection title="Client work"><p>Client work uses ordinary agency permissions. Platform support inspection is read-only.</p><StTextButton href={agencyWorkHref}>{agencyWorkspace ? "Open client through your agency seat" : "Check ordinary agency access"}</StTextButton></StSection>
          <StState kind={verdict.tone === "red" ? "down" : verdict.tone === "amber" ? "need" : "live"}>{verdict.message}</StState>
          {verdict.detail && <p>{verdict.detail}</p>}
        </aside>
      </div>
      <details className={styles.fold}><summary>Site records and existing site controls</summary><div className="space-y-5">
      {/* Next action */}
      <div className="flex items-center gap-3 py-4">

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-muted">Next action</p>
          <p className="mt-0.5 text-[13.5px] font-semibold text-warm-white">{verdict.message}</p>
          {verdict.detail && <p className="mt-0.5 text-[12px] text-gray-muted">{verdict.detail}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        {isFreshClient ? (
          <>
            <Pulse label="Site health" value={readHealth.hasUnavailable("Site scan") ? "Unavailable" : grade ?? "—"} sub={readHealth.hasUnavailable("Site scan") ? "could not be read" : lastScan ? `${lastScan.overallScore}/100${scanIssue ? " · unverified" : ""}` : "not scanned yet"} />
            <Pulse label="Reviews" value={readHealth.hasUnavailable("Reviews") ? "Unavailable" : reviews.length} sub={readHealth.hasUnavailable("Reviews") ? "could not be read" : reviews.length === 1 ? "review" : "reviews"} />
            <Pulse label="Setup" value={readHealth.hasUnavailable("Launch readiness") ? "Unavailable" : launchFails === 0 ? "Ready" : `${launchFails} left`} sub="to launch" />
            <Pulse label="Plan" value={planPulse} sub="billing" />
          </>
        ) : (
          <>
            <Pulse label="Visits / wk" value={readHealth.hasUnavailable("Page visits") ? "Unavailable" : pageViews.thisWeek} sub={readHealth.hasUnavailable("Page visits") ? "could not be read" : `${pageViews.total} total`} series={dailyMetrics.map((m) => m.pageViews)} />
            <Pulse label="Booking clicks / wk" value={readHealth.hasUnavailable("Booking clicks") ? "Unavailable" : bookingClicks.thisWeek} sub={readHealth.hasUnavailable("Booking clicks") ? "could not be read" : `${bookingClicks.total} total`} series={dailyMetrics.map((m) => m.bookingClicks)} />
            <Pulse label="Content drafts" value={readHealth.hasUnavailable("Content drafts") ? "Unavailable" : Object.keys(drafts).length} sub="awaiting review" />
            <Pulse label="Last activity" value={readHealth.hasUnavailable("Activity") ? "Unavailable" : ago(activity[0]?.time ?? null)} />
          </>
        )}
      </div>

      {/* ── Who reached out ── */}
      <Section label="Who reached out">
        <Panel
          title="Inquiries from their website"
          trailing={<PanelLink href={`/admin/client-leads?tenant=${encodeURIComponent(tenant.id)}`}>All inquiries →</PanelLink>}
        >
          {!clientLeads || (clientLeads.postgres !== "ok" && clientLeads.redis !== "ok") ? (
            <p className="px-[18px] pb-4 text-[12.5px] text-gray-muted">Inquiries couldn&apos;t be read right now.</p>
          ) : clientLeads.leads.length === 0 ? (
            <p className="px-[18px] pb-4 text-[12.5px] text-gray-muted">No one has sent a form through this site yet.</p>
          ) : (
            <div className="px-3 pb-3">
              <ClientLeadList leads={clientLeads.leads} showClient={false} />
            </div>
          )}
        </Panel>
      </Section>

      {/* ── How they're doing ── */}
      <Section label="How they're doing">
        <div id="site-health" className="scroll-mt-24">
          <SiteScan tenantId={tenant.id} initialScan={lastScan} history={scanHistory.map((p) => p.overallScore)} />
        </div>
        <OperatorOpportunities suggestions={opportunities} />
        <ReviewIntelPanel intel={reviewIntel} tenantId={tenant.id} />
        <VisibilityPanel tenantId={tenant.id} summary={visSummary} findings={visFindings} diff={visDiff} />
        <GoalEditor tenantId={tenant.id} initialGoal={goal} />
      </Section>

      {/* ── Billing & setup ── */}
      <Section label="Billing & setup">
        <BillingPanel
          tenantId={tenant.id}
          ownerEmail={tenant.ownerEmail ?? ""}
          initial={{
            billingType: resolveBillingType(tenant) === "none" ? "" : resolveBillingType(tenant),
            subscriptionPlan: tenant.subscriptionPlan ?? "",
            customMonthlyDollars:
              resolveBillingType(tenant) === "custom" && tenant.planMonthlyCents
                ? String(Math.round(tenant.planMonthlyCents / 100))
                : "",
            subscriptionStatus: tenant.subscriptionStatus ?? "none",
          }}
          stripeCustomerId={tenant.stripeCustomerId}
          stripeSubscriptionId={tenant.stripeSubscriptionId}
        />
        <TenantEditor
          tenant={{
            id: tenant.id,
            siteName: tenant.siteName ?? "",
            ownerName: tenant.ownerName ?? "",
            ownerEmail: tenant.ownerEmail ?? "",
            ownerPhone: tenant.ownerPhone ?? "",
            referredBy: tenant.referredBy ?? "",
            bookingProvider: tenant.bookingProvider ?? "",
            bookingUrl: tenant.bookingUrl ?? "",
            productionDomain: tenant.productionDomain ?? "",
            adminDomain: tenant.adminDomain ?? "",
            active: tenant.active,
            revalidateUrl: tenant.revalidateUrl ?? "",
            hasRevalidationSecret: Boolean(tenant.revalidationSecret),
            features: tenant.features ?? [],
            siteUrl: tenant.siteUrl ?? "",
            industry: tenant.industry ?? "",
            personality: tenant.personality ?? "",
            businessRules: tenant.businessRules ?? "",
            capabilityManifestUrl: tenant.customRepo?.capabilityManifestUrl ?? "",
          }}
        />
        <OperatorControlsPanel
          tenantId={tenant.id}
          globalClientEmailPaused={emailSendingPaused()}
          initial={{
            reportCadence,
            replyMode: replyVoice.mode,
            contentAutonomy,
            clientEmail: clientEmailOverride,
            autoApproveThreshold: tenant.autoApproveThreshold ?? null,
            googlePlaceId: tenant.reviewsConfig?.googlePlaceId ?? "",
            yelpBusinessId: tenant.reviewsConfig?.yelpBusinessId ?? "",
            visibilityTrade: tenant.visibility?.trade ?? "",
            visibilityTowns: (tenant.visibility?.towns ?? []).join(", "),
          }}
        />
        <DomainView load={domainView} />
        <DomainManager tenantId={tenant.id} initialDomains={domainClaims.map(serializeDomainClaim)} />
        <IntegrationsPanel tenantId={tenant.id} />
        <DeploymentStatus status={deployStatus} tenantId={tenant.id} />
      </Section>

      {/* ── Human effort (ADR 0009 factory measure) ── */}
      <Section label="Human effort">
        <BusinessEffortForSite load={effort} tenantId={tenant.id} />
      </Section>

      {/* ── CRM ── */}
      <Section label="Notes & CRM">
        <ClientCrmSections
          tenantId={tenant.id}
          ownerEmail={tenant.ownerEmail ?? null}
          initialCrm={crm}
        />
      </Section>

      {activity.length > 0 && (
        <div className="rounded-2xl border border-glass-border bg-glass p-5">
          <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-warm-white mb-3">Recent activity</h2>
          <ul className="space-y-2">
            {activity.slice(0, 8).map((a, i) => (
              <li key={i} className="flex items-start justify-between gap-4 text-sm">
                <span className="text-gray-muted">
                  <span className="mr-2 text-xs uppercase tracking-wide text-gray-faint">
                    {a.actor ?? a.type}
                  </span>
                  {a.text}
                </span>
                <span className="shrink-0 text-xs text-gray-faint">{ago(a.time)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div></details>
    </StPage>
  );
}
