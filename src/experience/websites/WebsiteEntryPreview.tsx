"use client";

import { useEffect, useMemo, useRef } from "react";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import { WebsiteEntry } from "./WebsiteEntry";
import { websiteEntryPath } from "./site-navigation";
import { fixtureRebuild } from "./rebuild-fixture";
import type { RebuildTransport } from "./rebuild-transport";
import { Button } from "@/components/ui/Button";

export function WebsiteEntryPreview({ entry, state, recovery }: { entry: string | null; state: string; recovery?: "progress" | "pending" }) {
  if (recovery) return <WebsiteEntryRecoveryPreview mode={recovery} />;
  return <StaticWebsiteEntryPreview entry={entry} state={state} />;
}

/** Development-only fictional records. The browser intercepts the real HTTP transport. */
function WebsiteEntryRecoveryPreview({ mode }: { mode: "progress" | "pending" }) {
  const initial = useMemo(() => ({ ...fixtureRebuild(), revision: 3, title: "Fictional bakery", status: mode === "progress" ? "building" as const : "published" as const }), [mode]);
  return <main data-dashboard className="min-h-screen bg-surface-base text-warm-black">
    <header className="flex flex-wrap gap-4 border-b border-gray-border p-6 text-sm">
      <p>Fictional saved-work recovery · no Auth, provider or publication proof</p>
      <Button variant="secondary" className="max-w-full whitespace-normal">Outside website control</Button>
    </header>
    <WebsiteEntry workspaceId={initial.workspaceId} connectedEnabled={false} rebuildEnabled path="rebuild" canManage canPublish
      initialWorkId={initial.workId} rebuilds={[initial]} entryBase="/preview/strelva/website-entry" />
  </main>;
}

function StaticWebsiteEntryPreview({ entry, state }: { entry: string | null; state: string }) {
  const ready = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (ready.current) ready.current.dataset.websiteEntryReady = "true"; }, []);
  const initial = useMemo(() => fixtureRebuild(), []);
  const transport = useMemo<RebuildTransport>(() => ({
    async read() { return initial; },
    async start() { if (state === "error") throw new Error("We couldn't open that website. Your address is kept; retry or describe your business instead."); return initial; },
    async mutate(record) { return record; },
  }), [initial, state]);
  const request = useMemo<typeof fetch>(() => async () => new Response(JSON.stringify({ error: "Local fixture: the verification tag isn't on this synthetic site yet." }), { status: 409, headers: { "Content-Type": "application/json" } }), []);
  const connect = state !== "rebuild-only" && state !== "off";
  const rebuild = state !== "connect-only" && state !== "off";
  return <WorkspaceRequestContext.Provider value={request}><p ref={ready} data-website-entry-ready="false" className="px-6 pt-6 text-sm text-gray-muted">Local interface fixture · no live changes</p><WebsiteEntry workspaceId={initial.workspaceId} connectedEnabled={connect} rebuildEnabled={rebuild} path={websiteEntryPath(connect, rebuild, entry)} canManage={state !== "permission"}
    appBase="/preview/strelva" entryBase="/preview/strelva/website-entry" transport={transport} rebuilds={state === "saved" ? [initial] : []} initialWorkId={state === "saved" ? initial.workId : undefined} sites={state === "connected" ? [{ id: "site-fixture", siteHost: "synthetic.example.test", siteUrl: "https://synthetic.example.test", status: "active", verifiedAt: "2026-10-06T12:00:00Z", systemId: "aaaaaaaa-0000-4000-8000-0000000000a1", snippet: { script: "", meta: null } }] : []} /></WorkspaceRequestContext.Provider>;
}
