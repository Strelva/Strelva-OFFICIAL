import { buildOpsReport } from "@/lib/ops";
import { getServiceHealth, type ServiceStatus } from "@/lib/health";

export const dynamic = "force-dynamic";

const SERVICE_DOT: Record<ServiceStatus, string> = {
  ok: "bg-emerald-400",
  "not configured": "bg-gray-faint",
  error: "bg-red-400",
};

// Sanity and Clerk are the decommissioning legacy paths (Supabase + Redis are
// the live backbone). Their dots are muted so an operator doesn't read a dead
// path's error/degraded state as a real outage.
const LEGACY_SERVICES = new Set(["sanity", "clerk"]);
const LEGACY_DOT = "bg-gray-faint";

function MetricCard({
  label,
  value,
  bad,
}: {
  label: string;
  value: number;
  bad?: boolean;
}) {
  return (
    <div className="rounded-xl bg-glass border border-glass-border p-5">
      <p className="text-sm text-gray-muted">{label}</p>
      <p
        className={`text-3xl font-semibold mt-1 ${
          bad && value > 0 ? "text-red-300" : "text-warm-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export default async function OpsPage() {
  const [report, health] = await Promise.all([buildOpsReport(), getServiceHealth()]);
  const m = report.metrics;
  const pendingByTenant = Object.entries(m.pendingEvents).sort((a, b) => b[1] - a[1]);
  const healthTint =
    health.status === "down"
      ? "text-red-300"
      : health.status === "degraded"
        ? "text-amber-300"
        : "text-emerald-300";
  const serviceChecks = Object.entries(health.checks);
  const backboneChecks = serviceChecks.filter(([name]) => !LEGACY_SERVICES.has(name));
  const legacyChecks = serviceChecks.filter(([name]) => LEGACY_SERVICES.has(name));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-normal text-warm-white">Operational Health</h1>
        <p className="text-sm text-gray-muted mt-1">
          {report.activeTenants} active tenants · refreshed{" "}
          {new Date(report.timestamp).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      </div>

      <div className="rounded-xl bg-glass border border-glass-border p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-warm-white">Platform health</h2>
          <span className={`text-xs font-medium uppercase tracking-wide ${healthTint}`}>
            {health.status}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {backboneChecks.map(([name, c]) => (
            <div key={name} className="flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${SERVICE_DOT[c.status]}`} />
              <span className="text-warm-white capitalize">{name}</span>
              <span className="text-xs text-gray-faint">
                {c.status === "ok" ? `${c.responseMs}ms` : c.status}
              </span>
            </div>
          ))}
        </div>

        {legacyChecks.length > 0 && (
          <div className="mt-4 pt-3 border-t border-glass-border">
            <p className="text-xs uppercase tracking-wide text-gray-faint mb-2">
              Legacy (decommissioning)
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {legacyChecks.map(([name, c]) => (
                <div key={name} className="flex items-center gap-2 text-sm">
                  <span className={`h-2 w-2 rounded-full ${LEGACY_DOT}`} />
                  <span className="text-gray-muted capitalize">{name} (legacy)</span>
                  <span className="text-xs text-gray-faint">
                    {c.status === "ok" ? `${c.responseMs}ms` : c.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard label="Webhook failures" value={m.webhookFailures} bad />
        <MetricCard label="Revalidation failures" value={m.revalidationFailures} bad />
        <MetricCard label="Failed AI writes" value={m.failedAiWrites} bad />
        <MetricCard label="Stale SMS approvals" value={m.staleSmsApprovals} bad />
        <MetricCard label="Pending queue" value={m.totalPendingEvents} />
        <MetricCard label="Domain drift" value={m.tenantDomainDrift.length} bad />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl bg-glass border border-glass-border p-5">
          <h2 className="text-sm font-semibold text-warm-white mb-3">
            Recent revalidation failures
          </h2>
          {report.revalidationFailures.length === 0 ? (
            <p className="text-sm text-gray-muted">None.</p>
          ) : (
            <ul className="space-y-2">
              {report.revalidationFailures.map((f, i) => (
                <li key={i} className="text-sm text-gray-muted">
                  <span className="text-warm-white">{f.tenantId}</span>
                  {f.url ? ` · ${f.url}` : ""} — {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl bg-glass border border-glass-border p-5">
          <h2 className="text-sm font-semibold text-warm-white mb-3">Domain drift</h2>
          {m.tenantDomainDrift.length === 0 ? (
            <p className="text-sm text-gray-muted">No drift detected.</p>
          ) : (
            <ul className="space-y-2">
              {m.tenantDomainDrift.map((d, i) => (
                <li key={i} className="text-sm text-amber-200">
                  {d}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {pendingByTenant.length > 0 && (
        <div className="rounded-xl bg-glass border border-glass-border p-5">
          <h2 className="text-sm font-semibold text-warm-white mb-3">
            Pending review queue by tenant
          </h2>
          <ul className="space-y-1">
            {pendingByTenant.map(([tenant, count]) => (
              <li key={tenant} className="text-sm text-gray-muted">
                <span className="text-warm-white">{tenant}</span> — {count} pending
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
