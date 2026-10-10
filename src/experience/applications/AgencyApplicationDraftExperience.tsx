"use client";

import { useEffect, useState } from "react";
import { StEmpty, StHead, StNotice, StPage, StPill, StSkeleton } from "@/components/ui/strelva/Kit";
import { StandaloneApplicationShell } from "./StandaloneApplicationShell";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import { BoundedWorkExperience } from "@/experience/operations/BoundedWorkExperience";
import { agencyApplicationDraftGrantSchema, type AgencyApplicationDraftGrant } from "@/platform/offerings/agency-application-draft-contracts";

function message(body: unknown): string {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") return body.error;
  return "Draft access could not be confirmed.";
}

export function AgencyApplicationDraftExperience({ workId }: { workId: string }) {
  const request = useWorkspaceRequest();
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
    request(`/api/agency-application-draft-access?workId=${encodeURIComponent(workId)}`, { cache: "no-store", signal: controller.signal })
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
  }, [request, reload, workId]);

  const active = now !== null && grant?.status === "active" && Number.isFinite(Date.parse(grant.expiresAt)) && Date.parse(grant.expiresAt) > now;
  return <StandaloneApplicationShell><StPage>
    {busy ? <><StHead title="Opening application draft…" /><StSkeleton label="Checking the current draft permission" /></> : null}
    {error ? <><div role="alert"><StNotice tone="critical">{error}</StNotice></div><div><StPill variant="soft" onClick={() => { setBusy(true); setError(""); setReload(value => value + 1); }}>Reload permission</StPill></div></> : null}
    {!busy && !error && !active ? <StNotice tone="need">The client has not granted draft editing for this application, or the grant has expired or been revoked. You can inspect the assigned work when its delivery is active, but you cannot save a draft revision.</StNotice> : null}
    {!busy ? <BoundedWorkExperience workspaceId="assigned" workId={workId} productId="applications" standaloneApplication readOnly={!active} draftEditOnly={active} canEdit={active} sources={[]} onSaved={() => undefined} /> : null}
    {!busy && !error && active ? <StEmpty>The client reviews and publishes changes. This access is limited to the application named by the accepted delivery and assignment.</StEmpty> : null}
  </StPage></StandaloneApplicationShell>;
}
