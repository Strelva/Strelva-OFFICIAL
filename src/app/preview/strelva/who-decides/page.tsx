import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { PolicyScreen } from "@/app/admin/needs-you/PolicyView";
import { OwnerNotToldPanel } from "@/app/admin/queue/OwnerNotToldPanel";
import { notToldPreview, policyPreview, previewState } from "./fixture";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Who decides · Local interface preview",
  robots: { index: false, follow: false },
};

/**
 * Local fixture only (STRELVA_UI_PREVIEW=1 in development):
 * ?state=ready|empty|denied|error|off, &workspaceId=… picks a business.
 * Saving hits the real server action, which refuses without an operator session.
 */
export default async function WhoDecidesPreviewPage({ searchParams }: { searchParams: Promise<{ state?: string; workspaceId?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state, workspaceId } = await searchParams;
  const which = previewState(state);
  return (
    <main data-dashboard className="min-h-screen space-y-6 bg-surface-base px-5 py-6 text-warm-white md:px-8 md:py-7">
      <PolicyScreen load={policyPreview(which, workspaceId)} hrefFor={id => `/preview/strelva/who-decides?state=${which}&workspaceId=${encodeURIComponent(id)}`} />
      <div className="mx-auto max-w-[920px]"><OwnerNotToldPanel load={notToldPreview(which)} /></div>
    </main>
  );
}
