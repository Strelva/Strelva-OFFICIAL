import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { OwnerPolicyPreview } from "@/experience/workspace/preview/OwnerPolicyPreview";
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
 * Owner view uses fictional local state only, including loading and permission.
 * ?operator=1 keeps the existing operator specimen; workspaceId picks a business.
 * Its server action still refuses without an operator session.
 */
export default async function WhoDecidesPreviewPage({ searchParams }: { searchParams: Promise<{ state?: string; workspaceId?: string; operator?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state, workspaceId, operator } = await searchParams;
  if (operator !== "1") return <OwnerPolicyPreview state={state} />;
  const which = previewState(state);
  return (
    <main data-dashboard className="min-h-screen space-y-6 bg-surface-base px-5 py-6 text-warm-white md:px-8 md:py-7">
      <PolicyScreen load={policyPreview(which, workspaceId)} hrefFor={id => `/preview/strelva/who-decides?state=${which}&workspaceId=${encodeURIComponent(id)}`} />
      <div className="mx-auto max-w-[920px]"><OwnerNotToldPanel load={notToldPreview(which)} /></div>
    </main>
  );
}
