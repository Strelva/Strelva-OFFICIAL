import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTenantFromHeaders } from "@/lib/tenant";
import { hasTenantAccess } from "@/lib/auth";
import { getClientFallbackRoot, withClientFallbackRoot } from "@/lib/client-fallback";
import { getWeeklyBrief, getWeeklyBriefs } from "@/lib/weekly-brief";
import { EngagementTracker } from "@/components/dashboard/EngagementTracker";
import { WeeklyBriefClient } from "@/components/dashboard/WeeklyBriefClient";

export default async function ReportsPage() {
  const clientFallbackRoot = getClientFallbackRoot(await headers());
  const tenant = await getTenantFromHeaders();
  const hasAccess = await hasTenantAccess(tenant);

  if (!hasAccess) {
    redirect(withClientFallbackRoot(clientFallbackRoot, "/no-access"));
  }

  const [brief, history] = await Promise.all([
    getWeeklyBrief(tenant),
    getWeeklyBriefs(tenant),
  ]);

  return (
    <>
      <EngagementTracker event="report-view" />
      <WeeklyBriefClient brief={brief} history={history} />
    </>
  );
}
