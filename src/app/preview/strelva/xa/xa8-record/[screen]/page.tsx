import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { Xa8RecordPreview } from "@/experience/workspace/preview/Xa8RecordPreview";
import { XA8_SCREENS, XA8_STATES, type Xa8Screen, type Xa8State } from "@/experience/workspace/preview/xa8-record-screens";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · XA-8 record, people, leaving", robots: { index: false, follow: false } };

/** XA · R1..R6 with fixtures. /preview/strelva/xa/xa8-record/<record|hours|people|agency|remove|take|leave>?state=…&mode=dark */
export default async function Xa8RecordPage({ params, searchParams }: { params: Promise<{ screen: string }>; searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { screen } = await params;
  const { state, mode } = await searchParams;
  const picked = XA8_SCREENS.find(item => item === screen);
  if (!picked) notFound();
  const pickedState = XA8_STATES.find(item => item === state) ?? "ready";
  return <Xa8RecordPreview key={`${picked}:${pickedState}:${mode}`} screen={picked as Xa8Screen} state={pickedState as Xa8State} mode={mode === "dark" ? "dark" : "light"} />;
}
