"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { TextInput, SelectInput } from "@/components/ui/TextInput";
import type { BusinessRecord, FactValues } from "@/platform/business-record/contracts";
import type { RecordGoogleEffect } from "@/products/publishing/record-changes";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const statusText: Record<RecordGoogleEffect["status"], string> = { needs_approval: "Waiting for your Google approval", posted: "Confirmed on Google", posted_unverified: "Google accepted it; confirmation is pending", already_approved: "Already approved; review the listing receipt", already_on_google: "Already matched Google; nothing was sent", failed: "Unapplied on Google" };

/** The record is the source of truth. Each location's Google result stays
 * separate; there is no send transport or automatic approval in this form. */
export function RecordPublishingFields({ record, approvalCopy, readOnly = false, request = fetch }: {
  record: BusinessRecord; approvalCopy?: string | null; readOnly?: boolean; request?: typeof fetch;
}) {
  const router = useRouter();
  const prior = record.facts.hours?.value as FactValues["hours"] | undefined;
  const links = (record.facts.links?.value as FactValues["links"] | undefined) ?? [];
  const [hours, setHours] = useState<FactValues["hours"]>(prior ?? { timezone: "America/New_York", weekly: [], overrides: [] });
  const [hoursChanged, setHoursChanged] = useState(false);
  const [website, setWebsite] = useState(links.find(link => link.kind === "website")?.url ?? "");
  const [revision, setRevision] = useState(record.revision);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [result, setResult] = useState<{ google: RecordGoogleEffect[]; propagationError?: string; record: { revision: number; changeCount: number } }>();
  const commandId = useRef<string | null>(null);
  function change(next: FactValues["hours"]) { setHours(next); setHoursChanged(true); commandId.current = null; }
  async function save() {
    setBusy(true); setError(""); setResult(undefined);
    try {
      const nextLinks = [...links.filter(link => link.kind !== "website"), ...(website.trim() ? [{ kind: "website" as const, url: website.trim() }] : [])];
      const facts: Record<string, { value: unknown } | null> = {};
      if (hoursChanged) facts.hours = { value: hours };
      if (website.trim() !== (links.find(link => link.kind === "website")?.url ?? "")) facts.links = nextLinks.length ? { value: nextLinks } : null;
      if (!Object.keys(facts).length) { setResult({ google: [], record: { revision, changeCount: 0 } }); return; }
      commandId.current ??= crypto.randomUUID();
      const response = await request("/api/workspace/publishing/record", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: record.workspaceId, revision, commandId: commandId.current, patch: { facts }, googleApprovalDisclosed: Boolean(approvalCopy) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Your record change could not be confirmed. Reload before trying again.");
      setResult(data.result); setRevision(data.result.record.revision); commandId.current = null;
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Your record could not be saved."); }
    finally { setBusy(false); }
  }
  const disabled = readOnly || busy;
  return <section className="grid gap-4" aria-label="Hours and website from your record">
    <div><h3 className="text-base font-medium">Hours, holiday hours and website</h3><p className="mt-2 text-sm text-gray-muted">Save these facts once. Each connected Google listing gets a proposed change. Days with no opening period are closed.</p></div>
    <form className="grid gap-4" onSubmit={event => { event.preventDefault(); void save(); }}>
      <TextInput label="Website address" type="url" value={website} disabled={disabled} onChange={event => { setWebsite(event.target.value); commandId.current = null; }} />
      <TextInput label="Time zone" value={hours.timezone} disabled={disabled} onChange={event => change({ ...hours, timezone: event.target.value })} />
      <fieldset className="grid gap-3"><legend className="mb-2 text-sm font-medium">Weekly hours</legend>
        {!hours.weekly.length ? <p className="text-sm text-gray-muted">{prior || hoursChanged ? "No opening periods. Every day is closed." : "Hours have not been recorded yet."}</p> : null}
        {hours.weekly.map((period, index) => <div key={index} className="grid gap-3 sm:grid-cols-4">
          <SelectInput label={`Day ${index + 1}`} options={days.map((label, value) => ({ label, value: String(value) }))} value={String(period.day)} disabled={disabled} onChange={event => change({ ...hours, weekly: hours.weekly.map((row, i) => i === index ? { ...row, day: Number(event.target.value) } : row) })} />
          <TextInput label={`Opens ${index + 1}`} type="time" required value={period.opens} disabled={disabled} onChange={event => change({ ...hours, weekly: hours.weekly.map((row, i) => i === index ? { ...row, opens: event.target.value } : row) })} />
          <TextInput label={`Closes ${index + 1}`} type="time" required value={period.closes} disabled={disabled} onChange={event => change({ ...hours, weekly: hours.weekly.map((row, i) => i === index ? { ...row, closes: event.target.value } : row) })} />
          <Button variant="ghost" disabled={disabled} onClick={() => change({ ...hours, weekly: hours.weekly.filter((_, i) => i !== index) })}>Remove period {index + 1}</Button>
        </div>)}
        {!readOnly ? <Button variant="secondary" disabled={disabled || hours.weekly.length >= 70} onClick={() => change({ ...hours, weekly: [...hours.weekly, { day: 1, opens: "09:00", closes: "17:00" }] })}>Add opening period</Button> : null}
      </fieldset>
      <fieldset className="grid gap-3"><legend className="mb-2 text-sm font-medium">Holiday and special hours</legend>
        {(hours.overrides ?? []).map((period, index) => <div key={index} className="grid gap-3 sm:grid-cols-4">
          <TextInput label={`Special date ${index + 1}`} type="date" required value={period.date} disabled={disabled} onChange={event => change({ ...hours, overrides: hours.overrides?.map((row, i) => i === index ? { ...row, date: event.target.value } : row) })} />
          <SelectInput label={`Hours on date ${index + 1}`} options={[{ value: "closed", label: "Closed" }, { value: "open", label: "Special hours" }]} value={period.closed ? "closed" : "open"} disabled={disabled} onChange={event => change({ ...hours, overrides: hours.overrides?.map((row, i) => i === index ? event.target.value === "closed" ? { date: row.date, closed: true } : { date: row.date, closed: false, opens: "09:00", closes: "17:00" } : row) })} />
          {!period.closed ? <><TextInput label={`Special opens ${index + 1}`} type="time" required value={period.opens || ""} disabled={disabled} onChange={event => change({ ...hours, overrides: hours.overrides?.map((row, i) => i === index ? { ...row, opens: event.target.value } : row) })} /><TextInput label={`Special closes ${index + 1}`} type="time" required value={period.closes || ""} disabled={disabled} onChange={event => change({ ...hours, overrides: hours.overrides?.map((row, i) => i === index ? { ...row, closes: event.target.value } : row) })} /></> : null}
          <Button variant="ghost" disabled={disabled} onClick={() => change({ ...hours, overrides: hours.overrides?.filter((_, i) => i !== index) })}>Remove special date {index + 1}</Button>
        </div>)}
        {!readOnly ? <Button variant="secondary" disabled={disabled || (hours.overrides?.length ?? 0) >= 366} onClick={() => change({ ...hours, overrides: [...(hours.overrides ?? []), { date: "", closed: true }] })}>Add holiday or special date</Button> : null}
      </fieldset>
      {approvalCopy ? <p className="text-sm text-gray-muted">{approvalCopy}</p> : null}
      {!readOnly ? <Button type="submit" loading={busy}>{approvalCopy ? "Save and approve Google changes" : "Save publishing facts"}</Button> : <p className="text-sm text-gray-muted">Only the owner can save and approve these facts.</p>}
    </form>
    {error ? <p role="alert" className="text-sm">{error}</p> : null}
    {result ? <div role="status" className="grid gap-2 text-sm"><p>{result.record.changeCount ? "Saved to your business record." : "Nothing changed in your record."}</p>{result.propagationError ? <p>{result.propagationError}</p> : null}<ul className="grid gap-2">{result.google.map((effect, index) => <li key={index}>{effect.locationId} · {effect.kind}: {statusText[effect.status]}.{effect.reason ? ` ${effect.reason}` : ""}</li>)}</ul><a className="underline" href={`/workspace/google?workspaceId=${record.workspaceId}`}>Review Google drafts and receipts</a></div> : null}
  </section>;
}
