"use client";

import { useEffect, useMemo, useRef } from "react";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import { WebsiteEntry } from "./WebsiteEntry";
import { websiteEntryPath } from "./site-navigation";
import { fixtureRebuild } from "./rebuild-fixture";
import type { RebuildTransport } from "./rebuild-transport";

export function WebsiteEntryPreview({ entry, state }: { entry: string | null; state: string }) {
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
