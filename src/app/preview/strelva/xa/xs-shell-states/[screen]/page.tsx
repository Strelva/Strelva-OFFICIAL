import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XsShellStatesPreview } from "@/experience/workspace/preview/XsShellStatesPreview";
import { XS_SCREENS, XS_STATES } from "@/experience/workspace/preview/xs-shell-states-fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · XS shell states", robots: { index: false, follow: false } };

/**
 * XS · Account, search, help and in-between states.
 * /preview/strelva/xa/xs-shell-states/<screen>?state=…&mode=dark
 * Emails: ./email?template=team|owner|export · Root crash: ./global-error
 */
export default async function XsShellStatesPage({ params, searchParams }: { params: Promise<{ screen: string }>; searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { screen } = await params;
  const { state, mode } = await searchParams;
  const picked = XS_SCREENS.find(item => item === screen);
  if (!picked) notFound();
  const pickedState = XS_STATES.find(item => item === state) ?? "ready";
  return <XsShellStatesPreview key={`${picked}:${pickedState}:${mode}`} screen={picked} state={pickedState} mode={mode === "dark" ? "dark" : "light"} />;
}
