"use client";

import { useState } from "react";
import { ApplicationUseRenderer, type ApplicationUseDraft } from "@/experience/applications/ApplicationUseRenderer";
import type { ApplicationUseSnapshot } from "@/products/applications/client";

const contact = "5a000000-0000-4000-8000-000000000001";
const person = "5a000000-0000-4000-8000-000000000002";
const fields = [
  { id: "business", label: "Client business", type: "text" as const, required: true },
  { id: "client", label: "Client contact", type: "contact" as const, required: true },
  { id: "handler", label: "Assigned person", type: "assigned_person" as const, required: false },
  { id: "documents", label: "Documents received", type: "boolean" as const, required: false },
];
const initialRecord = { id: "preview-record", revision: 1, values: { business: "Acme Books", client: contact, handler: person, documents: false },
  linkLabels: { client: "Pat Morgan · pat@example.test", handler: "Sam Rivera · sam@example.test" } };

/** Render the real recipient component without any auth, network or persistence. */
export function ApplicationUseFixture({ state }: { state: string }) {
  const [records, setRecords] = useState<ApplicationUseSnapshot["records"]>(state === "empty" ? [] : [initialRecord]);
  const [draft, setDraft] = useState<ApplicationUseDraft>({ values: {}, recordId: "preview-new", idempotencyKey: "preview-command" });
  const [message, setMessage] = useState<string | null>(null);
  const readOnly = state === "read-only";
  const snapshot: ApplicationUseSnapshot = { workId: "5a000000-0000-4000-8000-000000000003", title: "Bookkeeping intake", releaseVersion: 1,
    views: readOnly ? [{ kind: "list", fields }] : [{ kind: "form", fields }, { kind: "list", fields }], records,
    access: { views: readOnly ? ["list"] : ["form", "list"], recordRead: "own", recordEdit: readOnly ? "none" : "own", recordSubmit: !readOnly, expiresAt: "2099-01-01T00:00:00Z" } };
  return <ApplicationUseRenderer snapshot={snapshot} draft={draft} onDraftChange={setDraft} submitMessage={message} onSubmit={next => {
    const previous = records.find(record => record.id === next.recordId);
    const linkLabels = previous?.linkLabels && Object.fromEntries(Object.entries(previous.linkLabels).filter(([fieldId]) => previous.values[fieldId] === next.values[fieldId]));
    setRecords(current => [...current.filter(record => record.id !== next.recordId), { id: next.recordId, values: next.values, revision: (previous?.revision ?? 0) + 1, ...(linkLabels ? { linkLabels } : {}) }]);
    setDraft({ values: {}, recordId: `preview-${records.length + 1}`, idempotencyKey: `preview-command-${records.length + 1}` });
    setMessage(previous ? "Correction saved in this rehearsal." : "Record added in this rehearsal.");
  }} />;
}
