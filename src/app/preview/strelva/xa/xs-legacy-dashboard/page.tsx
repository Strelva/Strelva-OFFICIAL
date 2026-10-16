import { notFound, redirect } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { LEGACY_BASE } from "@/components/dashboard/preview/legacy-dashboard-fixtures";

export default function LegacyDashboardPreviewIndex() {
  if (!strelvaUiPreviewEnabled()) notFound();
  redirect(`${LEGACY_BASE}/dashboard`);
}
