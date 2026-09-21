"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { BoundedWorkExperience } from "@/experience/operations/BoundedWorkExperience";
import { agencyApplicationDraftGrantSchema, type AgencyApplicationDraftGrant } from "@/platform/offerings";

function message(body: unknown): string {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") return body.error;
  return "Draft access could not be confirmed.";
}

export function AgencyApplicationDraftExperience({ workId }: { workId: string }) {
  const [grant, setGrant] = useState<AgencyApplicationDraftGrant | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/agency-application-draft-access?workId=${encodeURIComponent(workId)}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const body = await response.json() as unknown;
        if (!response.ok) throw new Error(message(body));
        const value = body && typeof body === "object" && "grant" in body ? body.grant : null;
        if (value === null) return null;
        return agencyApplicationDraftGrantSchema.parse(value);
      })
      .then(value => { if (!controller.signal.aborted) setGrant(value); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Draft access could not be confirmed."); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [reload, workId]);

  const active = now !== null && grant?.status === "active" && Number.isFinite(Date.parse(grant.expiresAt)) && Date.parse(grant.expiresAt) > now;
  return <main className="min-h-screen bg-surface">
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <header className="mb-6 space-y-2">
        <p className="text-sm text-gray-muted">Assigned application draft</p>
        <h1 className="font-display text-3xl">Agency work</h1>
        <p className="max-w-2xl text-sm text-gray-muted">This page is limited to the exact application named by the customer’s accepted delivery and assignment.</p>
      </header>
      {busy ? <p role="status">Checking the current draft permission…</p> : null}
      {error ? <div role="alert" className="mb-5 space-y-2 text-sm text-critical"><p>{error}</p><Button variant="secondary" onClick={() => { setBusy(true); setError(""); setReload(value => value + 1); }}>Reload permission</Button></div> : null}
      {!busy && !error && !active ? <p role="status" className="mb-5 max-w-2xl rounded-xl border border-gray-border p-4 text-sm text-gray-muted">The customer has not granted draft editing for this application, or the grant has expired or been revoked. You can inspect the assigned work when its delivery is active, but you cannot save a draft revision.</p> : null}
      {!busy ? <BoundedWorkExperience workspaceId="assigned" workId={workId} productId="applications" readOnly={!active} draftEditOnly={active} sources={[]} onSaved={() => undefined} /> : null}
    </div>
  </main>;
}
