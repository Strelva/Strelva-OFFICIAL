"use client";

import { useMemo } from "react";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import { withAskPreview } from "@/experience/workspace/preview/ask-fixture";
import { ContentWorkspace } from "@/components/dashboard/ContentWorkspace";
import type { SectionData } from "@/components/dashboard/ContentBrowser";
import { AskStrelva } from "@/experience/ask/AskStrelva";
import { type SiteTab } from "@/platform/workspaces/site-places";
import type { SiteChangeRequest } from "@/products/websites/client";
import { WebsiteChangeRequests } from "./WebsiteChangeRequests";
import { managedSiteNavigation } from "./site-navigation";
import { WorkspaceSiteFrame, WorkspaceSiteMessage } from "./WorkspaceSiteFrame";

const WS = "11111111-1111-4111-8111-111111111111";
const SYSTEM = "aaaaaaaa-0000-4000-8000-0000000000a1";
const FIXTURE_API = "/preview/strelva/website";
const SECTIONS: Record<string, SectionData> = {
  hero: { preview: "Dried fruit, done right.", status: "configured", chatPrompt: "Update the hero" },
  products: { preview: "Apricots, cherries, mixed boxes", status: "configured", chatPrompt: "Update the products" },
  story: { preview: "A family business on the lake since 1987", status: "configured", chatPrompt: "Update the story" },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function siteChangesFixture(mode: "ready" | "empty" | "error"): typeof fetch {
  let requests: SiteChangeRequest[] = mode === "empty" ? [] : [
    { id: "c7a1e0b2-0000-4000-8000-000000000001", request: "Add a private events page with a short inquiry form", status: "requested", accepted: "accepted", createdAt: "2026-10-03T14:00:00Z", updatedAt: "2026-10-05T16:20:00Z",
      receipts: [{ id: "d0000000-0000-4000-8000-000000000001", kind: "preview", previewUrl: "https://mclears-git-private-events.vercel.app", commitSha: null, deploymentUrl: null, readBack: null, note: "Built on a branch. Form posts to Inquiries.", recordedAt: "2026-10-05T16:20:00Z" }] },
    { id: "c7a1e0b2-0000-4000-8000-000000000002", request: "Swap the footer phone number to the new line", status: "requested", accepted: "accepted", createdAt: "2026-09-28T10:00:00Z", updatedAt: "2026-09-30T12:00:00Z",
      receipts: [
        { id: "d0000000-0000-4000-8000-000000000002", kind: "preview", previewUrl: "https://mclears-git-footer.vercel.app", commitSha: null, deploymentUrl: null, readBack: null, note: null, recordedAt: "2026-09-29T09:00:00Z" },
        { id: "d0000000-0000-4000-8000-000000000003", kind: "approved", previewUrl: null, commitSha: null, deploymentUrl: null, readBack: null, note: null, recordedAt: "2026-09-29T18:00:00Z" },
        { id: "d0000000-0000-4000-8000-000000000004", kind: "deployed", previewUrl: null, commitSha: "4f9c2ab17d", deploymentUrl: "https://mclears.vercel.app", readBack: "confirmed", note: null, recordedAt: "2026-09-30T12:00:00Z" },
      ] },
  ];
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, "http://preview.invalid");
    if (url.pathname !== "/api/workspace/site-changes") return fetch(input, init);
    if (mode === "error") return json({ error: "Website change requests are unavailable." }, 503);
    if ((init?.method || "GET") === "GET") return json({ requests });
    const body = JSON.parse(String(init?.body || "{}")) as { action: string; request?: string; requestId?: string; step?: { kind: string } };
    if (body.action === "ask") {
      requests = [{ id: crypto.randomUUID(), request: body.request || "", status: "requested", accepted: "pending", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), receipts: [] }, ...requests];
      return json({ requestId: requests[0]!.id, requests }, 201);
    }
    requests = requests.map((item) => item.id === body.requestId ? { ...item, receipts: [...item.receipts, { id: crypto.randomUUID(), kind: body.step!.kind as "approved", previewUrl: null, commitSha: null, deploymentUrl: null, readBack: null, note: null, recordedAt: new Date().toISOString() }] } : item);
    return json({ receipt: {} });
  }) as typeof fetch;
}

/** Local preview of the workspace website: fictional site, real frame and panels, no live actions. */
export function WorkspaceSitePreview({ kind, tab, role, state }: { kind: "native" | "request"; tab: SiteTab | null; role: "owner" | "admin" | "member" | "operator"; state: "ready" | "empty" | "error" | "permission" | "not_found" }) {
  const request = useMemo(() => withAskPreview(siteChangesFixture(state === "error" ? "error" : state === "empty" ? "empty" : "ready"), "on", role === "operator"), [state, role]);
  if (state === "permission") return <WorkspaceSiteMessage title="This business is unavailable to your account." body="It may belong to another account, or your access may have changed. Nothing about the site was changed." href="/preview/strelva" action="Open your workspace" />;
  if (state === "not_found") return <WorkspaceSiteMessage title="This website isn't connected to this business." body="It may belong to another business, or its link was removed. Nothing about the site was changed." href="/preview/strelva" action="Back to Home" />;
  const { tab: current, tabs } = managedSiteNavigation(kind, role === "operator", tab);
  const readOnly = role === "member";
  const siteLabel = kind === "native" ? "greatlakesdriedfruit.com" : "mclearsbuffalo.com";
  return <WorkspaceRequestContext.Provider value={request}>
    <WorkspaceSiteFrame workspaceId={WS} systemId={SYSTEM} workspaceName={kind === "native" ? "Great Lakes Dried Fruit" : "McClear's Pub"} siteLabel={siteLabel} tab={current}
      tabs={tabs} tenantRoot={FIXTURE_API} tenantId="preview-business" workspaceBase="/preview/strelva" askReleased readOnly={readOnly || role !== "operator"}
      liveUrl="https://example.com" site={{ siteUrl: "", previewUrl: `${FIXTURE_API}/dashboard/site`, liveSyncEnabled: false, siteModel: "food-brand", autoPublish: false }}
      notice={readOnly ? "You can see this site. Only an owner or admin of this business can change it." : undefined}>
      {current === "edit" && readOnly ? <p className="p-8 text-sm text-gray-muted">Only an owner or admin can edit this site. The page links to History instead.</p>
        : current === "edit" ? <ContentWorkspace siteName="Great Lakes Dried Fruit" ownerName="Ruth" sectionData={SECTIONS} timestamps={{}}
        assistant={<AskStrelva compact canAskOnBehalf={role === "operator"} request={request} workspaceId={WS} businessName="Great Lakes Dried Fruit" systemId={SYSTEM} systemName={siteLabel} readOnly={readOnly} />} />
        : current === "request" ? <WebsiteChangeRequests request={request} workspaceId={WS} systemId={SYSTEM} siteLabel={siteLabel} editing={kind} canAsk={!readOnly} canDecide={role === "owner"} operator={role === "operator"} />
        : <p className="p-8 text-sm text-gray-muted">This tab reuses the dashboard&apos;s own panel against the tenant&apos;s API. The local fixture serves the editor and requests only.</p>}
    </WorkspaceSiteFrame>
  </WorkspaceRequestContext.Provider>;
}
