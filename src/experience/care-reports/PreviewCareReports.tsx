"use client";
import { AgencyCareReports } from "./AgencyCareReports";
import { CareReportEditor } from "./CareReportEditor";
import { PREVIEW_AGENCY_ID, PREVIEW_BRAND, PREVIEW_BRAND_UNAVAILABLE, PREVIEW_CAREPLAN_LIST, PREVIEW_CAREPLAN_SKIPS, previewAgencyView } from "./preview-fixture";

/** Preview-only: a request that answers from fixtures and changes nothing. Functions cannot cross from a server page, so the wrappers live here. */
const reply = (status: number, body: unknown = {}) => Response.json(body, { status });
const previewRequest = (state: string): typeof fetch => async (input, init) => {
  if (init?.method && init.method !== "GET") return state === "generated-with-skips" ? reply(200, { ...PREVIEW_CAREPLAN_SKIPS, reports: [] }) : reply(400, { error: "This preview does not change anything." });
  if (state === "loading") return new Promise<Response>(() => undefined);
  if (state === "off") return reply(503);
  if (state === "error") return reply(500);
  return reply(200, { ...PREVIEW_CAREPLAN_LIST, emailOn: false, shareLinksOn: false, input: String(input) });
};

export function PreviewAgencyCareReports({ state }: { state: string }) {
  return <AgencyCareReports key={state} agencyWorkspaceId={PREVIEW_AGENCY_ID} agencyName="North Studio" initialMonth="2026-09" request={previewRequest(state)}
    initialOutcome={state === "generated-with-skips" ? PREVIEW_CAREPLAN_SKIPS : null} />;
}

export function PreviewCareReportEditor({ state }: { state: "editor" | "editor-staff" | "email-off" | "identity-unavailable" }) {
  return <CareReportEditor initial={previewAgencyView({ canWrite: state !== "editor-staff", shared: true, shareLink: state === "editor" })}
    brand={state === "identity-unavailable" ? PREVIEW_BRAND_UNAVAILABLE : PREVIEW_BRAND}
    emailOn={state === "editor"} shareLinksOn={state !== "email-off"} origin="https://app.example.test"
    request={async () => reply(400, { error: "This preview does not change anything." })} />;
}
