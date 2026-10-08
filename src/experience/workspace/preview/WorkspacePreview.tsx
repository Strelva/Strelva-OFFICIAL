"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { WorkspaceApp } from "../WorkspaceApp";
import { createPreviewInquiryAdapter } from "@/experience/inquiries/preview-fixture";
import { createPreviewRequest, PREVIEW_SCENARIOS, type PreviewScenario } from "./fixture";
import { MOONEY_INQUIRY_PROFILE, MOONEY_TENANT } from "./systems-fixture";
import { withNeedsYouPreview } from "./needs-you-fixture";
import { previewWebsiteDetail, previewWebsiteDetailMode, type PreviewWebsiteDetailMode } from "./website-detail-fixture";
import type { PreviewRouteContext } from "./route-context";
import { workspaceHistoryState } from "@/platform/workspaces/location";
import type { PreviewSystems } from "./systems-projection";
import { agencyPreviewState, withAgencyPreview } from "./agency-fixture";
import { versionPreviewState, withVersionPreview } from "./version-fixture";
import { withAskPreview, type AskPreviewMode } from "./ask-fixture";
import { HomeOutcomesProvider, type HomeOutcomes } from "../outcomes/HomeOutcomes";
import { BAKERY_LOOP } from "./outcomes-fixture";
import styles from "./preview.module.css";

const previewJson = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * Adds the server-computed Systems projection to the fixture's workspace
 * reads, and answers Make real with the result the isolated sandbox produced
 * on the server. Non-owners get the same 403 the route returns. With
 * Systems off, every snapshot says so and Make real answers the route's 503.
 */
function withSystems(base: typeof fetch, systems: PreviewSystems | undefined, websiteDetail: PreviewWebsiteDetailMode = "full"): typeof fetch {
  if (!systems) return base;
  return async (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, "http://preview.invalid");
    const method = init?.method || "GET";
    if (url.pathname === "/api/workspace/systems/website" && method === "GET") {
      if (!systems.released) return previewJson({ error: "Systems are not enabled for this business." }, 503);
      if (websiteDetail === "loading") return new Promise<Response>(() => undefined);
      if (websiteDetail === "error") return previewJson({ error: "This website's details could not be loaded." }, 503);
      if (websiteDetail === "permission") return previewJson({ error: "This business is unavailable to your account." }, 403);
      return previewJson({ detail: previewWebsiteDetail(url.searchParams.get("systemId") ?? "", websiteDetail, undefined, url.searchParams.get("workspaceId") ?? undefined) });
    }
    if (url.pathname === "/api/workspace/systems/website/restore" && method === "POST") {
      if (!systems.released) return previewJson({ error: "Website restore is not enabled." }, 503);
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<string, unknown>;
      if (typeof body.workspaceId !== "string" || !systems.owners.includes(body.workspaceId)) return previewJson({ error: "Only the owner or a Strelva operator can prepare a restore." }, 403);
      const detail = previewWebsiteDetail(String(body.systemId ?? ""), websiteDetail, undefined, body.workspaceId);
      const row = detail.history.find(item => item.restore && Object.entries(item.restore).every(([key, value]) => body[key] === value));
      if (!row) return previewJson({ error: "That saved website change is unavailable." }, 409);
      return previewJson(body.kind === "snapshot"
        ? { status: "requested", requestId: "00000000-0000-4000-8000-00000000c4a2", message: "Strelva has your Request to restore this exact saved copy. A preview still needs to be prepared and approved. Your live website is unchanged." }
        : { status: "queued", message: "The earlier website change is prepared for review. Your live website is unchanged." });
    }
    if (url.pathname === "/api/workspace/site-changes" && method === "POST") {
      // Ask for a change on a managed site: a Request at Asked. Words containing "refuse" show the refusal.
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as { action?: string; request?: string; workspaceId?: string };
      if (body.action !== "ask") return base(input, init);
      if (!body.workspaceId || !systems.owners.includes(body.workspaceId) || /refuse/i.test(body.request ?? "")) return previewJson({ error: "Only an owner or admin of this business can ask for a change here." }, 403);
      return previewJson({ requestId: "00000000-0000-4000-8000-00000000c4a1", requests: [] }, 201);
    }
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
    // Connected sites on wherever Systems is, so Home shows the /workspace/site link.
    const releases = { systems: systems.released, ...(systems.released ? { connectedSites: true } : {}) };
    return previewJson(projection ? { ...snapshot, systems: projection, releases } : { ...snapshot, releases });
  };
}

function previewHref(scenario: string, systems: string | null): string {
  const params = new URLSearchParams({ scenario });
  if (systems === "on" || systems === "off") params.set("systems", systems);
  return `/preview/strelva?${params}`;
}

/** Fixture-only outcome data for Home (`outcomes=on`). */
const PREVIEW_OUTCOMES: HomeOutcomes = { loop: BAKERY_LOOP };

export function WorkspacePreview({ scenario, systems, needsYou = false, ask = null, outcomes = false }: { scenario: PreviewScenario; systems?: PreviewSystems; needsYou?: boolean; ask?: AskPreviewMode | null; outcomes?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [installedStaffRequest] = useState(() => searchParams.get("previewSetup") === "staff-request");
  const [seededRequests] = useState(() => searchParams.get("previewSetup") === "requests");
  // Keep an explicit `systems=on|off` choice when switching examples.
  const releaseParam = searchParams.get("systems");
  const previewRouteContext: PreviewRouteContext = {
    scenario,
    ...(releaseParam === "on" || releaseParam === "off" ? { systems: releaseParam } : {}),
  };
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
  const [agencyState] = useState(() => agencyPreviewState(searchParams.get("agency")));
  const [websiteDetail] = useState(() => previewWebsiteDetailMode(searchParams.get("websiteDetail")));
  const versionState = versionPreviewState(searchParams.get("version"), scenario);
  const request = useMemo(() => withAskPreview(withVersionPreview(withNeedsYouPreview(withAgencyPreview(withSystems(createPreviewRequest(scenario, { installedStaffRequest, seededRequests }), systems, websiteDetail), scenario, agencyState), scenario, needsYou), systems, versionState), ask), [agencyState, installedStaffRequest, seededRequests, scenario, systems, needsYou, ask, websiteDetail, versionState]);
  useEffect(() => {
    if (!installedStaffRequest) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("previewSetup");
    window.history.replaceState(workspaceHistoryState(window.history.state), "", `${url.pathname}${url.search}${url.hash}`);
  }, [installedStaffRequest]);
  const inquiry = useMemo(() => scenario.startsWith("mooney")
    ? { tenantId: MOONEY_TENANT, label: "The Mooney Firm", adapter: createPreviewInquiryAdapter("business", scenario === "mooney-shared" ? "read-only" : scenario, MOONEY_INQUIRY_PROFILE) }
    : { tenantId: "buffalo-realty", label: "Buffalo Realty", adapter: createPreviewInquiryAdapter("business", scenario) }, [scenario]);
  return <div ref={previewRef} data-dashboard className={styles.preview}>
    <aside ref={controlsRef} className={styles.controls} aria-label="Local preview controls">
      <div><strong>Local interface preview</strong><span>Fictional data · changes reset on reload · no live actions</span></div>
      <label>Example<select value={scenario} onChange={event => { router.push(previewHref(event.target.value, releaseParam)); }}>{PREVIEW_SCENARIOS.map(item => <option key={item} value={item}>{item === "read-only" ? "Shared, read-only" : item.replace(/^./, letter => letter.toUpperCase())}</option>)}</select></label>
      {systems ? <Link href={previewHref(scenario, systems.released ? "off" : "on")} aria-label={`Systems are ${systems.released ? "on" : "off"}. Turn them ${systems.released ? "off" : "on"}.`}>Systems: {systems.released ? "on" : "off"}</Link> : null}
      {(scenario === "paid" || scenario === "enterprise") && <p>Relationship example only. Pricing and permissions are not simulated.</p>}
    </aside>
    <HomeOutcomesProvider value={outcomes ? PREVIEW_OUTCOMES : null}>
      <WorkspaceApp key={`${scenario}:${systems?.released ? "systems" : "reborn"}:${needsYou ? "needs-you" : ""}:${ask ?? ""}:${outcomes ? "outcomes" : ""}`} request={request} appBase="/preview/strelva" signOut={null} inquiry={inquiry} previewRouteContext={previewRouteContext} />
    </HomeOutcomesProvider>
  </div>;
}
