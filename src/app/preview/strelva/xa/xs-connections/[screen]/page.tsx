import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XsConnectionsPreview } from "@/experience/workspace/preview/XsConnectionsPreview";
import { XS_SCREENS, type XsScreen } from "@/experience/workspace/preview/xs-connections-screens";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · XS connections", robots: { index: false, follow: false } };

/** /preview/strelva/xa/xs-connections/<google|google-agency|assistants|authorize|domain|forwarding>?state=…&mode=dark */
export default async function XsConnectionsPage({ params, searchParams }: { params: Promise<{ screen: string }>; searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { screen } = await params;
  if (!Object.hasOwn(XS_SCREENS, screen)) notFound();
  const { state, mode } = await searchParams;
  const states = XS_SCREENS[screen as XsScreen];
  const picked = states.find(item => item === state) ?? states[0]!;
  return <XsConnectionsPreview key={`${screen}:${picked}:${mode}`} screen={screen as XsScreen} state={picked} mode={mode === "dark" ? "dark" : "light"} />;
}
