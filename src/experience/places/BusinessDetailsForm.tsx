"use client";
/**
 * XA · R1 business record rows. Each detail is one open row: what it is, what
 * it says, which Systems read it (only when the caller knows), and who said
 * it. Pressing a row opens that one detail in place; Save submits only that
 * field through the page's server action with the exact record revision, so a
 * conflict is still caught by the SQL. No modal, no ledger, no receipt.
 */
import { useState, type ReactNode } from "react";
import { XaButton, XaField, XaSystemTile, XaTextArea } from "@/components/ui/strelva/Xa";
import type { BusinessRecord, FactValues } from "@/platform/business-record/contracts";
import { DETAIL_LABELS, EDITABLE_DETAILS, detailText, type EditableDetail } from "@/platform/business-record/details";
import { saidBy, weeklySummary } from "@/experience/record/record-words";
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

  return <div className={styles.table} role="table" aria-label="Business record">
    <div className={styles.tableHead} role="row" data-readers={hasReaders ? undefined : "off"}>
      <span role="columnheader">Detail</span>{hasReaders ? <span role="columnheader">Read by</span> : null}<span role="columnheader">Said by</span>
    </div>
    {hours ? <StaticRow label="Hours" value={weeklySummary(hours.weekly)} extra={hours.overrides?.length ? `${hours.overrides.length} special ${hours.overrides.length === 1 ? "day" : "days"} set` : undefined} href={readOnly ? undefined : hoursHref} actionLabel="Change hours" readers={readers?.hours} hasReaders={hasReaders} said={said(record.facts.hours)} /> : hoursHref && !readOnly ? <StaticRow label="Hours" value="Not recorded yet" empty href={hoursHref} actionLabel="Add your hours" readers={readers?.hours} hasReaders={hasReaders} said="Not recorded" /> : null}
    {shown.map(key => <DetailRow key={key} detail={key} record={record} workspaceId={workspaceId} readOnly={readOnly || !action} approvalCopy={approvalCopy} action={action}
      editing={editing === key} onEdit={() => setEditing(key)} onClose={() => setEditing(null)} readers={readers?.[key]} hasReaders={hasReaders} said={said(record.facts[key])}
      error={invalid?.field === key ? invalid.message : undefined} />)}
    {address ? <StaticRow label="Address" value={address.formatted ?? [address.line1, address.line2, address.city, address.region, address.postalCode].filter(Boolean).join(", ")} readers={readers?.address} hasReaders={hasReaders} said={said(record.facts.address)} /> : null}
    {services.length ? <StaticRow label="Services" value={services.map(service => service.priceText ? `${service.name} (${service.priceText})` : service.name).join(", ")} readers={readers?.services} hasReaders={hasReaders} said={saidBy(services[0]?.source, services.reduce((latest, service) => service.updatedAt > latest ? service.updatedAt : latest, services[0]?.updatedAt ?? ""), { agencyName, now })} /> : null}
  </div>;
}

function Readers({ list }: { list?: readonly { kind: string; name: string }[] }) {
  if (!list?.length) return <span className={styles.readers} aria-label="No System reads this yet" />;
  return <span className={styles.readers} aria-label={`Read by ${list.map(item => item.name).join(", ")}`}>{list.map(item => <XaSystemTile key={item.name} kind={item.kind} size={26} />)}</span>;
}

function StaticRow({ label, value, extra, empty, href, actionLabel, readers, hasReaders, said }: { label: string; value: string; extra?: string; empty?: boolean; href?: string; actionLabel?: string; readers?: readonly { kind: string; name: string }[]; hasReaders: boolean; said: ReactNode }) {
  const body = <><span className={styles.factLabel}>{label}</span><span className={styles.factValue} data-empty={empty || undefined}>{value}</span>{extra ? <span className={styles.factLabel}>{extra}</span> : null}</>;
  return <div className={styles.detail} role="row" data-readers={hasReaders ? undefined : "off"}>
    <span role="cell">{href ? <a className={styles.rowButton} href={href} aria-label={`${actionLabel ?? `Change ${label.toLowerCase()}`}: ${value}`}>{body}</a> : <span className={styles.rowButton} data-static>{body}</span>}</span>
    {hasReaders ? <span role="cell"><Readers list={readers} /></span> : null}
    <span role="cell" className={styles.saidBy}>{said}</span>
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
      <p className={styles.saidLine}>{initial ? `Was “${shownValue}”. ${said}.` : "Not recorded yet."}{approvalCopy ? ` ${approvalCopy}` : ""}</p>
      <div className={styles.editActions}>
        <XaButton type="submit" variant="primary" disabled={!changed}>Save {label.toLowerCase()}</XaButton>
        <XaButton variant="quiet" onClick={() => { setValue(initial); onClose(); }}>Cancel</XaButton>
      </div>
    </form>
  </div>;

  const body = <><span className={styles.factLabel}>{label}</span><span className={styles.factValue} data-empty={!shownValue || undefined}>{shownValue || "Not recorded yet"}</span></>;
  return <div className={styles.detail} role="row" data-readers={hasReaders ? undefined : "off"}>
    <span role="cell">{readOnly ? <span className={styles.rowButton} data-static>{body}</span>
      : <button type="button" className={styles.rowButton} onClick={onEdit} aria-label={`Change ${label.toLowerCase()}: ${shownValue || "not recorded yet"}`}>{body}</button>}</span>
    {hasReaders ? <span role="cell"><Readers list={readers} /></span> : null}
    <span role="cell" className={styles.saidBy}>{said}</span>
  </div>;
}
