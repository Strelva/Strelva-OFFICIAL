"use client";
import { useEffect, useState } from "react";
import { SelectInput } from "@/components/ui/TextInput";
import { RebuildExperience } from "./RebuildExperience";
import { parseRebuildView, type RebuildView } from "./rebuild-transport";
export function OperatorRebuildEntry({ workspaces, initialWorkspaceId, initialWorkId }: { workspaces: { id: string; name: string }[]; initialWorkspaceId?: string; initialWorkId?: string }) {
  const [workspaceId, setWorkspaceId] = useState(workspaces.some(item => item.id === initialWorkspaceId) ? initialWorkspaceId! : workspaces[0]?.id ?? "");
  const [workId, setWorkId] = useState<string | undefined>(initialWorkId);
  const [saved, setSaved] = useState<RebuildView[]>([]);
  const [listError, setListError] = useState("");
  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    fetch(`/api/websites/rebuild?${new URLSearchParams({ workspaceId })}`, { signal: controller.signal, credentials: "same-origin", cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Saved rebuilds could not be loaded.");
      const value = await response.json();
      if (!controller.signal.aborted) { setSaved(value.rebuilds.map(parseRebuildView)); setListError(""); }
    }).catch(cause => { if (!controller.signal.aborted) setListError(cause instanceof Error ? cause.message : "Saved rebuilds could not be loaded."); });
    return () => controller.abort();
  }, [workspaceId, workId]);
  function select(workspace: string, work?: string) {
    setWorkspaceId(workspace); setWorkId(work);
    const query = new URLSearchParams({ workspaceId: workspace }); if (work) query.set("workId", work);
    window.history.replaceState(null, "", `/admin/websites?${query}`);
  }
  return <div className="max-w-7xl"><div className="grid max-w-3xl gap-4 sm:grid-cols-2"><SelectInput label="Business workspace" value={workspaceId} onChange={event => select(event.target.value)} options={workspaces.map(item => ({ value: item.id, label: item.name }))} helperText="Only workspaces your account can create work in are listed." /><SelectInput label="Saved website rebuild" value={workId ?? ""} onChange={event => select(workspaceId, event.target.value || undefined)} options={[{ value: "", label: "Start a new rebuild" }, ...saved.map(item => ({ value: item.workId, label: `${item.title} · ${item.status}` }))]} /></div>{listError ? <p className="mt-4 text-sm text-critical" role="alert">{listError}</p> : null}{workspaceId ? <RebuildExperience key={`${workspaceId}:${workId ?? "new"}`} workspaceId={workspaceId} workId={workId} managed operator onSaved={id => select(workspaceId, id)} /> : <p className="mt-6 text-sm text-gray-muted">Your account has no writable business workspace. Join the client&apos;s workspace before starting a rebuild.</p>}</div>;
}
