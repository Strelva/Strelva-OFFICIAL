"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { TextInput, TextArea, SelectInput } from "@/components/ui/TextInput";
import { factValueSchemas, serviceOperationSchema, type BusinessRecord, type BusinessRecordPatch, type FactValues } from "@/platform/business-record/contracts";
import type { RecordGoogleEffect } from "@/products/publishing/client";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const statusText: Record<RecordGoogleEffect["status"], string> = { needs_approval: "Waiting for your Google approval", posted: "Confirmed on Google", posted_unverified: "Google accepted it; confirmation is pending", write_unconfirmed: "Google's result is unknown; review before trying again", already_approved: "Already approved; review the listing receipt", already_on_google: "Already matched Google; nothing was sent", failed: "Unapplied on Google" };

const nativeReasonText: Record<string, string> = {
  record_moved: "The business details changed again before the website draft was prepared",
  not_allowed: "Website access needs checking",
  queue_unavailable: "Website review is temporarily unavailable",
  draft_held: "An existing website draft needs review first",
  changed_before_dispatch: "The website changed before this draft could be prepared",
  not_queued: "The website draft could not be queued for review",
  failed: "The website draft could not be prepared",
  already_claimed: "An earlier preparation attempt needs checking",
  facts_unconfirmed: "The selected business facts need confirmation",
};

type ServiceDraft = { id: string; name: string; description: string; priceText: string; durationMinutes: string };
type SaveResult = {
  google: RecordGoogleEffect[];
  propagationError?: string;
  record: { revision: number; changeCount: number };
  native?: { ready: string[]; needsReview: Array<{ tenantId: string; reason: string; reported: boolean }> };
  nativePropagationError?: string;
};

function serviceDraft(service: BusinessRecord["services"][number]): ServiceDraft {
  return { id: service.id, name: service.name, description: service.description ?? "", priceText: service.priceText ?? "", durationMinutes: service.durationMinutes?.toString() ?? "" };
}

/** Each save changes the record. Website effects prepare reviewed drafts only;
 * Google results remain separate and keep their existing approval boundary. */
export function RecordPublishingFields({ record, approvalCopy, readOnly = false, request = fetch, endpoint = "/api/workspace/publishing/record", googleEnabled = true }: {
  record: BusinessRecord; approvalCopy?: string | null; readOnly?: boolean; request?: typeof fetch; endpoint?: string; googleEnabled?: boolean;
}) {
  const router = useRouter();
  const canEdit = !readOnly && record.access === "owner";
  const [baseline, setBaseline] = useState({
    hours: record.facts.hours?.value as FactValues["hours"] | undefined,
    links: (record.facts.links?.value as FactValues["links"] | undefined) ?? [],
    services: record.services,
  });
  const [hours, setHours] = useState<FactValues["hours"]>(baseline.hours ?? { timezone: "America/New_York", weekly: [], overrides: [] });
  const [hoursChanged, setHoursChanged] = useState(false);
  const [website, setWebsite] = useState(baseline.links.find(link => link.kind === "website")?.url ?? "");
  const [services, setServices] = useState(() => record.services.map(serviceDraft));
  const [revision, setRevision] = useState(record.revision);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SaveResult>();
  // A lost acknowledgment may already have committed. Retry the exact command
  // until its payload changes; never create a second identity for the same save.
  const pending = useRef<{ payload: string; commandId: string } | null>(null);
  // An ordinary details save can refresh this sibling editor. Adopt that newer
  // record only while pristine; unsaved input keeps its original conflict pin.
  if (record.revision > revision && !hoursChanged
    && website === (baseline.links.find(link => link.kind === "website")?.url ?? "")
    && JSON.stringify(services) === JSON.stringify(baseline.services.map(serviceDraft))) {
    const nextHours = record.facts.hours?.value as FactValues["hours"] | undefined;
    const nextLinks = (record.facts.links?.value as FactValues["links"] | undefined) ?? [];
    setBaseline({ hours: nextHours, links: nextLinks, services: record.services });
    setHours(nextHours ?? { timezone: "America/New_York", weekly: [], overrides: [] });
    setWebsite(nextLinks.find(link => link.kind === "website")?.url ?? "");
    setServices(record.services.map(serviceDraft)); setRevision(record.revision);
  }
  function change(next: FactValues["hours"]) { setHours(next); setHoursChanged(true); setResult(undefined); }
  function changeService(id: string, update: Partial<ServiceDraft>) {
    setServices(current => current.map(service => service.id === id ? { ...service, ...update, id } : service));
    setResult(undefined);
  }
  async function save() {
    if (!canEdit || inFlight.current) return;
    setError("");
    const current = baseline;
    const facts: NonNullable<BusinessRecordPatch["facts"]> = {};
    const operations: NonNullable<BusinessRecordPatch["services"]> = [];
    let nextLinks = current.links;
    if (hoursChanged && JSON.stringify(hours) !== JSON.stringify(current.hours)) {
      if (!factValueSchemas.hours.safeParse(hours).success) { setError("Check your hours. Use a time zone, opening times before closing times, and a valid date for each exception."); return; }
      try { new Intl.DateTimeFormat("en", { timeZone: hours.timezone }); }
      catch { setError("Use a valid time zone, such as America/New_York."); return; }
      facts.hours = { value: hours };
    }
    if (website.trim() !== (current.links.find(link => link.kind === "website")?.url ?? "")) {
      // Preserve labels and all other links when the website address changes.
      let replaced = false;
      nextLinks = current.links.flatMap(link => {
        if (link.kind !== "website") return [link];
        if (replaced || !website.trim()) return [];
        replaced = true;
        return [{ ...link, url: website.trim() }];
      });
      if (website.trim() && !replaced) nextLinks.push({ kind: "website", url: website.trim() });
      if (nextLinks.length && !factValueSchemas.links.safeParse(nextLinks).success) { setError("Use a full website address beginning with https:// or http://."); return; }
      facts.links = nextLinks.length ? { value: nextLinks } : null;
    }
    for (const draft of services) {
      const prior = current.services.find(service => service.id === draft.id);
      if (!prior) { setError("This service is no longer in the business record. Reload before saving."); return; }
      const edited = { name: draft.name.trim(), description: draft.description.trim() || null, priceText: draft.priceText.trim() || null, durationMinutes: draft.durationMinutes.trim() ? Number(draft.durationMinutes) : null };
      if (edited.name === prior.name && edited.description === prior.description && edited.priceText === prior.priceText && edited.durationMinutes === prior.durationMinutes) continue;
      const operation = serviceOperationSchema.safeParse({ op: "upsert", id: prior.id, ...edited, active: prior.active, position: prior.position, externalRef: prior.externalRef, verified: prior.verified });
      if (!operation.success) { setError(`Check ${prior.name || "this service"}: a name is required (up to 160 characters), description is limited to 2,000 characters, price to 80 characters, and duration must be 1 to 1,440 whole minutes or blank.`); return; }
      operations.push(operation.data);
    }
    if (!Object.keys(facts).length && !operations.length) {
      setResult(previous => previous ?? { google: [], record: { revision, changeCount: 0 } });
      return;
    }
    const patch: BusinessRecordPatch = { ...(Object.keys(facts).length ? { facts } : {}), ...(operations.length ? { services: operations } : {}) };
    const payload = JSON.stringify({ workspaceId: record.workspaceId, revision, patch, googleApprovalDisclosed: googleEnabled && Boolean(approvalCopy) });
    if (pending.current?.payload !== payload) pending.current = { payload, commandId: crypto.randomUUID() };
    inFlight.current = true;
    setBusy(true); setResult(undefined);
    try {
      const response = await request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...JSON.parse(payload), commandId: pending.current.commandId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Your record change could not be confirmed. Your edits are kept; reload before trying again.");
      const saved = data.result as SaveResult | undefined;
      if (!saved || !Number.isInteger(saved.record?.revision) || saved.record.revision < revision || !Number.isInteger(saved.record?.changeCount) || !Array.isArray(saved.google)) {
        throw new Error("Your record change could not be confirmed. Your edits are kept; retry to check the same save.");
      }
      const nextServices = current.services.map(service => {
        const operation = operations.find(item => item.op === "upsert" && item.id === service.id);
        if (!operation || operation.op !== "upsert") return service;
        return { ...service, name: operation.name, description: operation.description ?? null, priceText: operation.priceText ?? null, durationMinutes: operation.durationMinutes ?? null };
      });
      setBaseline({ hours: facts.hours ? hours : current.hours, links: nextLinks, services: nextServices });
      setHoursChanged(false); setWebsite(website.trim()); setServices(nextServices.map(serviceDraft));
      setResult(saved); setRevision(saved.record.revision); pending.current = null;
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Your record could not be saved. Your edits are kept."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const disabled = !canEdit || busy;
  return <section className="grid gap-4" aria-label="Hours, services and website from your record">
    <div><h3 className="text-base font-medium">Hours, holiday hours, services and website</h3><p className="mt-2 text-sm text-gray-muted">Save these facts to your business record. Mapped website changes become drafts for review; saving does not publish your website.{googleEnabled ? " Google changes are reported separately." : ""} Days with no opening period are closed.</p></div>
    <form className="grid gap-4" onSubmit={event => { event.preventDefault(); void save(); }}>
      <TextInput label="Website address" type="url" value={website} disabled={disabled} maxLength={2048} onChange={event => { setWebsite(event.target.value); setResult(undefined); }} />
      <TextInput label="Time zone" maxLength={64} value={hours.timezone} disabled={disabled} onChange={event => change({ ...hours, timezone: event.target.value })} />
      <fieldset className="grid gap-3"><legend className="mb-2 text-sm font-medium">Weekly hours</legend>
        {!hours.weekly.length ? <p className="text-sm text-gray-muted">{baseline.hours || hoursChanged ? "No opening periods. Every day is closed." : "Hours have not been recorded yet."}</p> : null}
        {hours.weekly.map((period, index) => <div key={index} className="grid gap-3 sm:grid-cols-4">
          <SelectInput label={`Day ${index + 1}`} options={days.map((label, value) => ({ label, value: String(value) }))} value={String(period.day)} disabled={disabled} onChange={event => change({ ...hours, weekly: hours.weekly.map((row, i) => i === index ? { ...row, day: Number(event.target.value) } : row) })} />
          <TextInput label={`Opens ${index + 1}`} type="time" required value={period.opens} disabled={disabled} onChange={event => change({ ...hours, weekly: hours.weekly.map((row, i) => i === index ? { ...row, opens: event.target.value } : row) })} />
          <TextInput label={`Closes ${index + 1}`} type="time" required value={period.closes} disabled={disabled} onChange={event => change({ ...hours, weekly: hours.weekly.map((row, i) => i === index ? { ...row, closes: event.target.value } : row) })} />
          <Button type="button" variant="ghost" disabled={disabled} onClick={() => change({ ...hours, weekly: hours.weekly.filter((_, i) => i !== index) })}>Remove period {index + 1}</Button>
        </div>)}
        {canEdit ? <Button type="button" variant="secondary" disabled={disabled || hours.weekly.length >= 70} onClick={() => change({ ...hours, weekly: [...hours.weekly, { day: 1, opens: "09:00", closes: "17:00" }] })}>Add opening period</Button> : null}
      </fieldset>
      <fieldset className="grid gap-3"><legend className="mb-2 text-sm font-medium">Holiday and special hours</legend>
        {(hours.overrides ?? []).map((period, index) => <div key={index} className="grid gap-3 sm:grid-cols-4">
          <TextInput label={`Special date ${index + 1}`} type="date" required value={period.date} disabled={disabled} onChange={event => change({ ...hours, overrides: hours.overrides?.map((row, i) => i === index ? { ...row, date: event.target.value } : row) })} />
          <SelectInput label={`Hours on date ${index + 1}`} options={[{ value: "closed", label: "Closed" }, { value: "open", label: "Special hours" }]} value={period.closed ? "closed" : "open"} disabled={disabled} onChange={event => change({ ...hours, overrides: hours.overrides?.map((row, i) => i === index ? event.target.value === "closed" ? { date: row.date, ...(row.label ? { label: row.label } : {}), closed: true } : { ...row, closed: false, opens: "09:00", closes: "17:00" } : row) })} />
          {!period.closed ? <><TextInput label={`Special opens ${index + 1}`} type="time" required value={period.opens || ""} disabled={disabled} onChange={event => change({ ...hours, overrides: hours.overrides?.map((row, i) => i === index ? { ...row, opens: event.target.value } : row) })} /><TextInput label={`Special closes ${index + 1}`} type="time" required value={period.closes || ""} disabled={disabled} onChange={event => change({ ...hours, overrides: hours.overrides?.map((row, i) => i === index ? { ...row, closes: event.target.value } : row) })} /></> : null}
          <Button type="button" variant="ghost" disabled={disabled} onClick={() => change({ ...hours, overrides: hours.overrides?.filter((_, i) => i !== index) })}>Remove special date {index + 1}</Button>
        </div>)}
        {canEdit ? <Button type="button" variant="secondary" disabled={disabled || (hours.overrides?.length ?? 0) >= 366} onClick={() => change({ ...hours, overrides: [...(hours.overrides ?? []), { date: "", closed: true }] })}>Add holiday or special date</Button> : null}
      </fieldset>
      <fieldset id="services" className="grid gap-4 scroll-mt-8"><legend className="mb-2 text-sm font-medium">Services</legend>
        {!services.length ? <p className="text-sm text-gray-muted">No services have been recorded yet.</p> : null}
        {services.map((service, index) => <div key={service.id} className="grid gap-3 border-t border-gray-border pt-4">
          <p className="text-sm font-medium">Service {index + 1}{baseline.services.find(item => item.id === service.id)?.active === false ? " · Inactive" : ""}</p>
          <TextInput label={`Service name ${index + 1}`} required maxLength={160} value={service.name} disabled={disabled} onChange={event => changeService(service.id, { name: event.target.value })} />
          <TextArea label={`Service description ${index + 1}`} maxLength={2000} value={service.description} disabled={disabled} onChange={event => changeService(service.id, { description: event.target.value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label={`Service price ${index + 1}`} maxLength={80} value={service.priceText} disabled={disabled} onChange={event => changeService(service.id, { priceText: event.target.value })} />
            <TextInput label={`Service duration in minutes ${index + 1}`} type="number" min={1} max={1440} step={1} value={service.durationMinutes} disabled={disabled} onChange={event => changeService(service.id, { durationMinutes: event.target.value })} />
          </div>
        </div>)}
      </fieldset>
      {googleEnabled && approvalCopy ? <p className="text-sm text-gray-muted">{approvalCopy}</p> : null}
      {canEdit ? <Button type="submit" loading={busy}>{googleEnabled && approvalCopy ? "Save and approve Google changes" : "Save hours, services and website"}</Button> : <p className="text-sm text-gray-muted">Only the owner can change these facts.</p>}
    </form>
    {error ? <p role="alert" className="text-sm">{error}</p> : null}
    {result ? <div role="status" className="grid gap-2 break-words text-sm">
      <p>{result.record.changeCount ? "Saved to your business record." : "Nothing changed in your record."}</p>
      {result.native?.ready.length ? <p>Website details matched or prepared for review: {result.native.ready.join(", ")}. Your live website is unchanged.</p> : null}
      {result.native?.needsReview.length ? <ul className="grid gap-2">{result.native.needsReview.map(item => <li key={`${item.tenantId}:${item.reason}`}>Website review is still needed for {item.tenantId}: {nativeReasonText[item.reason] ?? "The saved details need checking before a website draft can be prepared"}.{!item.reported ? " The review request could not be confirmed." : ""} Your live website is unchanged.</li>)}</ul> : null}
      {result.nativePropagationError ? <p>Website draft preparation could not be confirmed. {result.nativePropagationError} Your live website is unchanged.</p> : null}
      {result.propagationError ? <p>{result.propagationError}</p> : null}
      {result.google.length ? <ul className="grid gap-2">{result.google.map((effect, index) => <li key={index}>{effect.locationId} · {effect.kind}: {statusText[effect.status]}.{effect.reason ? ` ${effect.reason}` : ""}</li>)}</ul> : null}
      {googleEnabled ? <a className="underline" href={`/workspace/google?workspaceId=${encodeURIComponent(record.workspaceId)}`}>Review Google drafts and receipts</a> : null}
    </div> : null}
  </section>;
}
