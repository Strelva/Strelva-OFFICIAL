import Link from "next/link";
import { buildOpsReport } from "@/lib/ops";
import { getServiceHealth, type ServiceStatus } from "@/lib/health";

export const dynamic = "force-dynamic";

const SERVICE_DOT: Record<ServiceStatus, string> = {
  ok: "bg-emerald-400",
  "not configured": "bg-gray-faint",
  error: "bg-red-400",
};

function MetricCard({
  label,
  value,
  bad,
  href,
}: {
  label: string;
  value: number;
  bad?: boolean;
  href?: string;
}) {
  const inner = (
    <>
      <p className="text-sm text-gray-muted">{label}</p>
      <p
        className={`text-3xl font-semibold mt-1 ${
          bad && value > 0 ? "text-red-300" : "text-warm-white"
        }`}
      >
        {value}
      </p>
      {href && value > 0 && (
        <p className="mt-2 text-xs text-gray-faint group-hover:text-warm-white">View →</p>
      )}
    </>
  );
  const base = "rounded-xl bg-glass border border-glass-border p-5 block";
  if (href && value > 0) {
    return (
      <Link
        href={href}
        className={`${base} group transition-colors hover:border-warm-white/20`}
      >
        {inner}
      </Link>
    );
  }
  return <div className={base}>{inner}</div>;
}

export default async function OpsPage() {
  const [report, health] = await Promise.all([buildOpsReport(), getServiceHealth()]);
  const m = report.metrics;
  const driftItems = m.domainDrift ?? [];
  const pendingByTenant = Object.entries(m.pendingEvents).sort((a, b) => b[1] - a[1]);
  const healthTint =
    health.status === "down"
      ? "text-red-300"
      : health.status === "degraded"
        ? "text-amber-300"
        : "text-emerald-300";
  const serviceChecks = Object.entries(health.checks);

  // The verdict: which categories are nonzero, in the order an operator triages
  // them. `href` deep-links to where the operator actually acts — an on-page
  // detail list (#anchor) or the portfolio clear screen. Categories without a
  // detail surface today (webhook / AI-write / SMS) are named but not linked
  // rather than pointing at a page that can't drill in.
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
  const categories: { key: string; count: number; label: string; href?: string }[] = [
    {
      key: "webhook",
      count: m.webhookFailures,
      label: `${m.webhookFailures} webhook ${plural(m.webhookFailures, "failure", "failures")}`,
    },
    {
      key: "revalidation",
      count: m.revalidationFailures,
      label: `${m.revalidationFailures} revalidation ${plural(m.revalidationFailures, "failure", "failures")}`,
      href: "#revalidation-failures",
    },
    {
      key: "ai-writes",
      count: m.failedAiWrites,
      label: `${m.failedAiWrites} failed AI ${plural(m.failedAiWrites, "write", "writes")}`,
    },
    {
      key: "sms",
      count: m.staleSmsApprovals,
      label: `${m.staleSmsApprovals} stale SMS ${plural(m.staleSmsApprovals, "approval", "approvals")}`,
    },
    {
      key: "pending",
      count: m.totalPendingEvents,
      label: `${m.totalPendingEvents} open in the review queue`,
      href: "/admin/actions",
    },
    {
      key: "drift",
      count: m.tenantDomainDrift.length,
      label: `${m.tenantDomainDrift.length} domain-drift ${plural(m.tenantDomainDrift.length, "issue", "issues")}`,
      href: "#domain-drift",
    },
  ];
  const needsYou = categories.filter((c) => c.count > 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-[28px] sm:text-[32px] font-medium text-warm-white">Operational Health</h1>
        <p className="text-sm text-gray-muted mt-1">
          {report.activeTenants} active tenants · refreshed{" "}
          {new Date(report.timestamp).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      </div>

      {/* Verdict header — the one line that says whether anything needs you. */}
      {needsYou.length === 0 ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <p className="text-[15px] font-medium text-warm-white">
              All clear. Nothing broken.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
          <p className="text-[15px] font-medium text-warm-white">
            {needsYou.length} {plural(needsYou.length, "thing needs", "things need")} you
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {needsYou.map((c) =>
              c.href ? (
                <Link
                  key={c.key}
                  href={c.href}
                  className="rounded-full border border-glass-border bg-gray-bg px-3 py-1 text-sm text-warm-white transition-colors hover:border-warm-white/25"
                >
                  {c.label} →
                </Link>
              ) : (
                <span
                  key={c.key}
                  className="rounded-full border border-glass-border bg-gray-bg px-3 py-1 text-sm text-gray-muted"
                >
                  {c.label}
                </span>
              ),
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl bg-glass border border-glass-border p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-medium text-warm-white">Platform health</h2>
          <span className={`text-xs font-medium uppercase tracking-wide ${healthTint}`}>
            {health.status}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {serviceChecks.map(([name, c]) => (
            <div key={name} className="flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${SERVICE_DOT[c.status]}`} />
              <span className="text-warm-white capitalize">{name}</span>
              <span className="text-xs text-gray-faint">
                {c.status === "ok" ? `${c.responseMs}ms` : c.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard label="Webhook failures" value={m.webhookFailures} bad />
        <MetricCard
          label="Revalidation failures"
          value={m.revalidationFailures}
          bad
          href="#revalidation-failures"
        />
        <MetricCard label="Failed AI writes" value={m.failedAiWrites} bad />
        <MetricCard label="Stale SMS approvals" value={m.staleSmsApprovals} bad />
        <MetricCard label="Open items" value={m.totalPendingEvents} href="/admin/actions" />
        <MetricCard label="Domain drift" value={m.tenantDomainDrift.length} bad href="#domain-drift" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div
          id="revalidation-failures"
          className="rounded-xl bg-glass border border-glass-border p-5 scroll-mt-24"
        >
          <h2 className="text-[15px] font-medium text-warm-white mb-3">
            Recent revalidation failures
          </h2>
          {report.revalidationFailures.length === 0 ? (
            <p className="text-sm text-gray-muted">None.</p>
          ) : (
            <ul className="space-y-2">
              {report.revalidationFailures.map((f, i) => (
                <li key={i} className="text-sm text-gray-muted">
                  <Link
                    href={`/admin/clients/${f.tenantId}`}
                    className="text-warm-white underline-offset-2 hover:underline"
                  >
                    {f.tenantId}
                  </Link>
                  {f.url ? ` · ${f.url}` : ""}: {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div
          id="domain-drift"
          className="rounded-xl bg-glass border border-glass-border p-5 scroll-mt-24"
        >
          <h2 className="text-[15px] font-medium text-warm-white mb-3">Domain drift</h2>
          {driftItems.length === 0 ? (
            <p className="text-sm text-gray-muted">No drift detected.</p>
          ) : (
            <ul className="space-y-2">
              {driftItems.map((d, i) => (
                <li key={i} className="text-sm text-amber-200">
                  <Link
                    href={`/admin/clients/${d.tenantId}`}
                    className="text-amber-100 underline-offset-2 hover:underline"
                  >
                    {d.tenantId}
                  </Link>{" "}
                  · {d.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {pendingByTenant.length > 0 && (
        <div id="pending-queue" className="rounded-xl bg-glass border border-glass-border p-5 scroll-mt-24">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-medium text-warm-white">
              Pending review queue by tenant
            </h2>
            <Link href="/admin/actions" className="text-xs text-gray-muted hover:text-warm-white">
              Clear portfolio →
            </Link>
          </div>
          <ul className="space-y-1">
            {pendingByTenant.map(([tenant, count]) => (
              <li key={tenant} className="text-sm text-gray-muted">
                <Link
                  href={`/admin/clients/${tenant}`}
                  className="text-warm-white underline-offset-2 hover:underline"
                >
                  {tenant}
                </Link>
                : {count} pending
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
