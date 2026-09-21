"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SelectInput } from "@/components/ui/TextInput";
import { websiteCapabilityOptionsSchema, type WebsiteCapabilityOptions, type WebsiteCapabilitySelection, type WebsiteRecord } from "@/products/websites/contracts";
import styles from "./website-experience.module.css";
import { parseWebsiteRecord } from "./contracts";

export function WebsiteConnections({ record, disabled, onSaved, onBusyChange }: {
  record: WebsiteRecord;
  disabled: boolean;
  onSaved: (record: WebsiteRecord) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const selected = record.website.publishedCapabilitySelection;
  const [options, setOptions] = useState<WebsiteCapabilityOptions | null>(null);
  const [tenantId, setTenantId] = useState(selected?.tenantId ?? "");
  const [inquiryId, setInquiryId] = useState(selected?.inquiryCapabilityId ?? "");
  const [bookingId, setBookingId] = useState(selected?.bookingGrantId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const endpoint = `/api/websites/${encodeURIComponent(record.workId)}/connections`;
  const tenant = options?.tenants.find(item => item.tenantId === tenantId);
  const locked = disabled || busy;

  async function request(init?: RequestInit): Promise<unknown> {
    const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store", ...init });
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "Website forms could not be loaded. Try again.");
    return body;
  }
  async function load() {
    setBusy(true); setError("");
    try { const next = websiteCapabilityOptionsSchema.parse(await request()); if (mounted.current) setOptions(next); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Website forms could not be loaded."); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function save(selection: WebsiteCapabilitySelection | null) {
    setBusy(true); setError(""); onBusyChange?.(true);
    try {
      const next = parseWebsiteRecord(await request({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision: record.website.revision, selection }) }), record.workspaceId);
      if (next.workId !== record.workId || next.workspaceId !== record.workspaceId) throw new Error("The response belongs to a different website. Reload your saved work.");
      if (mounted.current) { setOptions(null); onSaved(next); }
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Website forms could not be saved. Your selection is unchanged."); }
    finally { if (mounted.current) setBusy(false); onBusyChange?.(false); }
  }

  return <section className={styles.requestCard} aria-label="Website visitor forms" aria-busy={busy || undefined}>
    <h2 className="text-lg font-medium">Visitor forms</h2>
    <p className="text-sm text-gray-muted">Choose a published inquiry form or booking calendar for this website. Updating forms creates a new preview for approval.</p>
    {selected ? <p className="text-sm">{selected.inquiryCapabilityId ? "Inquiry form selected. " : ""}{selected.bookingGrantId ? "Booking calendar selected." : ""}</p> : <p className="text-sm text-gray-muted">No forms selected.</p>}
    {error ? <p role="alert" className="text-sm text-critical">{error}</p> : null}
    {!options ? <div className={styles.actions}><Button type="button" variant="secondary" disabled={locked} loading={busy} onClick={() => void load()}>{error ? "Try loading forms again" : "Choose forms"}</Button></div> : options.tenants.length === 0 ? <p role="status" className="text-sm text-gray-muted">No published forms are available from websites connected to this business.</p> : <>
      <SelectInput label="Connected website" value={tenantId} disabled={locked} options={[{ value: "", label: "Choose a website" }, ...options.tenants.map(item => ({ value: item.tenantId, label: item.siteName }))]} onChange={event => { setTenantId(event.target.value); setInquiryId(""); setBookingId(""); }} />
      {tenant ? <div className={styles.formGrid}>
        <SelectInput label="Inquiry form" value={inquiryId} disabled={locked} options={[{ value: "", label: "Do not add an inquiry form" }, ...tenant.inquiry.map(item => ({ value: item.capabilityId, label: item.name }))]} onChange={event => setInquiryId(event.target.value)} />
        <SelectInput label="Booking calendar" value={bookingId} disabled={locked} options={[{ value: "", label: "Do not add a booking calendar" }, ...tenant.booking.map(item => ({ value: item.grantId, label: `${item.name} · ${item.provider === "outlook" ? "Outlook" : "Google"}` }))]} onChange={event => setBookingId(event.target.value)} />
      </div> : null}
      <div className={styles.actions}><Button type="button" disabled={locked || !tenant || (!inquiryId && !bookingId)} loading={busy} onClick={() => void save({ tenantId, ...(inquiryId ? { inquiryCapabilityId: inquiryId } : {}), ...(bookingId ? { bookingGrantId: bookingId } : {}) })}>Update website preview</Button></div>
    </>}
    {options ? <div className={styles.actions}><Button type="button" variant="secondary" disabled={locked} onClick={() => void load()}>Refresh available forms</Button></div> : null}
    {selected ? <div className={styles.actions}><Button type="button" variant="secondary" disabled={locked} onClick={() => void save(null)}>Remove forms from this draft</Button></div> : null}
    <p className="text-xs text-gray-muted">The private preview does not submit forms. The downloaded website uses the selected published connections.</p>
  </section>;
}
