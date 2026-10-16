import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XaFoundationPreview, type XaPreviewScreen, type XaPreviewState } from "@/experience/workspace/preview/XaFoundationPreview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · XA foundation", robots: { index: false, follow: false } };

const SCREENS: readonly XaPreviewScreen[] = ["owner", "yes", "agency", "record"];
const STATES: readonly XaPreviewState[] = ["ready", "empty", "loading", "error"];

/** The XA kit in place, inside the real shell. ?screen=owner|yes|agency|record&state=ready|empty|loading|error&mode=dark */
export default async function XaFoundationPage({ searchParams }: { searchParams: Promise<{ screen?: string; state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { screen, state, mode } = await searchParams;
  const pickedScreen = SCREENS.find(item => item === screen) ?? "owner";
  const pickedState = STATES.find(item => item === state) ?? "ready";
  return <XaFoundationPreview key={`${pickedScreen}:${pickedState}:${mode}`} screen={pickedScreen} state={pickedState} mode={mode === "dark" ? "dark" : "light"} />;
}
