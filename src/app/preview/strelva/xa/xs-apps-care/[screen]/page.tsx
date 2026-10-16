import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XsAppsCarePreview } from "@/experience/workspace/preview/XsAppsCarePreview";
import { XS_SCREENS, type XsScreen } from "@/experience/workspace/preview/xs-apps-care-fixture";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Strelva · XA apps, care reports and delivery", robots: { index: false, follow: false } };

/** Lane xs-apps-care: /preview/strelva/xa/xs-apps-care/<screen>?state=<state>&mode=dark. Real components, fictional fixtures. */
export default async function XsAppsCarePreviewPage({ params, searchParams }: { params: Promise<{ screen: string }>; searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { screen } = await params;
  const { state = "ready", mode } = await searchParams;
  const picked = XS_SCREENS.find(item => item === screen) as XsScreen | undefined;
  if (!picked) notFound();
  return <XsAppsCarePreview key={`${picked}:${state}:${mode}`} screen={picked} state={state} mode={mode === "dark" ? "dark" : "light"} />;
}
