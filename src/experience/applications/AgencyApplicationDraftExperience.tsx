"use client";

import { useEffect, useState } from "react";
import { XaButton, XaEmpty, XaWorking } from "@/components/ui/strelva/Xa";
import { XaNote, XaObjectPage } from "@/experience/xa-object/XaObjectPage";
import { StandaloneApplicationShell } from "./StandaloneApplicationShell";
import styles from "./application-use.module.css";
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
  const until = grant ? new Date(grant.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
  if (busy) return <StandaloneApplicationShell><XaObjectPage story={<XaWorking title="Opening the internal tool draft" steps={[{ id: "grant", label: "Checking the client's draft permission", state: "active" }]} />} /></StandaloneApplicationShell>;
  return <StandaloneApplicationShell><div className={styles.work}>
    {error ? <div role="alert"><XaEmpty pose="fixing" title="Your draft permission could not be read" job="Nothing was saved. The draft is as the client left it."
      action={<XaButton variant="primary" size="lg" onClick={() => { setBusy(true); setError(""); setReload(value => value + 1); }}>Reload permission</XaButton>}>{error}</XaEmpty></div>
      : active
        ? <XaNote>You prepare; the client reviews and makes it live. Your draft editing lasts until {until} and covers only the internal tool named in the accepted work.</XaNote>
        : <XaNote tone="waits">The client has not opened this draft to you, or the permission ended or was taken back. You can read the work; you can&apos;t save a draft.</XaNote>}
    <BoundedWorkExperience workspaceId="assigned" workId={workId} productId="applications" standaloneApplication readOnly={!active} draftEditOnly={active} canEdit={active} sources={[]} onSaved={() => undefined} />
  </div></StandaloneApplicationShell>;
}
