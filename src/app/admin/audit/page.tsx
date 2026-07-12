import { getAllAuditEvents } from "@/lib/storage";
import { getScanSummaries, type ScanSummary } from "@/lib/scan-store";
import { getAllTenants, isActiveTenant } from "@/lib/tenants";
import { getTenantSiteName } from "@/lib/tenant-display";
import { AuditList, type AuditEventView } from "./AuditList";
import { SiteAuditsBoard, type AuditRow } from "./SiteAuditsBoard";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const activeTenants = (await getAllTenants()).filter(isActiveTenant);
  const summaries = await getScanSummaries(activeTenants.map((t) => t.id)).catch(
    () => ({}) as Record<string, ScanSummary | null>,
  );

  const rows: AuditRow[] = activeTenants
    .map((t) => {
      const s = summaries[t.id] ?? null;
      const counts = s?.prioritizedCounts;
      const issues = s
        ? counts
          ? counts.high + counts.medium + counts.low
          : s.prioritizedIssues?.length ?? 0
        : null;
      return {
        id: t.id,
        siteName: getTenantSiteName(t.id, t),
        url: s?.url ?? null,
        grade: s?.grade ?? null,
        score: s?.overallScore ?? null,
        issues,
        high: counts?.high ?? s?.prioritizedIssues?.filter((i) => i.priority === "high").length ?? 0,
        scannedAt: s?.scannedAt ?? null,
      };
    })
    // Worst grade / lowest score first — the sites that need an audit most sit on top.
    .sort((a, b) => (a.score ?? 101) - (b.score ?? 101));

  const events = await getAllAuditEvents(100);
  const view: AuditEventView[] = events.map((e) => ({
    id: e.id,
    time: e.time,
    action: e.action,
    targetType: e.targetType,
    targetId: e.targetId,
    actorLabel: e.actor.email || e.actor.type || "system",
    tenant: e.tenant ?? "",
  }));

  return (
    <div className="max-w-6xl space-y-10">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-[26px] sm:text-[30px] font-medium tracking-[-0.02em] text-warm-white">Site audits</h1>
        <p className="mt-1 text-sm text-gray-muted">
          Run a health + SEO audit on any client&rsquo;s live site &mdash; grade, score, and what to fix first.
        </p>
      </div>

      <SiteAuditsBoard initialRows={rows} />

      <div className="space-y-4">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-[20px] font-medium tracking-[-0.01em] text-warm-white">Operator activity</h2>
          <p className="mt-1 text-sm text-gray-muted">Every operator action across the portfolio, newest first.</p>
        </div>
        <AuditList events={view} />
      </div>
    </div>
  );
}
