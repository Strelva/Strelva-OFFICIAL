"use client";

import { useEffect, useMemo, useRef } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { STRELVA_BRAND } from "@/platform/infra/agency-brand";
import { WorkspaceExport } from "@/experience/workspace/WorkspaceExport";
import { PortabilityExitCanon } from "@/experience/workspace/preview/PortabilityExitCanon";
import { WorkspaceExit } from "@/experience/workspace/WorkspaceExit";
import type { WorkspaceExitOptions } from "@/platform/workspace-exit/contracts";

import { PORTABILITY_BUILD as BUILD, PORTABILITY_COMPLETED as COMPLETED, PORTABILITY_HANDOFF as HANDOFF, PORTABILITY_USER as USER, PORTABILITY_WORKSPACE as WORKSPACE, PORTABILITY_MANIFEST } from "@/experience/workspace/preview/portability-fixture";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Fictional state only: requests and exit choices never leave this component. */
export function PortabilityFixture({ surface, state }: { surface: "export" | "exit"; state: string }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (surface !== "export" || state === "ready" || state === "empty") return;
    const button = Array.from(container.current?.querySelectorAll("button") ?? []).find(item => item.textContent?.includes("Prepare business export"));
    button?.click();
  }, [surface, state]);
  const request = useMemo<typeof fetch>(() => async (input, init) => {
    if (state === "permission") return json({ error: "Only the business owner can export records or confirm an exit." }, 403);
    if (state === "error") return json({ error: "Business records are unavailable. Nothing was changed. Try again." }, 503);
    if (surface === "exit") {
      if (state === "loading") return new Promise<Response>(() => {});
      if (init?.method === "POST") return json({ state: COMPLETED, replayed: false });
      const options: WorkspaceExitOptions = {
        state: state === "completed" ? COMPLETED : null,
        successors: state === "empty" ? [] : [{ userId: USER, email: "successor@example.test" }],
        handoff: state === "empty" ? { businessRecordRetained: true, dataDeleted: false, sites: [], systems: [] } : HANDOFF,
      };
      return json(options);
    }
    if (String(input).includes("/status?")) return json({ status: (state === "loading" || state === "running") ? "building" : state === "failed" ? "failed" : "ready" });
    return json({ buildId: BUILD, message: "Your business export is being prepared." }, 202);
  }, [surface, state]);
  return <div ref={container} onClickCapture={event => {
    // Fixture links cannot hit the real APIs or escape into authenticated work.
    if (event.target instanceof Element) {
      const href = event.target.closest("a")?.getAttribute("href");
      if (href && !href.startsWith("/preview/strelva")) { event.preventDefault(); event.stopPropagation(); }
    }
  }}>
    <p className="bg-surface-raised px-6 py-3 text-xs text-gray-muted">Local preview · fictional Harbor Workshop · {surface} / {state}</p>
    <StrelvaShell title="" workspaceId={WORKSPACE} ownerBrand={STRELVA_BRAND} businessContext="Harbor Workshop" accountName="Harbor owner" systemsReleased>
    {surface === "exit" ? state === "ready" || state === "canon" ? <PortabilityExitCanon /> : <WorkspaceExit key={state} workspaceId={WORKSPACE} request={request} />
      : <WorkspaceExport key={state} workspaceId={WORKSPACE} schema3 request={request} businessName="Harbor Workshop" manifest={state === "empty" ? [] : PORTABILITY_MANIFEST} />}
    </StrelvaShell>
  </div>;
}
