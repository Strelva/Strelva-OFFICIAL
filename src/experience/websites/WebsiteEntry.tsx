"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { StHead, StNotice, StPage, StTextButton } from "@/components/ui/strelva/Kit";
import styles from "./website-entry.module.css";
import { SelectInput } from "@/components/ui/TextInput";
import { ConnectSiteExperience, type ConnectableSite } from "@/experience/connected-sites/ConnectSiteExperience";
import { RebuildExperience } from "./RebuildExperience";
import type { RebuildTransport, RebuildView } from "./rebuild-transport";
import { readRequestDraft, requestDraftKey } from "@/experience/workspace/request-draft";
import type { WebsiteEntryPath } from "./site-navigation";

const noDraftSubscription = () => () => undefined;

/** Keep your site (connect) is the default path; preparing a new website stays one choice away. */
type WebsiteEntryProps = { workspaceId: string; connectedEnabled: boolean; rebuildEnabled: boolean; path: WebsiteEntryPath | null;
  canManage: boolean; canPublish?: boolean; actorEmail?: string; agency?: boolean; operator?: boolean; sites?: ConnectableSite[]; rebuilds?: RebuildView[]; initialWorkId?: string;
  appBase?: string; entryBase?: string; transport?: RebuildTransport;
};
export function WebsiteEntry(props: WebsiteEntryProps) {
  return <ScopedWebsiteEntry key={props.workspaceId} {...props} />;
}
function ScopedWebsiteEntry({ workspaceId, connectedEnabled, rebuildEnabled, path, canManage, operator = false, canPublish = false, sites = [], rebuilds = [], initialWorkId, actorEmail, agency = false, appBase = "", entryBase, transport }: WebsiteEntryProps) {
  const requestDraft = useSyncExternalStore(noDraftSubscription, () => {
    if (!actorEmail) return "";
    try { return readRequestDraft(window.sessionStorage, requestDraftKey({ actorEmail, workspaceId })); }
    catch { return ""; }
  }, () => "");
  const [selection, setSelection] = useState({ workId: initialWorkId, generation: 0 });
  const { workId, generation } = selection;
  const [saved, setSaved] = useState(rebuilds.map(item => ({ workId: item.workId, title: item.title, status: item.status, revision: item.revision })));
  const selected = saved.find(item => item.workId === workId);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const scope = useRef(selection);
  const updateCurrentRecord = useCallback((record: RebuildView) => {
    if (!mounted.current || scope.current.generation !== generation || record.workspaceId !== workspaceId || (workId && record.workId !== workId)) return;
    setSaved(items => {
      const current = items.find(item => item.workId === record.workId);
      if (current && (record.revision < current.revision || record.revision === current.revision && record.title === current.title && record.status === current.status)) return items;
      const next = { workId: record.workId, title: record.title, status: record.status, revision: record.revision };
      return current ? items.map(item => item.workId === record.workId ? next : item) : [...items, next];
    });
  }, [workspaceId, workId, generation]);
  const href = (entry: WebsiteEntryPath, work?: string) => `${entryBase ?? `${appBase}/workspace/site`}?${new URLSearchParams({ workspaceId, entry, ...(work ? { workId: work } : {}) })}`;
  const chooseWork = (id?: string) => {
    if (scope.current.workId !== id) {
      scope.current = { workId: id, generation: scope.current.generation + 1 };
      setSelection(scope.current);
    }
    window.history.replaceState(window.history.state, "", href("rebuild", id));
  };
  return <div className={styles.entry}>
    {connectedEnabled && rebuildEnabled || !path ? <StPage><nav aria-label="Website options" className={styles.options}>
      {!path ? <StHead title="Your website in Strelva" meta="Connect the site you already have, or prepare a new one. You review it before anything goes live." /> : null}
      {connectedEnabled ? <StTextButton href={href("connect")} aria-current={path === "connect" ? "page" : undefined}>Keep your site</StTextButton> : null}
      {rebuildEnabled ? <StTextButton href={href("rebuild")} aria-current={path === "rebuild" ? "page" : undefined}>Prepare a new website</StTextButton> : null}
      {!connectedEnabled && !rebuildEnabled ? <StNotice>Website entry isn&rsquo;t open for this business yet.</StNotice> : null}
    </nav></StPage> : null}
    {path === "connect" && connectedEnabled ? <ConnectSiteExperience workspaceId={workspaceId} canManage={canManage} initialSites={sites} appBase={appBase} /> : null}
    {path === "rebuild" && rebuildEnabled ? <div>
      {saved.length ? <div className={styles.saved}><SelectInput helperText={selected ? `Last known saved work: ${selected.title} · ${selected.status}` : undefined} className="max-sm:min-h-11" label="Saved website work" value={workId ?? ""} options={[{ value: "", label: "Start a new website request" }, ...saved.map(item => ({ value: item.workId, label: `${item.title} · ${item.status}` }))]} onChange={event => chooseWork(event.target.value || undefined)} /></div> : null}
      <RebuildExperience initialRequest={!workId ? requestDraft : ""} agency={agency} key={workId ?? (requestDraft ? "new:carried" : "new")} workspaceId={workspaceId} workId={workId} managed operator={operator} canPublish={canPublish} allowIntake readOnly={!canManage} transport={transport} onCurrentRecord={updateCurrentRecord} minimumRecordRevision={saved.find(item => item.workId === workId)?.revision ?? -1}
        onSaved={id => { setSaved(items => items.some(item => item.workId === id) ? items : [...items, { workId: id, title: "Saved website request", status: "building", revision: -1 }]); chooseWork(id); }} />
    </div> : null}
  </div>;
}
