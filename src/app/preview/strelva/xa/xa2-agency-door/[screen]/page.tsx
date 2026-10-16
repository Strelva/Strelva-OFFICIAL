import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { Xa2AgencyDoorPreview } from "@/experience/workspace/preview/Xa2AgencyDoorPreview";
import { XA2_SCREENS, type Xa2Screen } from "@/experience/workspace/preview/xa2-screens";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · XA-2 agency door and claim", robots: { index: false, follow: false } };

/** XA-2 screens with fictional fixtures. /preview/strelva/xa/xa2-agency-door/<screen>?state=<state>&mode=dark */
export default async function Xa2AgencyDoorPage({ params, searchParams }: { params: Promise<{ screen: string }>; searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { screen } = await params;
  const { state, mode } = await searchParams;
  if (!(screen in XA2_SCREENS)) notFound();
  const states: readonly string[] = XA2_SCREENS[screen as Xa2Screen];
  const picked = states.find(item => item === state) ?? "ready";
  return <Xa2AgencyDoorPreview key={`${screen}:${picked}:${mode}`} screen={screen as Xa2Screen} state={picked} mode={mode === "dark" ? "dark" : "light"} />;
}
