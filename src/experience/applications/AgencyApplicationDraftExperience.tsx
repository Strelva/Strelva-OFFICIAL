"use client";

import { useEffect, useState, type ReactNode } from "react";
import { XaButton, XaEmpty, XaWorking } from "@/components/ui/strelva/Xa";
import { XaObjectPage } from "@/components/ui/strelva/Xa";
import { AgencyToolDraft, type AgencyToolDraftContext } from "./AgencyToolDraft";
import { StandaloneApplicationShell } from "./StandaloneApplicationShell";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import { agencyApplicationDraftGrantSchema, type AgencyApplicationDraftGrant } from "@/platform/offerings/agency-application-draft-contracts";

function message(body: unknown): string {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") return body.error;
  return "Draft access could not be confirmed.";
}

/**
 * The agency's internal tool draft. With `context` (read on the server) it
 * sits inside the agency shell and names the client, owner and person; the
 * outside frame is only for a page whose context couldn't be confirmed.
 */
export function AgencyApplicationDraftExperience({ workId, context }: { workId: string; context?: AgencyToolDraftContext | null }) {
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
  const until = grant ? new Date(grant.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
  const frame = (node: ReactNode) => context ? node : <StandaloneApplicationShell>{node}</StandaloneApplicationShell>;
  const shown: AgencyToolDraftContext = context ?? { businessName: "your client", ownerName: null, agencyName: "your agency", personName: "you" };
  if (busy) return frame(<XaObjectPage story={<XaWorking title="Opening the draft" steps={[{ id: "grant", label: `Checking that ${shown.businessName} opened it to you`, state: "active" }]} />} />);
  if (error) return frame(<XaObjectPage story={<div role="alert"><XaEmpty pose="fixing" title="Your permission for this draft couldn't be read" job={`Nothing was saved. The draft is as ${shown.businessName} left it.`}
    action={<XaButton variant="primary" size="lg" onClick={() => { setBusy(true); setError(""); setReload(value => value + 1); }}>Try again</XaButton>}>{error}</XaEmpty></div>} />);
  return frame(<AgencyToolDraft workId={workId} context={shown} canEdit={active} until={active ? until : null} />);
}
