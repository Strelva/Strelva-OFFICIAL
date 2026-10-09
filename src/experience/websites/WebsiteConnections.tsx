"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import { Button } from "@/components/ui/Button";
import { SelectInput } from "@/components/ui/TextInput";
import { websiteCapabilityOptionsSchema, type WebsiteCapabilityOptions, type WebsiteCapabilitySelection, type WebsiteRecord } from "@/products/websites/contracts";
import styles from "./website-experience.module.css";
import { beginFocusRecovery, type FocusRecovery } from "./focus-recovery";
import { parseWebsiteRecord, WebsiteExperienceError } from "./contracts";

export function WebsiteConnections({ record, disabled, onSaved, onBusyChange, headingRef, onFocusRecovery, onUnconfirmed, readOnly = false }: {
  record: WebsiteRecord;
  disabled: boolean;
  onSaved: (record: WebsiteRecord) => void;
  onBusyChange?: (busy: boolean) => void;
  headingRef?: Ref<HTMLHeadingElement>;
  onFocusRecovery?: (recovery: FocusRecovery) => void;
  onUnconfirmed?: (recovery: FocusRecovery | null) => void;
  readOnly?: boolean;
}) {
  return <WebsiteConnectionSelector workspaceId={record.workspaceId} workId={record.workId} revision={record.website.revision} selected={record.website.publishedCapabilitySelection ?? null} disabled={disabled} headingRef={headingRef} onFocusRecovery={onFocusRecovery} onBusyChange={onBusyChange} onUnconfirmed={onUnconfirmed} readOnly={readOnly} onSaved={value => onSaved(parseWebsiteRecord(value, record.workspaceId))} />;
}

export function WebsiteConnectionSelector({ workspaceId, workId, revision, selected, disabled, onSaved, onBusyChange, hosted = false, hasForms = false, headingRef, onFocusRecovery, onUnconfirmed, readOnly = false }: {
  workspaceId: string;
  workId: string;
  revision: number;
  selected: WebsiteCapabilitySelection | null;
  disabled: boolean;
  hosted?: boolean;
  hasForms?: boolean;
  onSaved: (value: unknown) => void;
  onBusyChange?: (busy: boolean) => void;
  headingRef?: Ref<HTMLHeadingElement>;
  onFocusRecovery?: (recovery: FocusRecovery) => void;
  onUnconfirmed?: (recovery: FocusRecovery | null) => void;
  readOnly?: boolean;
}) {
  const [options, setOptions] = useState<WebsiteCapabilityOptions | null>(null);
  const [tenantId, setTenantId] = useState(selected?.tenantId ?? "");
  const [inquiryId, setInquiryId] = useState(selected?.inquiryCapabilityId ?? "");
  const [bookingId, setBookingId] = useState(selected?.bookingGrantId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsReload, setNeedsReload] = useState(false);
  const unresolved = useRef(false);
  const scope = useRef({ workspaceId, workId, readOnly, permissionRevision: 0 });
  scope.current = { workspaceId, workId, readOnly, permissionRevision: scope.current.permissionRevision + Number(scope.current.readOnly !== readOnly) };
  const sectionRef = useRef<HTMLElement>(null);
  const localHeadingRef = useRef<HTMLHeadingElement>(null);
  const sourceRef = useRef<HTMLSelectElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const focusRecovery = useRef<FocusRecovery | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; focusRecovery.current?.cancel(); }; }, []);
  const endpoint = `/api/websites/${encodeURIComponent(workId)}/connections`;
  const tenant = options?.tenants.find(item => item.tenantId === tenantId);
  const locked = disabled || readOnly || busy || needsReload;

  async function request(init?: RequestInit): Promise<unknown> {
    const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store", ...init });
    const body = await response.json();
    if (!response.ok) throw new WebsiteExperienceError(typeof body?.error === "string" ? body.error : "Website forms could not be loaded. Try again.", response.status);
    return body;
  }
  useEffect(() => {
    if (locked || !focusRecovery.current) return;
    focusRecovery.current.recover(options ? (sourceRef.current ?? localHeadingRef.current) : chooseRef.current);
    focusRecovery.current = null;
  }, [locked, options]);
  async function load() {
    if (disabled || readOnly || inFlight.current || unresolved.current) return;
    inFlight.current = true;
    focusRecovery.current?.cancel();
    focusRecovery.current = beginFocusRecovery(sectionRef.current);
    setBusy(true); setError("");
    try { const next = websiteCapabilityOptionsSchema.parse(await request()); if (mounted.current) setOptions(next); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Website forms could not be loaded."); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  async function save(selection: WebsiteCapabilitySelection | null) {
    if (disabled || readOnly || inFlight.current || unresolved.current) return;
    inFlight.current = true;
    focusRecovery.current?.cancel();
    focusRecovery.current = beginFocusRecovery(sectionRef.current);
    const started = { ...scope.current };
    setBusy(true); setError(""); onBusyChange?.(true);
    let acknowledged = false;
    try {
      const next = await request({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision: revision, selection }) });
      acknowledged = true;
      if ((next as { workId?: unknown })?.workId !== workId || (next as { workspaceId?: unknown })?.workspaceId !== workspaceId) throw new WebsiteExperienceError("The response belongs to a different website. Reload your saved work.", 200);
      if (mounted.current && scope.current.workspaceId === started.workspaceId && scope.current.workId === started.workId) {
        if (scope.current.permissionRevision !== started.permissionRevision) throw new Error("Access changed while saving visitor forms.");
        onSaved(next);
        // The parent owns recovery when a new revision remounts this selector.
        if (onFocusRecovery && focusRecovery.current) {
          onFocusRecovery(focusRecovery.current);
          focusRecovery.current = null;
        }
        setOptions(null);
      }
    } catch (cause) {
      if (mounted.current && scope.current.workspaceId === started.workspaceId && scope.current.workId === started.workId) {
        const refused = !acknowledged && cause instanceof WebsiteExperienceError && (
          cause.status === 400 && cause.message === "Check the website connection selection." ||
          cause.status === 401 && cause.message === "Sign in to change website connections."
        );
        if (refused) setError(cause.message);
        else {
          unresolved.current = true; setNeedsReload(true);
          const reason = cause instanceof WebsiteExperienceError && [200,403,409].includes(cause.status ?? 0) ? `${cause.message} ` : "";
          setError(`${reason}The visitor form change could not be confirmed. Reload the current saved website before continuing.`);
          onUnconfirmed?.(focusRecovery.current);
          focusRecovery.current = null;
        }
      }
    }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); onBusyChange?.(false); }
  }

  return <section ref={sectionRef} className={styles.requestCard} aria-label="Website visitor forms" aria-busy={busy || undefined}>
    <h2 ref={node => { localHeadingRef.current = node; if (typeof headingRef === "function") headingRef(node); else if (headingRef) headingRef.current = node; }} tabIndex={-1} className="text-lg font-medium">Visitor forms</h2>
    <p className="text-sm text-gray-muted">Choose a published inquiry form or booking calendar for this website. Updating forms creates a new preview for approval.</p>
    {selected ? <p className="text-sm">{selected.inquiryCapabilityId ? "Inquiry form selected. " : ""}{selected.bookingGrantId ? "Booking calendar selected." : ""}</p> : <p className="text-sm text-gray-muted">{hasForms ? "Native visitor forms are present in this preview." : "No forms selected."}</p>}
    {error ? <p role="alert" className="text-sm text-critical">{error}</p> : null}
    {!options ? <div className={styles.actions}><Button ref={chooseRef} type="button" variant="secondary" disabled={locked} loading={busy} onClick={() => void load()}>{error ? "Try loading forms again" : "Choose forms"}</Button></div> : options.tenants.length === 0 ? <p role="status" className="text-sm text-gray-muted">No published forms are available from websites connected to this business.</p> : <>
      <SelectInput ref={sourceRef} label="Connected website" value={tenantId} disabled={locked} options={[{ value: "", label: "Choose a website" }, ...options.tenants.map(item => ({ value: item.tenantId, label: item.siteName }))]} onChange={event => { setTenantId(event.target.value); setInquiryId(""); setBookingId(""); }} />
      {tenant ? <div className={styles.formGrid}>
        <SelectInput label="Inquiry form" value={inquiryId} disabled={locked} options={[{ value: "", label: "Do not add an inquiry form" }, ...tenant.inquiry.map(item => ({ value: item.capabilityId, label: item.name }))]} onChange={event => setInquiryId(event.target.value)} />
        <SelectInput label="Booking calendar" value={bookingId} disabled={locked} options={[{ value: "", label: "Do not add a booking calendar" }, ...tenant.booking.map(item => ({ value: item.grantId, label: `${item.name} · ${item.provider === "outlook" ? "Outlook" : "Google"}` }))]} onChange={event => setBookingId(event.target.value)} />
      </div> : null}
      <div className={styles.actions}><Button type="button" disabled={locked || !tenant || (!inquiryId && !bookingId)} loading={busy} onClick={() => void save({ tenantId, ...(inquiryId ? { inquiryCapabilityId: inquiryId } : {}), ...(bookingId ? { bookingGrantId: bookingId } : {}) })}>Update website preview</Button></div>
    </>}
    {options ? <div className={styles.actions}><Button type="button" variant="secondary" disabled={locked} onClick={() => void load()}>Refresh available forms</Button></div> : null}
    {selected || hasForms ? <div className={styles.actions}><Button type="button" variant="secondary" disabled={locked} onClick={() => void save(null)}>Remove forms from this draft</Button></div> : null}
    <p className="text-xs text-gray-muted">The private preview does not submit forms. {hosted ? "The hosted website uses the selected published connections after approval." : "The downloaded website uses the selected published connections."}</p>
  </section>;
}
