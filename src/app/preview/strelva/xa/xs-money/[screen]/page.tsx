import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XsMoneyPreview } from "@/experience/workspace/preview/XsMoneyPreview";
import { XS_MONEY_SCREENS, type XsMoneyScreen } from "@/experience/workspace/preview/xs-money-screens";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · XA money", robots: { index: false, follow: false } };

/** The money lane's real components with fixtures. /preview/strelva/xa/xs-money/<screen>?state=…&mode=dark */
export default async function XsMoneyScreenPage({ params, searchParams }: { params: Promise<{ screen: string }>; searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { screen } = await params;
  if (!Object.hasOwn(XS_MONEY_SCREENS, screen)) notFound();
  const { state, mode } = await searchParams;
  const states = XS_MONEY_SCREENS[screen as XsMoneyScreen] as readonly string[];
  const picked = state && states.includes(state) ? state : states[0]!;
  return <XsMoneyPreview key={`${screen}:${picked}:${mode}`} screen={screen as XsMoneyScreen} state={picked} mode={mode === "dark" ? "dark" : "light"} />;
}
