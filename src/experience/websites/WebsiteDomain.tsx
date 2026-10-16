"use client";
/**
 * The website's address and its own domain, inside the Website System
 * (XA · S1 head). Each DNS record reads as the sentence to act on, with one
 * Copy for its value. The records are exactly what the domain provider
 * returned; Strelva checks for them and never changes DNS itself. Mail
 * records are never touched. One status and one check time per domain;
 * "Check again" and "Use a different domain" sit beside the domain, and the
 * request form shows only when there is no domain yet or one is being changed.
 */
import { useState, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { XaButton, XaField, XaSays, XaStatus } from "@/components/ui/strelva/Xa";
import { CopyButton } from "@/experience/connections/CopyButton";
import styles from "@/experience/connections/xa-connections.module.css";

export interface WebsiteDomainState { hostname: string; status: string; checkedAt: string | null; error?: string; records: readonly { type: string; name: string; value: string }[] }

function when(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The DNS records to add, each written as "A record @ points to 76.76.21.21 · Copy". */
export function DomainRecords({ hostname, records }: { hostname: string; records: WebsiteDomainState["records"] }) {
  if (!records.length) return <p className={styles.quiet}>The domain provider hasn&apos;t returned records yet. Strelva shows them here as soon as it does.</p>;
  return <ul className={styles.group} aria-label={`Records to add for ${hostname}`}>{records.map((record, index) => <li key={`${record.type}:${record.name}:${index}`} className={styles.groupRow}>
    <span className={styles.recordLine}><span><strong>{record.type}</strong> record <strong>{record.name}</strong> points to</span><span className={styles.recordValue}>{record.value}</span></span>
    <span className={styles.groupEnd}><CopyButton value={record.value} label={`${record.type} record value`} variant="text" /></span>
  </li>)}</ul>;
}

/** What the person may do about the domain beside it. Absent when they can't change it. */
export interface DomainManage { busy: boolean; disabled: boolean; onCheck: () => void }

/** "Your website": where it lives now, and the domain steps while a domain is being connected. */
export function WebsiteDomainPanel({ publishedUrl, readBack, domain, manage, form, children }: { publishedUrl: string; readBack: string | null; domain: WebsiteDomainState | null; manage?: DomainManage; form?: ReactNode; children?: ReactNode }) {
  const [changing, setChanging] = useState(false);
  const verified = domain?.status === "verified";
  const checked = when(domain?.checkedAt ?? null);
  const showForm = !domain || changing;
  return <section className={styles.section} aria-labelledby="rebuild-domain-heading">
    <h2 id="rebuild-domain-heading" className={styles.sectionTitle}>Your website</h2>
    <ul className={styles.group}>
      <li className={styles.groupRow}>
        <span className={styles.groupText}><span className={styles.groupDetail}>Address</span><a className={styles.addressValue} data-size="md" href={publishedUrl} target="_blank" rel="noopener noreferrer">{publishedUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")} <ExternalLink size={14} aria-hidden="true" /></a></span>
        <span className={styles.groupEnd}>{readBack === "verified" ? null : readBack === "failed" ? <XaStatus kind="waits" size="sm">Not confirmed yet</XaStatus> : <XaStatus kind="working" size="sm">Checking</XaStatus>}</span>
      </li>
      {domain ? <li className={styles.groupRow}>
        <span className={styles.groupText}><span className={styles.groupDetail}>Your domain</span><span className={styles.groupTitle}>{domain.hostname}</span>
          <span className={styles.groupDetail}>{checked ? `Checked ${checked}` : "Not checked yet"}
            {manage ? <> · <button type="button" className={styles.textButton} disabled={manage.disabled || manage.busy} onClick={manage.onCheck}>{manage.busy ? "Checking…" : "Check again"}</button> · <button type="button" className={styles.textButton} disabled={manage.disabled} aria-expanded={changing} onClick={() => setChanging(value => !value)}>{changing ? "Keep this domain" : "Use a different domain"}</button></> : null}</span></span>
        <span className={styles.groupEnd}>{verified ? <XaStatus kind="live" size="sm">Connected</XaStatus> : <XaStatus kind="waits" size="sm">Waits for your records</XaStatus>}</span>
      </li> : null}
    </ul>
    {domain?.error ? <div role="alert"><XaSays>{domain.error}</XaSays></div> : null}
    {domain && !verified ? <ol className={styles.steps}>
      <li className={styles.step}><span className={styles.stack}>Sign in where {domain.hostname} was bought or where its DNS lives, and add these records. Leave your mail records as they are.<DomainRecords hostname={domain.hostname} records={domain.records} /></span></li>
      <li className={styles.step}><span>Strelva checks for them every minute while this page is open. Most providers take minutes; some take up to two days.</span></li>
    </ol> : verified ? <XaSays links={[<a key="see" className={styles.textButton} href={`https://${domain!.hostname}`} target="_blank" rel="noopener noreferrer">See it</a>]}>{domain!.hostname} opens your website now{readBack === "verified" ? ", and Strelva checked it shows what you published" : ""}. Visitors can use it.</XaSays> : null}
    {showForm ? form : null}
    {children}
  </section>;
}

/** Connect a domain, or switch to a different one. Only shown to someone who may change the website's domain. */
export function WebsiteDomainForm({ value, onChange, onSubmit, hasDomain, busy, disabled }: { value: string; onChange: (value: string) => void; onSubmit: () => void; hasDomain: boolean; busy: boolean; disabled: boolean }) {
  return <form className={styles.section} onSubmit={event => { event.preventDefault(); if (value.trim()) onSubmit(); }}>
    <XaField label={hasDomain ? "A different domain" : "Your domain"} placeholder="your-business.com" value={value} onChange={event => onChange(event.target.value)} disabled={disabled} autoComplete="off" spellCheck={false} hint={hasDomain ? "Strelva shows the records to add for it next." : "The domain you already own. Strelva shows the records to add next."} />
    <div className={styles.actions}><XaButton type="submit" disabled={disabled || !value.trim()} busy={busy}>Connect this domain</XaButton></div>
  </form>;
}
