"use client";

import { useState } from "react";
import { ApplicationUseRenderer, type ApplicationUseDraft } from "@/experience/applications/ApplicationUseRenderer";
import { StEmpty, StHead, StNotice, StPage, StSkeleton } from "@/components/ui/strelva/Kit";
import type { ApplicationUseSnapshot } from "@/products/applications/client";

const fields = [
  { id: "name", label: "Your name", type: "text" as const, required: true },
  { id: "firm", label: "Firm or organization", type: "text" as const, required: true },
  { id: "matter", label: "What is the matter about?", type: "text" as const, required: true },
  { id: "dates", label: "Dates that could work", type: "text" as const, required: false },
];
const initialRecords = [
  { id: "preview-attorney", revision: 1, values: { name: "[Attorney name]", firm: "[Law firm]", matter: "Commercial lease dispute, two parties", dates: "Week of Oct 20" } },
  { id: "preview-director", revision: 1, values: { name: "[HR director]", firm: "[Organization]", matter: "Workplace conflict between two managers", dates: "To be agreed" } },
];

/** Render the real recipient component without any auth, network or persistence. */
export function ApplicationUseFixture({ state }: { state: string }) {
  const [records, setRecords] = useState<ApplicationUseSnapshot["records"]>(state === "empty" ? [] : initialRecords);
  const [draft, setDraft] = useState<ApplicationUseDraft>({ values: {}, recordId: "preview-new", idempotencyKey: "preview-command" });
  const [message, setMessage] = useState<string | null>(null);
  const readOnly = state === "read-only";
  const snapshot: ApplicationUseSnapshot = { workId: "5a000000-0000-4000-8000-000000000003", title: "Mediation intake", releaseVersion: 2,
    views: readOnly ? [{ kind: "list", fields }] : [{ kind: "form", fields }, { kind: "list", fields }], records,
    access: { views: readOnly ? ["list"] : ["form", "list"], recordRead: "own", recordEdit: readOnly ? "none" : "own", recordSubmit: !readOnly, expiresAt: "2099-01-01T00:00:00Z" } };
  if (state === "loading") return <StPage><StHead title="Mediation intake" /><div role="status">Opening your tool…<StSkeleton width="75%" /><StSkeleton width="50%" /></div></StPage>;
  if (state === "denied" || state === "error") return <StPage><StHead title="Mediation intake" /><div role="alert"><StNotice tone="critical">{state === "denied" ? "This tool is unavailable to your account." : "This tool could not be opened. Reload to try again."}</StNotice></div><StEmpty>No records were loaded.</StEmpty></StPage>;
  return <ApplicationUseRenderer recordSummaryField="matter" snapshot={snapshot} draft={draft} onDraftChange={setDraft} submitMessage={message} onSubmit={next => {
    const previous = records.find(record => record.id === next.recordId);
    const linkLabels = previous?.linkLabels && Object.fromEntries(Object.entries(previous.linkLabels).filter(([fieldId]) => previous.values[fieldId] === next.values[fieldId]));
    setRecords(current => [...current.filter(record => record.id !== next.recordId), { id: next.recordId, values: next.values, revision: (previous?.revision ?? 0) + 1, ...(linkLabels ? { linkLabels } : {}) }]);
    setDraft({ values: {}, recordId: `preview-${records.length + 1}`, idempotencyKey: `preview-command-${records.length + 1}` });
    setMessage(previous ? "Correction saved in this rehearsal." : "Record added in this rehearsal.");
  }} />;
}
