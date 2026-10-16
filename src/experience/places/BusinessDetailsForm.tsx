"use client";
/**
 * XA · R1 business record rows. Hours leads as the page's one large object:
 * the usual week, one run per line, and the next special day. Every other
 * detail is one open row: what it is, what it says, which Systems read it
 * (only when the System graph says so), who said it, and what pressing the
 * row does ("Change", or "Add" when nothing is recorded). Pressing a row opens
 * that one detail in place; Save submits only that field through the page's
 * server action with the exact record revision, so a conflict is still caught
 * by the SQL. No modal, no ledger, no receipt.
 */
import { useState, type ReactNode } from "react";
import { XaButton, XaField, XaSystemTile, XaTextArea } from "@/components/ui/strelva/Xa";
import type { BusinessRecord, FactValues } from "@/platform/business-record/contracts";
import { DETAIL_LABELS, EDITABLE_DETAILS, detailText, type EditableDetail } from "@/platform/business-record/details";
import { GOOGLE_APPROVAL_LINE, nextSpecialDay, saidBy, weeklyLines } from "@/experience/record/record-words";
import styles from "@/experience/record/record.module.css";

/** Systems that read a fact, by fact key. Only pass what is actually known. */
export type RecordReaders = Partial<Record<string, readonly { kind: string; name: string }[]>>;

const HINTS: Partial<Record<EditableDetail, string>> = {
  phone: "The number visitors call.",
  email: "The address visitors write to.",
  owner_recipient: "Strelva sends your reports and alerts here.",
  insurance_accepted: "One plan per line, the way patients say it. Your new-patient form lists these.",
};

const SHOWN_LABEL: Partial<Record<EditableDetail, string>> = { insurance_accepted: "Insurance" };

/** What an empty row is for, said once in place of a repeated "not recorded". */
const EMPTY_SAYS: Record<EditableDetail, string> = {
  display_name: "The name customers know you by.",
  phone: "The number visitors call.",
  email: "The address visitors write to.",
  description: "A sentence or two about what you do.",
  owner_recipient: "Where Strelva sends your reports and alerts.",
  insurance_accepted: "The plans you take, the way patients say them.",
};

export function BusinessDetailsForm({ record, workspaceId, readOnly, approvalCopy, action, showInsurance = false, readers, hoursHref, agencyName, now, invalid }: {
  record: BusinessRecord; workspaceId: string; readOnly: boolean; approvalCopy?: string | null; action?: (formData: FormData) => Promise<void>;
  /** Dental intake may be on: show the insurance plans row. */
  showInsurance?: boolean;
  /** Which Systems read each fact. Omitted when unknown, and then the column is not drawn. */
  readers?: RecordReaders;
  /** Where the hours row opens (XA · R2). Absent when hours can't be changed here. */
  hoursHref?: string;
  agencyName?: string | null;
  now?: Date;
  /** The field the last save refused, with why, shown under that row. */
  invalid?: { field: EditableDetail; message: string } | null;
}) {
  const [editing, setEditing] = useState<EditableDetail | null>(invalid?.field ?? null);
  const shown = EDITABLE_DETAILS.filter(key => key !== "insurance_accepted" || showInsurance);
  const hasReaders = Boolean(readers && Object.keys(readers).length);
  const hours = record.facts.hours?.value as FactValues["hours"] | undefined;
  const address = record.facts.address?.value as FactValues["address"] | undefined;
  const services = record.services.filter(service => service.active);
  const said = (fact: { source?: string; updatedAt?: string } | undefined) => saidBy(fact?.source, fact?.updatedAt, { agencyName, now });
  const columns = hasReaders ? undefined : "off";

  return <div className={styles.table} role="table" aria-label="Business record">
    <div className={styles.tableHead} role="row" data-readers={columns}>
      <span role="columnheader">Detail</span>{hasReaders ? <span role="columnheader">Read by</span> : null}<span role="columnheader">Said by</span><span role="columnheader" className={styles.srOnly}>Change</span>
    </div>
    {hours || (hoursHref && !readOnly) ? <HoursRow hours={hours} href={readOnly ? undefined : hoursHref} readers={readers?.hours} hasReaders={hasReaders} said={hours ? said(record.facts.hours) : ""} now={now} /> : null}
    {shown.map(key => <DetailRow key={key} detail={key} record={record} workspaceId={workspaceId} readOnly={readOnly || !action} approvalCopy={approvalCopy} action={action}
      editing={editing === key} onEdit={() => setEditing(key)} onClose={() => setEditing(null)} readers={readers?.[key]} hasReaders={hasReaders} said={said(record.facts[key])}
      error={invalid?.field === key ? invalid.message : undefined} />)}
    {address ? <StaticRow label="Address" value={address.formatted ?? [address.line1, address.line2, address.city, address.region, address.postalCode].filter(Boolean).join(", ")} readers={readers?.address} hasReaders={hasReaders} said={said(record.facts.address)} /> : null}
    {services.length ? <StaticRow label="Services" value={services.map(service => service.priceText ? `${service.name} (${service.priceText})` : service.name).join(", ")} readers={readers?.services} hasReaders={hasReaders} said={saidBy(services[0]?.source, services.reduce((latest, service) => service.updatedAt > latest ? service.updatedAt : latest, services[0]?.updatedAt ?? ""), { agencyName, now })} /> : null}
  </div>;
}

/** Labelled in place on phone, where the column head is gone. */
function Readers({ list }: { list?: readonly { kind: string; name: string }[] }) {
  if (!list?.length) return <span className={styles.readers} data-none aria-label="No System reads this yet" />;
  return <span className={styles.readers} aria-label={`Read by ${list.map(item => item.name).join(", ")}`}>
    <span className={styles.readersLabel} aria-hidden="true">Read by</span>
    {list.map(item => <span key={item.name} title={item.name}><XaSystemTile kind={item.kind} size={26} /></span>)}
  </span>;
}

/** What pressing the row does. Quiet until hover or focus on desktop; always shown on phone and for empty rows. */
function RowAction({ word }: { word: string | null }) {
  return <span role="cell" className={styles.rowAction} aria-hidden="true">{word}</span>;
}

function HoursRow({ hours, href, readers, hasReaders, said, now }: { hours?: FactValues["hours"]; href?: string; readers?: readonly { kind: string; name: string }[]; hasReaders: boolean; said: string; now?: Date }) {
  const lines = hours ? weeklyLines(hours.weekly) : [];
  const special = hours ? nextSpecialDay(hours.overrides, now) : null;
  const value = lines.length ? lines.join(" · ") : "Not recorded yet";
  const body = <>
    <span className={styles.factLabel}>Hours</span>
    {lines.length ? <span className={styles.heroLines}>{lines.map(line => <span key={line}>{line}</span>)}</span> : <span className={styles.factValue} data-empty>When you are open, each day.</span>}
    {special ? <span className={styles.heroSpecial}>Next special day: {special}</span> : null}
  </>;
  return <div className={styles.detail} role="row" data-hero data-readers={hasReaders ? undefined : "off"} data-empty={!lines.length || undefined}>
    <span role="cell">{href ? <a className={styles.rowButton} href={href} aria-label={`${lines.length ? "Change hours" : "Add your hours"}: ${value}${special ? `. Next special day ${special}` : ""}`}>{body}</a> : <span className={styles.rowButton} data-static>{body}</span>}</span>
    {hasReaders ? <span role="cell"><Readers list={readers} /></span> : null}
    <span role="cell" className={styles.saidBy}>{said}</span>
    <RowAction word={href ? lines.length ? "Change" : "Add" : null} />
  </div>;
}

function StaticRow({ label, value, readers, hasReaders, said }: { label: string; value: string; readers?: readonly { kind: string; name: string }[]; hasReaders: boolean; said: ReactNode }) {
  return <div className={styles.detail} role="row" data-readers={hasReaders ? undefined : "off"}>
    <span role="cell"><span className={styles.rowButton} data-static><span className={styles.factLabel}>{label}</span><span className={styles.factValue}>{value}</span></span></span>
    {hasReaders ? <span role="cell"><Readers list={readers} /></span> : null}
    <span role="cell" className={styles.saidBy}>{said}</span>
    <RowAction word={null} />
  </div>;
}

function DetailRow({ detail, record, workspaceId, readOnly, approvalCopy, action, editing, onEdit, onClose, readers, hasReaders, said, error }: {
  detail: EditableDetail; record: BusinessRecord; workspaceId: string; readOnly: boolean; approvalCopy?: string | null; action?: (formData: FormData) => Promise<void>;
  editing: boolean; onEdit: () => void; onClose: () => void; readers?: readonly { kind: string; name: string }[]; hasReaders: boolean; said: string; error?: string;
}) {
  const initial = detailText(record, detail);
  const [value, setValue] = useState(initial);
  const label = SHOWN_LABEL[detail] ?? DETAIL_LABELS[detail];
  const shownValue = detail === "insurance_accepted" ? initial.split("\n").filter(Boolean).join(", ") : initial;
  const changed = value !== initial;
  const control = detail === "insurance_accepted" || detail === "description"
    ? <XaTextArea name={detail} label={label} value={value} rows={detail === "description" ? 4 : 5} maxLength={detail === "description" ? 2000 : 8000} onChange={event => setValue(event.target.value)} hint={error ? undefined : HINTS[detail]} error={error} autoFocus />
    : <XaField name={detail} label={label} value={value} type={detail === "phone" ? "tel" : detail === "email" || detail === "owner_recipient" ? "email" : "text"} maxLength={254} autoComplete="off" onChange={event => setValue(event.target.value)} hint={error ? undefined : HINTS[detail]} error={error} autoFocus />;

  if (editing && !readOnly) return <div className={styles.detail} role="row" data-editing data-readers={hasReaders ? undefined : "off"}>
    <form className={styles.edit} action={action} role="cell">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="revision" value={record.revision} />
      {approvalCopy ? <input type="hidden" name="googleApprovalDisclosed" value="1" /> : null}
      {control}
      <p className={styles.saidLine}>{initial ? `Was “${shownValue}”. ${said}.` : "Nothing was recorded before."}{approvalCopy ? ` ${GOOGLE_APPROVAL_LINE}` : ""}</p>
      <div className={styles.editActions}>
        <XaButton type="submit" variant="primary" disabled={!changed} hint={changed ? undefined : `Type a new ${label.toLowerCase()} to save`}>Save {label.toLowerCase()}</XaButton>
        <XaButton variant="quiet" onClick={() => { setValue(initial); onClose(); }}>Cancel</XaButton>
      </div>
    </form>
  </div>;

  const empty = !shownValue;
  const body = <><span className={styles.factLabel}>{label}</span><span className={styles.factValue} data-empty={empty || undefined}>{empty ? EMPTY_SAYS[detail] : shownValue}</span></>;
  return <div className={styles.detail} role="row" data-readers={hasReaders ? undefined : "off"} data-empty={empty || undefined}>
    <span role="cell">{readOnly ? <span className={styles.rowButton} data-static>{body}</span>
      : <button type="button" className={styles.rowButton} onClick={onEdit} aria-label={`${empty ? "Add" : "Change"} ${label.toLowerCase()}: ${shownValue || "not recorded yet"}`}>{body}</button>}</span>
    {hasReaders ? <span role="cell"><Readers list={readers} /></span> : null}
    <span role="cell" className={styles.saidBy}>{empty ? "" : said}</span>
    <RowAction word={readOnly ? null : empty ? "Add" : "Change"} />
  </div>;
}
