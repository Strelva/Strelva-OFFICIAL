"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { WorkspaceApp } from "../WorkspaceApp";
import { createPreviewInquiryAdapter } from "@/experience/inquiries/preview-fixture";
import { createPreviewRequest, PREVIEW_SCENARIOS, type PreviewScenario } from "./fixture";
import { MOONEY_INQUIRY_PROFILE, MOONEY_TENANT } from "./systems-fixture";
import type { PreviewSystems } from "./systems-projection";
import styles from "./preview.module.css";

const previewJson = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * Adds the server-computed Systems projection to the fixture's workspace
 * reads, and answers Make real with the result the isolated sandbox produced
 * on the server. Non-owners get the same 403 the route returns. With
 * Systems off, every snapshot says so and Make real answers the route's 503.
 */
function withSystems(base: typeof fetch, systems: PreviewSystems | undefined): typeof fetch {
  if (!systems) return base;
  return async (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, "http://preview.invalid");
    const method = init?.method || "GET";
    if (url.pathname === "/api/workspace/systems/make-real" && method === "POST") {
      if (!systems.released) return previewJson({ error: "Make real is not enabled. Nothing changed." }, 503);
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as { workspaceId?: string; possibilityId?: string };
      if (!body.workspaceId || !systems.owners.includes(body.workspaceId)) return previewJson({ error: "Only an owner of this business can make a possibility real.", permission: "not_owner" }, 403);
      const result = systems.makeReal[`${body.workspaceId}:${body.possibilityId}`];
      return result ? previewJson({ result }) : previewJson({ error: "This possibility is not available. Nothing changed." }, 404);
    }
    const response = await base(input, init);
    if (url.pathname !== "/api/workspace" || method !== "GET" || !response.ok) return response;
    const snapshot = await response.json() as { workspaceId: string };
    const projection = systems.systems[snapshot.workspaceId];
    const releases = { systems: systems.released };
    return previewJson(projection ? { ...snapshot, systems: projection, releases } : { ...snapshot, releases });
  };
}

function previewHref(scenario: string, systems: string | null): string {
  const params = new URLSearchParams({ scenario });
  if (systems === "on" || systems === "off") params.set("systems", systems);
  return `/preview/strelva?${params}`;
}

export function WorkspacePreview({ scenario, systems }: { scenario: PreviewScenario; systems?: PreviewSystems }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [installedStaffRequest] = useState(() => searchParams.get("previewSetup") === "staff-request");
  const [seededRequests] = useState(() => searchParams.get("previewSetup") === "requests");
  // Keep an explicit `systems=on|off` choice when switching examples.
  const releaseParam = searchParams.get("systems");
  const previewRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const controls = controlsRef.current;
    const preview = previewRef.current;
    if (!controls || !preview) return;
    const measure = () => preview.style.setProperty("--app-frame-height", `calc(100dvh - ${controls.getBoundingClientRect().height}px)`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(controls);
    return () => observer.disconnect();
  }, []);
  const request = useMemo(() => withSystems(createPreviewRequest(scenario, { installedStaffRequest, seededRequests }), systems), [installedStaffRequest, seededRequests, scenario, systems]);
  useEffect(() => {
    if (!installedStaffRequest) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("previewSetup");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [installedStaffRequest]);
  const inquiry = useMemo(() => scenario.startsWith("mooney")
    ? { tenantId: MOONEY_TENANT, label: "The Mooney Firm", adapter: createPreviewInquiryAdapter("business", scenario === "mooney-shared" ? "read-only" : scenario, MOONEY_INQUIRY_PROFILE) }
    : { tenantId: "buffalo-realty", label: "Buffalo Realty", adapter: createPreviewInquiryAdapter("business", scenario) }, [scenario]);
  return <div ref={previewRef} data-dashboard className={styles.preview}>
    <aside ref={controlsRef} className={styles.controls} aria-label="Local preview controls">
      <div><strong>Local interface preview</strong><span>Fictional data · changes reset on reload · no live actions</span></div>
      <Link href="/preview/strelva/start">All interfaces</Link>
      <label>Example<select value={scenario} onChange={event => { router.push(previewHref(event.target.value, releaseParam)); }}>{PREVIEW_SCENARIOS.map(item => <option key={item} value={item}>{item === "read-only" ? "Shared, read-only" : item.replace(/^./, letter => letter.toUpperCase())}</option>)}</select></label>
      {systems ? <Link href={previewHref(scenario, systems.released ? "off" : "on")} aria-label={`Systems are ${systems.released ? "on" : "off"}. Turn them ${systems.released ? "off" : "on"}.`}>Systems: {systems.released ? "on" : "off"}</Link> : null}
      {(scenario === "paid" || scenario === "enterprise") && <p>Relationship example only. Pricing and permissions are not simulated.</p>}
    </aside>
    <WorkspaceApp key={`${scenario}:${systems?.released ? "systems" : "reborn"}`} request={request} appBase="/preview/strelva" signOut={null} inquiry={inquiry} />
  </div>;
}
