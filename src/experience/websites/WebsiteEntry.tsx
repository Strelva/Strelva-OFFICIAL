"use client";

import { useState, useSyncExternalStore } from "react";
import { SelectInput } from "@/components/ui/TextInput";
import { ConnectSiteExperience, type ConnectableSite } from "@/experience/connected-sites/ConnectSiteExperience";
import { RebuildExperience } from "./RebuildExperience";
import type { RebuildTransport, RebuildView } from "./rebuild-transport";
import { readRequestDraft, requestDraftKey } from "@/experience/workspace/request-draft";
import type { WebsiteEntryPath } from "./site-navigation";

const noDraftSubscription = () => () => undefined;

/** Both prepared entry paths stay available without selecting a launch default. */
export function WebsiteEntry({ workspaceId, connectedEnabled, rebuildEnabled, path, canManage, operator = false, canPublish = false, sites = [], rebuilds = [], initialWorkId, actorEmail, agency = false, appBase = "", entryBase, transport }: {
  workspaceId: string; connectedEnabled: boolean; rebuildEnabled: boolean; path: WebsiteEntryPath | null;
  canManage: boolean; canPublish?: boolean; actorEmail?: string; agency?: boolean; operator?: boolean; sites?: ConnectableSite[]; rebuilds?: RebuildView[]; initialWorkId?: string;
  appBase?: string; entryBase?: string; transport?: RebuildTransport;
}) {
  const requestDraft = useSyncExternalStore(noDraftSubscription, () => {
    if (!actorEmail) return "";
    try { return readRequestDraft(window.sessionStorage, requestDraftKey({ actorEmail, workspaceId })); }
    catch { return ""; }
  }, () => "");
  const [workId, setWorkId] = useState(initialWorkId);
  const [saved, setSaved] = useState(rebuilds.map(item => ({ workId: item.workId, title: item.title, status: item.status })));
  const href = (entry: WebsiteEntryPath, work?: string) => `${entryBase ?? `${appBase}/workspace/site`}?${new URLSearchParams({ workspaceId, entry, ...(work ? { workId: work } : {}) })}`;
  const chooseWork = (id?: string) => {
    setWorkId(id);
    window.history.replaceState(window.history.state, "", href("rebuild", id));
  };
  return <div className="text-warm-black">
    {connectedEnabled && rebuildEnabled || !path ? <nav aria-label="Website options" className="mx-auto grid w-full max-w-2xl gap-4 px-4 pt-10 md:px-8">
      {!path ? <><h1 className="font-display text-[32px] leading-10">Your website in Strelva</h1><p className="text-sm text-gray-muted">Connect the site you already have, or prepare a new one. You review it before anything goes live.</p></> : null}
      {connectedEnabled ? <a className="text-sm underline underline-offset-4" href={href("connect")} aria-current={path === "connect" ? "page" : undefined}>Connect your existing website</a> : null}
      {rebuildEnabled ? <a className="text-sm underline underline-offset-4" href={href("rebuild")} aria-current={path === "rebuild" ? "page" : undefined}>Prepare a new website</a> : null}
      {!connectedEnabled && !rebuildEnabled ? <p role="status" className="text-sm text-gray-muted">Website entry isn&rsquo;t open for this business yet.</p> : null}
    </nav> : null}
    {path === "connect" && connectedEnabled ? <ConnectSiteExperience workspaceId={workspaceId} canManage={canManage} initialSites={sites} appBase={appBase} /> : null}
    {path === "rebuild" && rebuildEnabled ? <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-10 md:px-8">
      {saved.length ? <div className="max-w-2xl"><SelectInput label="Saved website work" value={workId ?? ""} options={[{ value: "", label: "Start a new website request" }, ...saved.map(item => ({ value: item.workId, label: `${item.title} · ${item.status}` }))]} onChange={event => chooseWork(event.target.value || undefined)} /></div> : null}
      <RebuildExperience initialRequest={!workId ? requestDraft : ""} agency={agency} key={workId ?? (requestDraft ? "new:carried" : "new")} workspaceId={workspaceId} workId={workId} managed operator={operator} canPublish={canPublish} allowIntake readOnly={!canManage} transport={transport}
        onSaved={id => { if (!saved.some(item => item.workId === id)) setSaved(items => [...items, { workId: id, title: "Saved website request", status: "building" }]); chooseWork(id); }} />
    </div> : null}
  </div>;
}
