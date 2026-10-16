import Link from "next/link";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XA2_SCREENS } from "@/experience/workspace/preview/xa2-screens";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · XA-2 previews", robots: { index: false, follow: false } };

/** Index of the XA-2 previews, for people checking the lane. */
export default function Xa2Index() {
  if (!strelvaUiPreviewEnabled()) notFound();
  return <main style={{ padding: 32, fontFamily: "system-ui", lineHeight: 1.8 }}>
    <h1 style={{ fontSize: 20 }}>XA-2 · The agency door and the claim</h1>
    <ul>{Object.entries(XA2_SCREENS).map(([screen, states]) => <li key={screen}><b>{screen}</b>: {states.map(state => <Link key={state} style={{ marginRight: 12 }} href={`/preview/strelva/xa/xa2-agency-door/${screen}?state=${state}`}>{state}</Link>)}</li>)}</ul>
  </main>;
}
