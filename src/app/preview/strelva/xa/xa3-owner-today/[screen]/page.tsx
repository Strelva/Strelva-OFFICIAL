import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XaOwnerTodayPreview } from "@/experience/workspace/preview/XaOwnerTodayPreview";
import { XA3_SCREENS, XA3_STATES } from "@/experience/workspace/preview/xa-owner-today-fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · XA-3 owner Today", robots: { index: false, follow: false } };

/**
 * XA-3 · Owner: Today, the yes, after. /preview/strelva/xa/xa3-owner-today/o1..o6
 * ?state=ready|empty|loading|error|member|many|down|failed|undone|done|offer&mode=dark
 */
export default async function Xa3Preview({ params, searchParams }: { params: Promise<{ screen: string }>; searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { screen } = await params;
  const { state, mode } = await searchParams;
  const picked = XA3_SCREENS.find(item => item === screen);
  if (!picked) notFound();
  const pickedState = XA3_STATES.find(item => item === state) ?? "ready";
  return <XaOwnerTodayPreview key={`${picked}:${pickedState}:${mode}`} screen={picked} state={pickedState} mode={mode === "dark" ? "dark" : "light"} />;
}
