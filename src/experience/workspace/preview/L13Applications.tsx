"use client";

import { useCallback, useState } from "react";
import { StComposerBar, StComposerDock, StNotice, StToast } from "@/components/ui/strelva/Kit";
import { AgencyApplicationDraftExperience } from "@/experience/applications/AgencyApplicationDraftExperience";
import { ApplicationUseExperience } from "@/experience/applications/ApplicationUseExperience";
import { StandaloneApplicationModeContext } from "@/experience/applications/StandaloneApplicationShell";
import { CustomApplicationUseExperience } from "@/experience/custom-applications/CustomApplicationUseExperience";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import type { ApplicationUseSnapshot } from "@/products/applications/client";
import { applicationSchema } from "@/products/applications/contracts";

const workId = "5a000000-0000-4000-8000-000000000013";
const ownerId = "5a000000-0000-4000-8000-000000000014";
const fields = [
  { id: "name", label: "Your name", type: "text" as const, required: true },
  { id: "matter", label: "What is the matter about?", type: "text" as const, required: true },
  { id: "date", label: "Preferred date", type: "date" as const, required: false },
  { id: "stage", label: "Stage", type: "select" as const, required: true, options: ["Received", "In review", "Closed"] },
];
const records = [{ id: "fictional-intake", revision: 1, values: { name: "[Attorney name]", matter: "Commercial lease dispute, two parties", date: "2026-10-20", stage: "Received" } }];
const spec = { title: "Mediation intake", maintenanceOwner: ownerId, fields, components: [{ kind: "form" as const, fields: fields.map(field => field.id) }, { kind: "list" as const, fields: fields.map(field => field.id) }] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** All data and responses are fictional and local; no request falls through to a provider or real API. */
export function L13Applications({ kind, state, mode, ownerPreview = false }: { kind: "native" | "custom" | "agency"; state: string; mode: "light" | "dark"; ownerPreview?: boolean }) {
  const [ask, setAsk] = useState("");
  const [answer, setAnswer] = useState("");
  const request = useCallback<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (state === "loading") return new Promise<Response>(() => undefined);
    if (init?.method && init.method !== "GET") return json({ error: "This fictional preview does not save changes. Your draft remains here." }, 409);
    if (state === "error") return json({ error: "The fictional read failed. Try again to repeat this local failure." }, 503);
    if (state === "denied") return json({ error: "This internal tool is unavailable to this fictional account." }, 403);
    if (url.startsWith("/api/apps/")) {
      const readOnly = state === "read-only";
      const snapshot: ApplicationUseSnapshot = { workId, title: spec.title, releaseVersion: 2,
        views: readOnly ? [{ kind: "list", fields }] : [{ kind: "form", fields }, { kind: "list", fields }],
        records: state === "empty" ? [] : records,
        access: { views: readOnly ? ["list"] : ["form", "list"], recordRead: "own", recordEdit: readOnly ? "none" : "own", recordSubmit: !readOnly, expiresAt: "2099-01-01T00:00:00Z" } };
      return json(snapshot);
    }
    if (url.startsWith("/api/custom-applications/")) return json({ workId, title: "Consultation planner", releaseVersion: 1, artifactDigest: "fictional-reviewed-artifact-digest", grant: { expiresAt: "2099-01-01T00:00:00Z" },
      html: state === "empty" ? "<!doctype html><html><body><p>No consultation notes yet.</p></body></html>" : "<!doctype html><html><head><style>body{font-family:system-ui;margin:40px;color:#161715}h1{font-size:28px;font-weight:500}label{display:grid;gap:8px;margin-top:24px}textarea{min-height:140px;padding:12px;font:inherit;width:100%;box-sizing:border-box}</style></head><body><h1>Consultation planner</h1><p>Keep the details for your next consultation here.</p><label>Notes<textarea placeholder='Add consultation notes'></textarea></label></body></html>" });
    if (url.startsWith("/api/agency-application-draft-access")) return json({ grant: state === "read-only" ? null : { id: ownerId, applicationWorkId: workId, businessWorkspaceId: ownerId, installationId: ownerId, deliveryId: ownerId, assignmentId: ownerId, agencyWorkspaceId: ownerId, operatorUserId: ownerId, grantedBy: ownerId, status: "active", expiresAt: "2099-01-01T00:00:00Z", createdAt: "2026-10-09T12:00:00Z", updatedAt: "2026-10-09T12:00:00Z", revokedAt: null, revokedBy: null } });
    if (url.startsWith("/api/bounded-work?")) return json({ id: workId, payload: applicationSchema.parse({ version: 1, revision: 0, title: spec.title, createdBy: ownerId, createdAt: "2026-10-09T12:00:00Z", history: [], spec, specVersion: 1, status: state === "read-only" ? "installed" : "draft", versions: [{ version: 1, spec }], rehearsal: null, records: state === "read-only" ? records.map(({ id, values }) => ({ id, values })) : [], designRevision: 0, recordsRevision: 0, release: state === "read-only" ? { version: 1, spec, publishedAt: "2026-10-09T12:00:00Z", publishedBy: ownerId, provenance: "published" } : null }) });
    return json({ error: "This read is outside the fictional preview." }, 403);
  }, [state]);
  return <StandaloneApplicationModeContext.Provider value={mode}><WorkspaceRequestContext.Provider value={request}>
    <div data-workspace-theme="linen" data-workspace-mode={mode}><StNotice>Fictional interface preview. No live access, delivery or publication is proven.</StNotice>
    {kind === "custom" ? <CustomApplicationUseExperience workId={workId} /> : kind === "agency" ? <AgencyApplicationDraftExperience workId={workId} /> : <ApplicationUseExperience workId={workId} />}
    {ownerPreview ? <>
      <StNotice>Fictional owner view · This Ask Strelva bar exists only in this preview. No access or approvals are changed.</StNotice>
      {answer ? <StToast>{answer}</StToast> : null}
      <StComposerDock><StComposerBar scope={kind === "custom" ? "Consultation planner" : spec.title} placeholder={kind === "custom" ? "Ask about Consultation planner" : "Ask about Mediation intake"} value={ask} onChange={setAsk} disabled={state === "loading" || state === "error" || state === "denied"} onSubmit={() => { setAnswer("Fictional request kept for review. No change is saved or approved."); setAsk(""); }} /></StComposerDock>
    </> : null}
    </div>
  </WorkspaceRequestContext.Provider></StandaloneApplicationModeContext.Provider>;
}
