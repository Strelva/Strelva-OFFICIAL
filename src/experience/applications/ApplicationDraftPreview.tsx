"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ApplicationUseRenderer, type ApplicationUseDraft } from "./ApplicationUseRenderer";
import type { ApplicationUseSnapshot } from "@/products/applications/client";
import type { ApplicationDraftSpec } from "./app-templates";

export function applicationPreviewSnapshot(spec: ApplicationDraftSpec, records: ApplicationUseSnapshot["records"] = []): ApplicationUseSnapshot {
  return {
    workId: "local-preview", title: spec.title || "Untitled app", releaseVersion: 0,
    views: spec.components.map(component => ({ kind: component.kind, fields: component.fields.flatMap(id => { const field = spec.fields.find(item => item.id === id); return field ? [field] : []; }) })),
    records,
    // Local renderer data, never used in a network request.
    access: { views: spec.components.map(component => component.kind), recordRead: "all", recordEdit: "none", recordSubmit: true, expiresAt: "9999-12-31T00:00:00.000Z" },
  };
}

/** Real recipient renderer. Test data stays in this component only. */
export function ApplicationDraftPreview({ spec }: { spec: ApplicationDraftSpec }) {
  return <PreviewSession key={JSON.stringify(spec)} spec={spec} />;
}

function PreviewSession({ spec }: { spec: ApplicationDraftSpec }) {
  const id = useId();
  const [records, setRecords] = useState<ApplicationUseSnapshot["records"]>([]);
  const [draft, setDraft] = useState<ApplicationUseDraft>({ values: {}, recordId: `${id}-0`, idempotencyKey: `${id}-0` });
  const [message, setMessage] = useState("");
  return <section aria-label="Interactive app preview" className="min-w-0 overflow-hidden rounded-3xl border border-gray-border bg-surface-base">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-border px-6 py-4"><div><strong className="text-sm font-medium">Try your app</strong><p className="mt-1 text-xs leading-5 text-gray-muted">Preview only. Test records are not saved or shared.</p></div><Button type="button" variant="ghost" size="sm" onClick={() => { setRecords([]); setMessage(""); setDraft({ values: {}, recordId: `${id}-0`, idempotencyKey: `${id}-0` }); }}>Reset preview</Button></header>
    <ApplicationUseRenderer presentation="preview" snapshot={applicationPreviewSnapshot(spec, records)} draft={draft} onDraftChange={setDraft} busy={records.length >= 20} submitMessage={message} onSubmit={value => {
      if (records.length >= 20) return;
      setRecords(current => [...current, { id: value.recordId, values: { ...value.values } }]);
      setDraft({ values: {}, recordId: `${id}-${records.length + 1}`, idempotencyKey: `${id}-${records.length + 1}` });
      setMessage(records.length === 19 ? "Preview limit reached. Reset to try again." : "Test record added. Nothing was saved or shared.");
    }} />
  </section>;
}
