import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
import { authorizeAdminOperatorRead } from "@/platform/operator-read-audit/admission";
import { getAllAuditEvents } from "@/lib/storage";
import { getScanSummaries, type ScanSummary } from "@/lib/scan-store";
import { getAllTenants, isActiveTenant } from "@/lib/tenants";
import { getTenantSiteName } from "@/lib/tenant-display";
import { AuditList, type AuditEventView } from "./AuditList";
import { SiteAuditsBoard, type AuditRow } from "./SiteAuditsBoard";

import { StHead, StPage, StSection } from "@/components/ui/strelva/Kit";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  await authorizeAdminOperatorRead("admin.audit.read");
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

  return <StPage width="wide">
    <StHead title={OPERATOR_DESTINATIONS.audits.label} meta="Check each live site’s health, search readiness and what to fix first." />
    <SiteAuditsBoard initialRows={rows} />
    <StSection title="Operator activity" meta="Newest first"><AuditList events={view} /></StSection>
  </StPage>;
}
