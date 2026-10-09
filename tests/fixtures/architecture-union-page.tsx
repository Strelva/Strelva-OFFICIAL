"use client";
// Copy into the disposable local proof route only; never add a deployed route.
import { useEffect, useState } from "react";
import { WorkspaceApp } from "@/experience/workspace/WorkspaceApp";
import { createPreviewRequest } from "@/experience/workspace/preview/fixture";
import { envelope, source } from "@/__tests__/fixtures/opened-work-composition";
import type { WebsiteRecord } from "@/products/websites/contracts";

const BUSINESS = "33333333-3333-4333-8333-333333333333";
const WORK = "55555555-5555-4555-8555-555555555555";

declare global {
  interface Window {
    architectureUnionProof?: {
      releaseWorkspace(status: 200 | 403 | 500 | 503): Promise<void>;
      counts(): { workspaceReads: number; websiteReads: number; mutations: number; pending: number };
    };
  }
}

function website(mutations: number): WebsiteRecord {
  const approved = mutations > 0;
  const launchPending = mutations > 1;
  return {
    workspaceId: BUSINESS, workId: WORK,
    createdAt: "2026-10-09T12:00:00.000Z", updatedAt: "2026-10-09T12:00:00.000Z",
    website: {
      version: 1, revision: mutations + 1, title: "Fictional Harbor website",
      brief: { businessName: "Fictional Harbor", description: "A closed fictional browser fixture.", primaryCallToAction: "Contact us" },
      status: launchPending ? "launch_pending" : approved ? "approved" : "preview_ready",
      approvedCandidateRevision: approved ? 1 : null,
      candidate: {
        kind: "website_candidate", revision: 1, contentHash: "a".repeat(64), rendererDigest: "b".repeat(64), artifactDigest: "c".repeat(64),
        preview: { href: `/api/websites/${WORK}/preview`, revision: 1, contentHash: "a".repeat(64) },
        generatedAt: "2026-10-09T12:00:00.000Z",
        spec: { version: 1, siteName: "Fictional Harbor", content: {}, pages: { home: {} }, theme: {} },
      },
      launch: { status: launchPending ? "pending" : "not_requested", candidateRevision: launchPending ? 1 : null, receipt: null, failure: null },
      lastError: null, createdBy: "fictional-owner", createdAt: "2026-10-09T12:00:00.000Z", history: [],
    },
  };
}

export default function ArchitectureUnionProof() {
  const [request, setRequest] = useState<typeof fetch>();
  useEffect(() => {
    const version = new URLSearchParams(location.search).get("version") === "2" ? 2 : 1;
    const base = createPreviewRequest("business");
    const previous = window.fetch;
    let workspaceReads = 0;
    let websiteReads = 0;
    let mutations = 0;
    let recovered = false;
    const pending: Array<(response: Response) => void> = [];
    const snapshot = async (workspaceId = BUSINESS) => {
      const response = await base(`/api/workspace?workspaceId=${workspaceId}`);
      if (!response.ok) return response;
      const data = await response.json();
      data.actor.localPreview = false;
      data.work = workspaceId === BUSINESS ? [version === 2 ? source(WORK) : {
        ...data.work[0], id: WORK, productId: "websites", resourceKind: "website", title: "Fictional Harbor website", assessment: undefined, payload: null,
      }] : [];
      return Response.json(data);
    };
    const closedRequest: typeof fetch = async (input, init) => {
      const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(raw, "http://fictional.invalid");
      if (url.origin !== "http://fictional.invalid") return Response.json({ error: "Foreign request refused by fictional proof." }, { status: 403 });
      if (url.pathname === "/api/workspace") {
        workspaceReads += 1;
        const workspaceId = url.searchParams.get("workspaceId") || BUSINESS;
        if (workspaceId === BUSINESS && mutations > 0 && !recovered) return new Promise(resolve => pending.push(resolve));
        return snapshot(workspaceId);
      }
      if (url.pathname === `/api/websites/${WORK}`) {
        if (init?.method === "POST") { mutations += 1; return Response.json(website(mutations)); }
        websiteReads += 1;
        return Response.json(website(mutations));
      }
      if (url.pathname === `/api/websites/${WORK}/rebuild`) { websiteReads += 1; return Response.json(envelope(WORK, mutations + 1)); }
      if (init?.method === "POST" && url.pathname.startsWith(`/api/websites/${WORK}/facts/`)) {
        mutations += 1;
        const result = envelope(WORK, mutations + 1);
        if (mutations > 1) result.rebuild.candidate!.document.facts.uncertain!.origin = "owner_confirmed";
        return Response.json(result);
      }
      // History/domain availability is supplemental; no native API can escape.
      return Response.json({ error: "Outside this fictional browser proof." }, { status: 503 });
    };
    window.architectureUnionProof = {
      async releaseWorkspace(status) {
        const release = pending.shift();
        if (!release) throw new Error("No pending fictional workspace read.");
        if (status === 200) { recovered = true; release(await snapshot()); }
        else release(Response.json({ error: status === 403 ? "Current access refused." : "Snapshot temporarily unavailable." }, { status }));
      },
      counts: () => ({ workspaceReads, websiteReads, mutations, pending: pending.length }),
    };
    window.fetch = closedRequest;
    const frame = requestAnimationFrame(() => setRequest(() => closedRequest));
    return () => { cancelAnimationFrame(frame); window.fetch = previous; delete window.architectureUnionProof; };
  }, []);
  return <><p role="note">Disposable fictional union proof — no Auth, providers, publication or production actions</p>{request ? <WorkspaceApp request={request} /> : <p>Preparing fictional proof…</p>}</>;
}
