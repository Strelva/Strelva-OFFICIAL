import { redirect } from "next/navigation";
import { getTenantFromHeaders } from "@/lib/tenant";
import { hasTenantAccess } from "@/lib/auth";
import { getWeeklyBrief } from "@/lib/weekly-brief";
import { WeeklyBriefClient } from "@/components/dashboard/WeeklyBriefClient";

export default async function BriefPage() {
  const tenant = await getTenantFromHeaders();
  const hasAccess = await hasTenantAccess(tenant);
  if (!hasAccess) redirect("/");

  const brief = await getWeeklyBrief(tenant);

  return <WeeklyBriefClient brief={brief} />;
}
