import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { StHead, StPage } from "@/components/ui/strelva/Kit";
import { AgencyGooglePreview } from "@/experience/workspace/preview/AgencyGooglePreview";
import { GoogleConnect } from "@/experience/places/GoogleConnect";
import { GoogleReadGrant } from "@/experience/places/GoogleReadGrant";
import styles from "@/experience/publishing/publishing.module.css";
import { previewNoop } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connect Google fixture", robots: { index: false, follow: false } };
const WS = "11111111-1111-4111-8111-111111111111";
const actions = { start: previewNoop, choose: previewNoop, reread: previewNoop, decide: previewNoop };

/** Local interface fixture for Connect Google states. Fictional data, no live calls. */
export default async function GoogleConnectPreview({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state = "owner" } = await searchParams;
  const facts = [
    { id: "f1", key: "hours" as const, value: { weekly: [1, 2, 3, 4, 5].map(day => ({ day, opens: "07:00", closes: "15:00" })) }, foundAt: "2026-10-12T15:00:00Z" },
    { id: "f2", key: "phone" as const, value: "(716) 555-0100", foundAt: "2026-10-12T15:00:00Z" },
    { id: "f3", key: "website" as const, value: "https://synthetic-bakery.example/", foundAt: "2026-10-12T15:00:00Z" },
    { id: "f4", key: "categories" as const, value: ["Bakery", "Cake shop"], foundAt: "2026-10-12T15:00:00Z" },
  ];
  const body = state.startsWith("agency-") || state === "owner-link" ? <AgencyGooglePreview state={state} /> : state === "choose" ? <GoogleConnect workspaceId={WS} viewer="owner" enabled hasListing={false} params={{ connect: "choose" }} actions={actions} choices={{ googleEmail: "owner@gmail.example", more: false, listings: [{ accountId: "accounts/1", locationId: "1", title: "Synthetic Bakery", address: "1 Main St, Buffalo" }, { accountId: "accounts/1", locationId: "2", title: "Synthetic Bakery Uptown", address: "900 Elmwood Ave, Buffalo" }] }} />
    : state === "agency" ? <GoogleConnect workspaceId={WS} viewer="agency" enabled hasListing={false} params={{}} actions={actions} />
    : state === "member" ? <GoogleConnect workspaceId={WS} viewer="member" enabled hasListing={false} params={{}} actions={actions} />
    : state === "found" ? <><GoogleConnect workspaceId={WS} viewer="owner" enabled hasListing params={{ connect: "connected", read: "found" }} actions={actions} foundFacts={facts} />
      <GoogleReadGrant workspaceId={WS} owner view={{ connected: true, googleEmail: "web@agency.example", gsc: { granted: true, property: "sc-domain:synthetic-bakery.example" }, ga4: { granted: true, property: null } }}
        properties={{ gsc: [{ id: "sc-domain:synthetic-bakery.example", label: "sc-domain:synthetic-bakery.example" }], ga4: [{ id: "properties/42", label: "Synthetic Bakery", detail: "Bakery account" }] }}
        summary={{ gsc: { status: "ok", totals: { clicks: 128, impressions: 4210, position: 9.4 } }, ga4: { status: "unconfigured" } }} actions={{ start: previewNoop, choose: previewNoop, disconnect: previewNoop }} /></>
    : state === "pending" ? <GoogleConnect workspaceId={WS} viewer="owner" enabled hasListing params={{ connect: "connected", read: "access_pending" }} actions={actions} />
    : <><GoogleConnect workspaceId={WS} viewer="owner" enabled hasListing={false} params={{}} actions={actions} />
      <GoogleReadGrant workspaceId={WS} owner view={{ connected: false, googleEmail: null, gsc: { granted: false, property: null }, ga4: { granted: false, property: null } }} actions={{ start: previewNoop, choose: previewNoop, disconnect: previewNoop }} /></>;
  return <main className={styles.paper} data-dashboard data-workspace-theme="linen"><StPage>
    <p>Local interface fixture · no live changes</p>
    <StHead title="Google listing" meta="Your business on Google Search and Maps" />
    {body}
  </StPage></main>;
}
