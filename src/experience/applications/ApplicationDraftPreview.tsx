"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { ApplicationTemplateSpec } from "@/products/applications/templates";
import type { ApplicationUseSnapshot } from "@/products/applications/client";
import { ApplicationUseRenderer, type ApplicationUseDraft } from "./ApplicationUseRenderer";

/** This preview deliberately has no transport, grant, publication, or persistence dependency. */
export function ApplicationDraftPreview({ spec }: { spec: ApplicationTemplateSpec }) {
  return <PreviewSession key={JSON.stringify(spec)} spec={spec} />;
}

function PreviewSession({ spec }: { spec: ApplicationTemplateSpec }) {
  const [draft, setDraft] = useState<ApplicationUseDraft>({ values: {}, recordId: "preview-1", idempotencyKey: "preview-1" });
  const [records, setRecords] = useState<ApplicationUseSnapshot["records"]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [sequence, setSequence] = useState(1);
  const snapshot: ApplicationUseSnapshot = {
    workId: "local-draft-preview", title: spec.title || "Your application", releaseVersion: 1,
    views: spec.components.map(component => ({ kind: component.kind, fields: component.fields.flatMap(id => {
      const field = spec.fields.find(item => item.id === id);
      return field ? [{ ...field, label: field.label || "Untitled field" }] : [];
    }) })),
    records,
    access: { views: spec.components.map(component => component.kind), recordRead: "all", recordEdit: "all", recordSubmit: true, expiresAt: "2100-01-01T00:00:00.000Z" },
  };
  function reset() {
    setRecords([]); setDraft({ values: {}, recordId: "preview-1", idempotencyKey: "preview-1" }); setSequence(1); setMessage(null);
  }
  function submit(value: ApplicationUseDraft) {
    if (records.length >= 20 && !value.editingRecordId) { setMessage("This preview holds up to 20 test records. Clear them to try again."); return; }
    const record = { id: value.recordId, values: { ...value.values }, revision: (value.expectedRecordRevision ?? 0) + 1 };
    setRecords(current => value.editingRecordId ? current.map(item => item.id === value.editingRecordId ? record : item) : [...current, record]);
    const next = sequence + 1;
    setSequence(next);
    setDraft({ values: {}, recordId: `preview-${next}`, idempotencyKey: `preview-${next}` });
    setMessage("Test record saved in this preview only. No business record was created.");
  }
  return <section aria-label="Interactive application preview" data-application-preview className="min-w-0 overflow-hidden rounded-3xl border border-gray-border bg-surface-base">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-border px-6 py-4">
      <div><p className="text-sm font-medium text-warm-black">Interactive preview</p><p className="mt-1 text-xs leading-5 text-gray-muted">Try the form. Test records stay in this tab and reset when the design changes.</p></div>
      <Button variant="ghost" size="sm" type="button" onClick={reset}>Clear test records</Button>
    </div>
    <ApplicationUseRenderer snapshot={snapshot} draft={draft} submitMessage={message} onDraftChange={setDraft} onSubmit={submit} />
  </section>;
}
