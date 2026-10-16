import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { Xa1BusinessDoorPreview } from "@/experience/workspace/preview/Xa1BusinessDoorPreview";
import { XA1_SCREENS, type Xa1Screen } from "@/experience/workspace/preview/xa1-screens";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · XA-1 business door", robots: { index: false, follow: false } };

/** XA-1 screens with fixtures: /preview/strelva/xa/xa1-business-door/b1..b6?state=…&mode=dark */
export default async function Xa1BusinessDoorPage({ params, searchParams }: { params: Promise<{ screen: string }>; searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { screen } = await params;
  const { state, mode } = await searchParams;
  if (!(screen in XA1_SCREENS)) notFound();
  const picked = screen as Xa1Screen;
  const states: readonly string[] = XA1_SCREENS[picked];
  const pickedState = state && states.includes(state) ? state : "ready";
  return <Xa1BusinessDoorPreview key={`${picked}:${pickedState}:${mode}`} screen={picked} state={pickedState} mode={mode === "dark" ? "dark" : "light"} />;
}
