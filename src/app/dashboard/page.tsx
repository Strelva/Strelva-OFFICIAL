import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTenantFromHeaders } from "@/lib/tenant";
import { hasTenantAccess } from "@/lib/auth";
import { getWeeklyBrief, getWeeklyBriefs } from "@/lib/weekly-brief";
import { WeeklyBriefClient } from "@/components/dashboard/WeeklyBriefClient";
import { BriefSkeleton } from "@/components/dashboard/BriefSkeleton";

async function TodayContent() {
  const tenant = await getTenantFromHeaders();
  const hasAccess = await hasTenantAccess(tenant);
  if (!hasAccess) redirect("/no-access");

  const [brief, history] = await Promise.all([
    getWeeklyBrief(tenant),
    getWeeklyBriefs(tenant, 8),
  ]);

  return <WeeklyBriefClient brief={brief} history={history} />;
}

export default function TodayPage() {
  return (
    <Suspense fallback={<BriefSkeleton />}>
      <TodayContent />
    </Suspense>
  );
}
