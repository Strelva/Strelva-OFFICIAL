import Link from "next/link";

/** The operator "what needs you" landing feed. Purely presentational — the
 *  admin overview aggregates the data and hands it down. Leads the overview so
 *  the first thing an operator sees is the work waiting on them, not MRR. */

export interface TodayLead {
  businessName: string;
  location?: string | null;
  submittedAt: string;
  isNew: boolean;
}

export interface TodayAtRisk {
  tenantId: string;
  siteName: string;
  reasons: string[];
  daysSinceActivity: number | null;
  subscriptionStatus: string | null;
}

export interface TodaySignup {
  tenantId: string;
  siteName: string;
  ownerName: string;
  createdAt: string;
}

export interface TodayFlag {
  message: string;
  href: string;
  severity: "high" | "medium" | "low";
}

export interface TodayFeedProps {
  leads: { total: number; unworked: number; recent: TodayLead[] };
  approvals: { drafts: number; digests: number; total: number };
  atRisk: TodayAtRisk[];
  signups: TodaySignup[];
  /** Portfolio-wide attention items (merged in from the old "Needs attention"
   *  list — one attention surface, not two). */
  flags?: TodayFlag[];
  /** Aggregated pending approvals across every client — links to the portfolio
   *  actions "clear everything" screen. */
  portfolioActions?: { items: number; clients: number };
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function Dot({ tone }: { tone: "red" | "amber" | "emerald" | "muted" }) {
  const cls =
    tone === "red"
      ? "bg-critical"
      : tone === "amber"
        ? "bg-warning"
        : tone === "emerald"
          ? "bg-positive"
          : "bg-gray-faint";
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cls}`} />;
}

export function TodayFeed({ leads, approvals, atRisk, signups, flags = [], portfolioActions }: TodayFeedProps) {
  const highFlags = flags.filter((f) => f.severity !== "low");
  // The primary "to approve" count is the one-click-approvable queue (portfolio
  // actions), not content-preview drafts + digests — otherwise the header reads
  // "nothing pending" while the box below shows N ready to approve. Content
  // drafts + digests still render as their own secondary rows.
  const readyToApprove = portfolioActions?.items ?? 0;
  const nothingWaiting =
    leads.unworked === 0 &&
    approvals.total === 0 &&
    (portfolioActions?.items ?? 0) === 0 &&
    atRisk.length === 0 &&
    highFlags.length === 0;

  return (
    <section className="rounded-xl border border-glass-border bg-glass overflow-hidden">
      <div className="px-5 py-3 border-b border-glass-border flex items-center justify-between gap-2">
        <span className="font-[family-name:var(--font-display)] text-sm font-medium text-warm-white">
          Needs you
        </span>
        {nothingWaiting ? (
          <span className="text-xs text-positive">You&apos;re clear</span>
        ) : (
          <span className="text-xs text-gray-muted">
            {leads.unworked > 0 && `${leads.unworked} new lead${leads.unworked === 1 ? "" : "s"}`}
            {leads.unworked > 0 && (readyToApprove > 0 || atRisk.length > 0) && " · "}
            {readyToApprove > 0 && `${readyToApprove} to approve`}
            {readyToApprove > 0 && atRisk.length > 0 && " · "}
            {atRisk.length > 0 && `${atRisk.length} at risk`}
            {(leads.unworked > 0 || readyToApprove > 0 || atRisk.length > 0) && highFlags.length > 0 && " · "}
            {highFlags.length > 0 && `${highFlags.length} flag${highFlags.length === 1 ? "" : "s"}`}
          </span>
        )}
      </div>

      <div className="divide-y divide-glass-border">
        {/* New leads */}
        <div className="px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Dot tone={leads.unworked > 0 ? "amber" : "muted"} />
              <span className="text-sm text-warm-white">New leads</span>
              <span className="text-xs text-gray-muted">
                {leads.unworked > 0
                  ? `${leads.unworked} unworked`
                  : leads.total > 0
                    ? "all worked"
                    : "none yet"}
              </span>
            </div>
            <Link href="/admin/leads" className="text-xs text-accent hover:underline">
              View leads →
            </Link>
          </div>
          {leads.recent.length > 0 && (
            <ul className="mt-2 space-y-1">
              {leads.recent.map((l, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-gray-muted">
                  <Dot tone={l.isNew ? "amber" : "muted"} />
                  <span className="text-warm-white">{l.businessName}</span>
                  {l.location && <span className="text-gray-faint">{l.location}</span>}
                  <span className="ml-auto text-gray-faint">{timeAgo(l.submittedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Pending approvals */}
        <div className="px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Dot tone={approvals.total > 0 || (portfolioActions?.items ?? 0) > 0 ? "amber" : "muted"} />
              <span className="text-sm text-warm-white">Waiting for you</span>
              <span className="text-xs text-gray-muted">
                {readyToApprove > 0
                  ? `${readyToApprove} to approve`
                  : "nothing pending"}
              </span>
            </div>
            {(portfolioActions?.items ?? 0) > 0 && (
              <Link href="/admin/actions" className="text-xs text-accent hover:underline">
                Clear portfolio →
              </Link>
            )}
          </div>
          {(portfolioActions?.items ?? 0) > 0 && (
            <Link
              href="/admin/actions"
              className="mt-2 flex items-center gap-2 rounded-lg border border-glass-border bg-glass px-3 py-2 text-xs transition-colors hover:border-gray-border"
            >
              <Dot tone="amber" />
              <span className="text-warm-white">{portfolioActions!.items}</span>
              <span className="text-gray-muted">
                ready to approve across{" "}
                {portfolioActions!.clients} client{portfolioActions!.clients === 1 ? "" : "s"}
              </span>
              <span className="ml-auto text-accent">Approve →</span>
            </Link>
          )}
          {approvals.total > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {approvals.drafts > 0 && (
                <Link href="/admin/drafts" className="text-gray-muted hover:text-warm-white">
                  <span className="text-warm-white">{approvals.drafts}</span> content draft
                  {approvals.drafts === 1 ? "" : "s"} →
                </Link>
              )}
              {approvals.digests > 0 && (
                <Link href="/admin/digests" className="text-gray-muted hover:text-warm-white">
                  <span className="text-warm-white">{approvals.digests}</span> maintenance digest
                  {approvals.digests === 1 ? "" : "s"} →
                </Link>
              )}
            </div>
          )}
        </div>

        {/* At-risk clients */}
        <div className="px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Dot tone={atRisk.length > 0 ? "red" : "emerald"} />
              <span className="text-sm text-warm-white">At-risk clients</span>
              <span className="text-xs text-gray-muted">
                {atRisk.length > 0 ? `${atRisk.length} need a look` : "none at risk"}
              </span>
            </div>
            <Link href="/admin/clients" className="text-xs text-accent hover:underline">
              Open CRM →
            </Link>
          </div>
          {atRisk.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {atRisk.map((t) => (
                <li key={t.tenantId} className="flex items-start gap-2 text-xs">
                  <Dot tone="red" />
                  <Link
                    href={`/admin/clients/${t.tenantId}`}
                    className="text-warm-white hover:text-accent"
                  >
                    {t.siteName}
                  </Link>
                  <span className="text-gray-muted">
                    {t.reasons.slice(0, 2).join(" · ")}
                    {t.daysSinceActivity != null && ` · ${t.daysSinceActivity}d quiet`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-gray-faint">Every active client looks healthy.</p>
          )}
        </div>

        {/* Portfolio flags (merged from the old "Needs attention" list) */}
        {highFlags.length > 0 && (
          <div className="px-5 py-3">
            <div className="flex items-center gap-2">
              <Dot tone="amber" />
              <span className="text-sm text-warm-white">Portfolio flags</span>
              <span className="text-xs text-gray-muted">{highFlags.length} to review</span>
            </div>
            <ul className="mt-2 space-y-1.5">
              {highFlags.slice(0, 6).map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  <Dot tone={f.severity === "high" ? "red" : "amber"} />
                  <Link href={f.href} className="text-gray-muted hover:text-warm-white">
                    {f.message}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Recent signups */}
        {signups.length > 0 && (
          <div className="px-5 py-3">
            <div className="flex items-center gap-2">
              <Dot tone="emerald" />
              <span className="text-sm text-warm-white">Recent signups</span>
              <span className="text-xs text-gray-muted">
                {signups.length} in the last 7 days
              </span>
            </div>
            <ul className="mt-2 space-y-1">
              {signups.map((s) => (
                <li key={s.tenantId} className="flex items-center gap-2 text-xs text-gray-muted">
                  <Dot tone="emerald" />
                  <Link
                    href={`/admin/clients/${s.tenantId}`}
                    className="text-warm-white hover:text-accent"
                  >
                    {s.siteName}
                  </Link>
                  {s.ownerName && <span className="text-gray-faint">{s.ownerName}</span>}
                  <span className="ml-auto text-gray-faint">{timeAgo(s.createdAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
