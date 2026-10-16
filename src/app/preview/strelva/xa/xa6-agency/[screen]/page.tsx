import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XaAgencyPreview } from "@/experience/workspace/preview/XaAgencyPreview";
import { XA_AGENCY_SCREENS, XA_AGENCY_STATES } from "@/experience/workspace/preview/xa-agency-fixture";
import { XA_CLIENTS } from "@/experience/workspace/preview/xa-day";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · XA-6 agency", robots: { index: false, follow: false } };

/** XA-6 screens with fixtures: /preview/strelva/xa/xa6-agency/<today|queue|client|prepare|library|minutes>?state=ready|empty|loading|error|waiting|done&mode=dark&client=harbor|north|lakeview|fieldwork */
export default async function XaAgencyPreviewPage({ params, searchParams }: { params: Promise<{ screen: string }>; searchParams: Promise<{ state?: string; mode?: string; client?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { screen } = await params;
  const { state, mode, client } = await searchParams;
  const pickedScreen = XA_AGENCY_SCREENS.find(item => item === screen);
  if (!pickedScreen) notFound();
  const pickedState = XA_AGENCY_STATES.find(item => item === state) ?? "ready";
  const pickedClient = XA_CLIENTS.find(item => item.key === client)?.key ?? "harbor";
  return <XaAgencyPreview key={`${pickedScreen}:${pickedState}:${mode}:${pickedClient}`} screen={pickedScreen} state={pickedState} mode={mode === "dark" ? "dark" : "light"} client={pickedClient} />;
}
