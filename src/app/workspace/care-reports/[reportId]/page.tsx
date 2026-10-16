import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { CareReportColumn, CareReportDocument } from "@/experience/care-reports/CareReportDocument";
import { CareReportEditor } from "@/experience/care-reports/CareReportEditor";
import { resolveOwnerBrand } from "@/platform/agency-brand/server";
import { careReportReleaseSnapshotSchema } from "@/platform/care-reports/contracts";
import { careReportEmailEnabled, careReportShareLinksEnabled, careReportsMayBeOn } from "@/platform/care-reports/release";
import { requestOrigin } from "@/platform/care-reports/share";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { workspaceReturnTarget } from "@/platform/workspaces/location";
import { careReportsAvailableForBusiness, readCareReportForViewer } from "@/server/care-reports/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Care plan report", robots: { index: false, follow: false }, referrer: "no-referrer" };

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** One Care plan report: the agency's editor, or the owner's printable Release. */
export default async function CareReportPage({ params, searchParams }: { params: Promise<{ reportId: string }>; searchParams: Promise<{ workspaceId?: string; release?: string }> }) {
  if (!workspaceReleaseEnabled() || !careReportsMayBeOn()) notFound();
  const { reportId } = await params;
  const { workspaceId = "", release } = await searchParams;
  if (!UUID.test(reportId)) notFound();
  const actor = await workspaceHttpActor();
  if (!actor) redirect(`/sign-in?next=${encodeURIComponent(workspaceReturnTarget(`/workspace/care-reports/${reportId}?${new URLSearchParams({ workspaceId })}`) || "/workspace")}`);
  let view;
  try { view = await readCareReportForViewer(actor, reportId); } catch { notFound(); }
  if (!await careReportsAvailableForBusiness(view.report.businessWorkspaceId, { operator: false, tester: false, userId: actor.userId })) notFound();
  const brand = await resolveOwnerBrand(view.report.agencyWorkspaceId);

  if (view.audience === "agency") {
    const agencyId = view.report.agencyWorkspaceId;
    const wantedRelease = Number(release);
    const sharedRelease = release && Number.isInteger(wantedRelease) ? view.releases.find(item => item.number === wantedRelease) : undefined;
    if (sharedRelease) {
      const shared = careReportReleaseSnapshotSchema.safeParse(sharedRelease.snapshot);
      if (!shared.success) notFound();
      return <StrelvaShell title="" workspaceId={agencyId} workspaceName={brand.name} ownerBrand={brand} agencyNavigation={{ active: "clients" }}>
        <CareReportColumn>
          <CareReportDocument snapshot={shared.data} brand={brand} releaseNumber={sharedRelease.number} audience="agency"
            releases={view.releases.map(item => ({ number: item.number, publishedAt: item.publishedAt }))}
            releaseHref={number => `/workspace/care-reports/${reportId}?workspaceId=${agencyId}&release=${number}`}
            back={{ label: "Back to the draft", href: `/workspace/care-reports/${reportId}?workspaceId=${agencyId}` }} />
        </CareReportColumn>
      </StrelvaShell>;
    }
    const origin = requestOrigin(await headers());
    return <StrelvaShell title="" workspaceId={view.report.agencyWorkspaceId} workspaceName={brand.name} ownerBrand={brand} agencyNavigation={{ active: "clients" }}>
      <CareReportEditor initial={view} brand={brand} emailOn={careReportEmailEnabled()} shareLinksOn={careReportShareLinksEnabled()} origin={origin} />
    </StrelvaShell>;
  }

  const wanted = Number(release);
  const shown = view.releases.find(item => item.number === wanted) ?? view.releases[0];
  const snapshot = shown ? careReportReleaseSnapshotSchema.safeParse(shown.snapshot) : null;
  if (!shown || !snapshot?.success) notFound();
  const businessId = view.report.businessWorkspaceId;
  return <StrelvaShell title="" workspaceId={businessId} workspaceName={view.report.businessName}>
    <CareReportColumn>
      <CareReportDocument snapshot={snapshot.data} brand={brand} releaseNumber={shown.number} audience="owner"
        releases={view.releases.map(item => ({ number: item.number, publishedAt: item.publishedAt }))}
        releaseHref={number => `/workspace/care-reports/${reportId}?workspaceId=${businessId}&release=${number}`}
        back={{ label: "Recaps", href: `/workspace/recaps?workspaceId=${encodeURIComponent(businessId)}` }} />
    </CareReportColumn>
  </StrelvaShell>;
}
