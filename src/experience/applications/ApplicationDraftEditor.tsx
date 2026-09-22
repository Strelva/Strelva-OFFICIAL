"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { SelectInput, TextArea, TextInput } from "@/components/ui/TextInput";
import { addDraftField, removeDraftField, type ApplicationDraftSpec } from "./app-templates";

type Field = ApplicationDraftSpec["fields"][number];

/** Edits only the proposal; native version and record checks still run on save. */
export function ApplicationDraftEditor({ value, onChange, disabled = false }: { value: ApplicationDraftSpec; onChange: (value: ApplicationDraftSpec) => void; disabled?: boolean }) {
  function update(id: string, field: Field) {
    onChange({ ...value, fields: value.fields.map(item => item.id === id ? field : item) });
  }
  return <section aria-label="Customize app" className="min-w-0 space-y-6">
    <TextInput label="App name" value={value.title} maxLength={160} required disabled={disabled} onChange={event => onChange({ ...value, title: event.target.value })} />
    <div className="flex items-center justify-between gap-4"><h3 className="text-base font-medium">Fields</h3><span className="text-xs tabular-nums text-gray-muted">{value.fields.length} / 30</span></div>
    <div className="space-y-4">{value.fields.map((field, index) => <fieldset key={field.id} disabled={disabled} className="min-w-0 rounded-2xl border border-gray-border p-4">
      <legend className="px-2 text-xs text-gray-muted">Field {index + 1}</legend>
      <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><TextInput label="Field name" aria-label={`Field ${index + 1} name`} value={field.label} maxLength={80} required onChange={event => update(field.id, { ...field, label: event.target.value })} /></div><IconButton label={`Remove ${field.label || `field ${index + 1}`}`} variant="ghost" disabled={disabled || value.fields.length <= 1} onClick={() => onChange(removeDraftField(value, field.id))}><Trash2 size={16} /></IconButton></div>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4"><SelectInput label="Type" aria-label={`Field ${index + 1} type`} value={field.type} options={[{ value: "text", label: "Text" }, { value: "number", label: "Number" }, { value: "select", label: "Choice" }, { value: "date", label: "Date" }, { value: "boolean", label: "Yes or no" }]} onChange={event => {
        const type = event.target.value as Field["type"];
        const common = { id: field.id, label: field.label, required: field.required };
        update(field.id, type === "select" ? { ...common, type, options: field.type === "select" ? field.options : ["Option one", "Option two"] } : { ...common, type });
      }} /><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={field.required} onChange={event => update(field.id, { ...field, required: event.target.checked })} />Required</label></div>
      {field.type === "select" ? <div className="mt-4"><TextArea label="Choices, one per line" aria-label={`Field ${index + 1} choices`} value={field.options.join("\n")} rows={3} maxLength={1600} onChange={event => update(field.id, { ...field, options: event.target.value.split("\n") })} /></div> : null}
    </fieldset>)}</div>
    <Button type="button" variant="secondary" disabled={disabled || value.fields.length >= 30} onClick={() => onChange(addDraftField(value))}><Plus size={16} aria-hidden="true" />Add field</Button>
    <p className="text-xs leading-5 text-gray-muted">Field identifiers stay stable when renamed. Test records never become live records.</p>
  </section>;
}
