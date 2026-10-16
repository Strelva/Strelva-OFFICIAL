import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XaAskPreview } from "@/experience/workspace/preview/XaAskPreview";
import { XA_ASK_SCREENS, XA_ASK_STATES, type XaAskScreen } from "@/experience/workspace/preview/xa-ask-fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · XA-5 Ask Strelva", robots: { index: false, follow: false } };

/**
 * XA · AS1 to AS6 with the real AskStrelva and fixtures.
 * /preview/strelva/xa/xa5-ask/as1..as6?door=agency|owner&state=ready|loading|error|readonly|history-down|declined|failed&mode=dark
 */
export default async function XaAskPage({ params, searchParams }: { params: Promise<{ screen: string }>; searchParams: Promise<{ state?: string; door?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { screen } = await params;
  const { state, door, mode } = await searchParams;
  if (!XA_ASK_SCREENS.includes(screen as XaAskScreen)) notFound();
  const pickedState = XA_ASK_STATES.find(item => item === state) ?? "ready";
  const pickedDoor = door === "owner" || door === "agency" ? door : screen === "as6" ? "owner" : "agency";
  return <XaAskPreview screen={screen as XaAskScreen} state={pickedState} door={pickedDoor} mode={mode === "dark" ? "dark" : "light"} />;
}
