import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { builtInApp, builtInAppReleaseLabel } from "@/platform/app-releases/catalog";
import { appReleaseLabelsEnabled } from "@/platform/app-releases/release";
import { readBuiltInAppRelease } from "@/platform/app-releases/server";
import { releaseViewerFor } from "@/platform/release-flags/viewer";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { careReportsMayBeOn } from "@/platform/care-reports/release";
import { listOwnerCareReports } from "@/platform/care-reports/service";
import { readWorkspaceRecaps } from "@/products/recaps/server";
import { readOwnerPlaceChrome } from "@/experience/places/place-chrome-server";
import { WorkspaceRecaps, type OwnerCareReportsState, type RecapPeriodFilter, type WorkspaceRecapsState } from "@/experience/recaps/WorkspaceRecaps";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Recaps", robots: { index: false, follow: false }, referrer: "no-referrer" };

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** The workspace home of /dashboard/reports (owner-entry spec §5). */
export default async function RecapsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!workspaceReleaseEnabled()) redirect("/workspace");
  const params = await searchParams;
  const workspaceId = typeof params.workspaceId === "string" && UUID.test(params.workspaceId) ? params.workspaceId : null;
  if (!workspaceId) redirect("/workspace");
  const period: RecapPeriodFilter = params.period === "week" || params.period === "month" ? params.period : "all";
  const user = await getSessionUser().catch(() => null);
  if (!user?.id || !user.email || !user.email_confirmed_at) {
    redirect(`/sign-in?next=${encodeURIComponent(`/workspace/recaps?workspaceId=${workspaceId}`)}`);
  }
  let state: WorkspaceRecapsState;
  try {
    state = { kind: "ready", sites: await readWorkspaceRecaps({ userId: user.id, verifiedEmail: user.email.trim().toLowerCase() }, workspaceId) };
  } catch (error) {
    if (error instanceof WorkspaceAccessError) state = { kind: "permission" };
    else {
      console.error("[recaps] page read failed", { workspaceId, error: error instanceof Error ? error.message : String(error) });
      state = { kind: "error" };
    }
  }
  // Reports an agency shared. Absent (and the page unchanged) while Care plan reports is off for this business.
  let careReports: OwnerCareReportsState | undefined;
  if (state.kind === "ready" && careReportsMayBeOn()) {
    const app = await readBuiltInAppRelease("care_reports", workspaceId, await releaseViewerFor({ userId: user.id })).catch(() => null);
    if (app?.available) {
      try { careReports = { kind: "ready", items: await listOwnerCareReports({ userId: user.id, verifiedEmail: user.email.trim().toLowerCase() }, workspaceId) }; }
      catch (error) { careReports = error instanceof WorkspaceAccessError ? undefined : { kind: "unavailable" }; }
    }
  }
  const releaseLabel = appReleaseLabelsEnabled() && state.kind === "ready"
    ? await readBuiltInAppRelease("recaps", workspaceId, await releaseViewerFor({ userId: user.id }))
      .then(release => release.available ? builtInAppReleaseLabel(builtInApp("recaps"), release.release) : undefined)
      .catch(() => undefined)
    : undefined;
  const recapId = typeof params.recap === "string" && /^[\w:-]{1,80}$/.test(params.recap) ? params.recap : undefined;
  // The real rail: pinned Systems, the business name and its agency.
  const chrome = await readOwnerPlaceChrome({ userId: user.id, verifiedEmail: user.email.trim().toLowerCase() }, workspaceId);
  return <WorkspaceRecaps workspaceId={workspaceId} state={state} period={period} releaseLabel={releaseLabel} careReports={careReports} recapId={recapId} chrome={chrome} />;
}
