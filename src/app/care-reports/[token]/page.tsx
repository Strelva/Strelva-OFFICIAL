import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CareReportDocument } from "@/experience/care-reports/CareReportDocument";
import { XaOutside } from "@/components/ui/strelva/Xa";
import { resolveOwnerBrand } from "@/platform/agency-brand/server";
import { careReportReleaseSnapshotSchema } from "@/platform/care-reports/contracts";
import { careReportShareLinksEnabled } from "@/platform/care-reports/release";
import { readSharedCareReport } from "@/platform/care-reports/service";
import { careReportTokenHash } from "@/platform/care-reports/share";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Care plan report", robots: { index: false, follow: false }, referrer: "no-referrer" };

/**
 * A shared Care plan report, read-only, for an owner without an account. The
 * unguessable token is the only authority. It is a 404 unless share links are
 * on, the link is open and the client's agency seat is active.
 */
export default async function SharedCareReportPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ release?: string }> }) {
  if (!careReportShareLinksEnabled()) notFound();
  const { token } = await params;
  const { release } = await searchParams;
  const hash = careReportTokenHash(token);
  if (!hash) notFound();
  const wanted = release === undefined ? null : Number(release);
  if (wanted !== null && (!Number.isInteger(wanted) || wanted < 1)) notFound();
  const shared = await readSharedCareReport(hash, wanted).catch(() => null);
  if (!shared) notFound();
  const snapshot = careReportReleaseSnapshotSchema.safeParse(shared.release.snapshot);
  if (!snapshot.success) notFound();
  const brand = await resolveOwnerBrand(shared.agencyWorkspaceId);
  return <XaOutside from={brand.name} color={brand.accentColor} logoUrl={brand.logoUrl} credit meta="Shared with you by link" label={`${brand.name} Care plan report`}>
    <CareReportDocument snapshot={snapshot.data} brand={brand} releaseNumber={shared.release.number} audience="shared"
      releases={shared.releases} releaseHref={number => `/care-reports/${token}?release=${number}`} />
  </XaOutside>;
}
