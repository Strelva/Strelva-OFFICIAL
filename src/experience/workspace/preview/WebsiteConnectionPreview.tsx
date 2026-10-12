"use client";

import { useMemo, type ReactNode } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { StEmpty, StHead, StNotice, StPage, StSkeleton } from "@/components/ui/strelva/Kit";
import { ConnectSiteExperience, type ConnectableSite } from "@/experience/connected-sites/ConnectSiteExperience";
import { ServerVisibility } from "@/experience/connected-sites/ServerVisibility";
import { expectedConnectedSiteSystemId } from "@/products/connected-sites/client";
import { WebsiteDomainRecords } from "@/experience/websites/WebsiteDomainRecords";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import type { WebsiteDomainView } from "@/products/websites/client";

/** Fictional connection and domain data. The transport never writes to a provider or product API. */
const WORKSPACE = "7a000000-0000-4000-8000-000000000001";
const SITE = "7a000000-0000-4000-8000-000000000003";
const site: ConnectableSite = {
  id: SITE, siteHost: "lakeview.example.test", siteUrl: "https://lakeview.example.test/", status: "active", verifiedAt: null,
  systemId: "aaaaaaaa-0000-4000-8000-0000000000a1",
  snippet: { meta: '<meta name="strelva-site-verification" content="fictional-preview-verification">', script: '<script src="https://app.strelva.com/connect.js" data-strelva-site="fictional-preview-key" defer></script>' },
};
const domain: WebsiteDomainView = { hostname: "lakeview.example.test", status: "pending", checkedAt: "2026-10-09T18:02:00Z", records: [
  { type: "A", name: "@", value: "192.0.2.1" },
  { type: "CNAME", name: "www", value: "sites.example.test" },
  { type: "TXT", name: "_strelva", value: "strelva-verify=fictional-preview" },
] };

function Frame({ children, mode }: { children: ReactNode; mode: "light" | "dark" }) {
  return <div data-workspace-mode={mode}><StrelvaShell active="system" systemsReleased signedIn={false} accountName="Preview" businessContext={<span>Lakeview preview</span>} pinned={[{ kind: "website", title: site.siteHost, href: "/preview/strelva/website-connect", id: site.systemId, current: true }]}
    notice={<span>Fictional interface fixture · no live verification, publication or DNS changes</span>}>{children}</StrelvaShell></div>;
}

export function WebsiteConnectPreview({ state, mode, visibility }: { state: string; mode: "light" | "dark"; visibility: boolean }) {
  const request = useMemo<typeof fetch>(() => async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { action?: string; siteUrl?: string };
    if (state === "error") return new Response(JSON.stringify({ error: "The fictional website did not return its verification tag. Nothing changed." }), { status: 409 });
    if (state === "unconfirmed") throw new TypeError("Fictional lost response");
    if (state === "pending") await new Promise<void>(() => {});
    const next = { ...site, systemId: await expectedConnectedSiteSystemId(WORKSPACE, SITE), verifiedAt: body.action === "verify" ? "2026-10-09T18:02:00Z" : null };
    if (body.action === "connect" && body.siteUrl) { const url = new URL(/^https?:\/\//i.test(body.siteUrl) ? body.siteUrl : `https://${body.siteUrl}`); next.siteUrl = `${url.protocol}//${url.host.toLowerCase()}${url.pathname}`; next.siteHost = url.hostname.toLowerCase(); }
    return new Response(JSON.stringify({ site: next }), { status: 200 });
  }, [state]);
  return <Frame mode={mode}><WorkspaceRequestContext.Provider value={request}>
    {state === "loading" ? <StPage><StHead title="Connect your website" /><StSkeleton label="Loading connected websites" /><StSkeleton width="60%" /></StPage>
      : <ConnectSiteExperience workspaceId={WORKSPACE} canManage={state !== "permission"} initialSites={state === "empty" || state === "permission" ? [] : [{ ...site, verifiedAt: state === "connected" ? "2026-10-09T18:02:00Z" : null }]} appBase="/preview/strelva" />}
    {state === "error" ? <StPage><StNotice tone="critical">The fictional website did not return its verification tag. Nothing changed. Publish the connection lines, then check again.</StNotice></StPage> : null}
    {visibility ? <ServerVisibility workspaceId={WORKSPACE} canManage={state !== "permission"} suggestedHandle="lakeview-preview" initial={{ pagesEnabled: false, page: null, blocks: state === "empty" ? null : [{ id: SITE, label: site.siteHost, url: site.siteUrl, checkable: false, block: { hash: "fictional-preview", html: '<script type="application/ld+json">{"@type":"LocalBusiness","name":"Fictional Lakeview"}</script>' } }] }} /> : null}
  </WorkspaceRequestContext.Provider></Frame>;
}

export function WebsiteDomainPreview({ state, mode }: { state: string; mode: "light" | "dark" }) {
  return <Frame mode={mode}>
    <WebsiteDomainRecords domain={state === "empty" ? null : { ...domain, status: state === "verified" ? "verified" : "pending", records: state === "records-empty" ? [] : domain.records }} loading={state === "loading"} canSee={state !== "permission"} error={state === "error" ? "The fictional hosting provider could not return this domain’s records. Nothing changed." : undefined} backHref="/preview/strelva/website-connect" />
    {state === "empty" ? <StPage><StEmpty>Register or connect a domain to see provider records here.</StEmpty></StPage> : null}
    {state === "ready" ? <StPage><StNotice>Record values are fictional. This fixture shows provider recommendations, not individual DNS verification.</StNotice></StPage> : null}
  </Frame>;
}
