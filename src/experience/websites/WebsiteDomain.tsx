"use client";
/**
 * The website's address and its own domain, inside the Website System
 * (XA · S1 head, Mintlify-style records with one Copy per value). The
 * records are exactly what the domain provider returned; Strelva checks for
 * them and never changes DNS itself. Mail records are never touched.
 */
import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { XaButton, XaField, XaSays, XaStatus, XaWorking } from "@/components/ui/strelva/Xa";
import { CopyButton } from "@/experience/connections/CopyButton";
import styles from "@/experience/connections/xa-connections.module.css";

export interface WebsiteDomainState { hostname: string; status: string; checkedAt: string | null; error?: string; records: readonly { type: string; name: string; value: string }[] }

function when(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The DNS records to add, each value copyable on its own. */
export function DomainRecords({ hostname, records }: { hostname: string; records: WebsiteDomainState["records"] }) {
  if (!records.length) return <p className={styles.quiet}>The domain provider hasn&apos;t returned records yet. Strelva shows them here as soon as it does.</p>;
  return <ul className={styles.group} aria-label={`Records to add for ${hostname}`}>{records.map((record, index) => <li key={`${record.type}:${record.name}:${index}`} className={styles.groupRow}>
    <span className={styles.record}>
      <span className={styles.recordCell}><small>Type</small><span>{record.type}</span></span>
      <span className={styles.recordCell}><small>Name</small><span>{record.name}</span></span>
      <span className={styles.recordCell}><small>Value</small><span>{record.value}</span></span>
      <CopyButton value={record.value} label={`${record.type} value`} variant="text" />
    </span>
  </li>)}</ul>;
}

/** "Your website": where it lives now, and the domain steps while a domain is being connected. */
export function WebsiteDomainPanel({ publishedUrl, readBack, domain, children }: { publishedUrl: string; readBack: string | null; domain: WebsiteDomainState | null; children?: ReactNode }) {
  const verified = domain?.status === "verified";
  const checked = when(domain?.checkedAt ?? null);
  return <section className={styles.section} aria-labelledby="rebuild-domain-heading">
    <h2 id="rebuild-domain-heading" className={styles.sectionTitle}>Your website</h2>
    <ul className={styles.group}>
      <li className={styles.groupRow}>
        <span className={styles.groupText}><span className={styles.groupDetail}>Address</span><a className={styles.addressValue} data-size="md" href={publishedUrl} target="_blank" rel="noopener noreferrer">{publishedUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")} <ExternalLink size={14} aria-hidden="true" /></a></span>
        <span className={styles.groupEnd}>{readBack === "verified" ? null : readBack === "failed" ? <XaStatus kind="waits" size="sm">Not read back</XaStatus> : <XaStatus kind="working" size="sm">Checking</XaStatus>}</span>
      </li>
      {domain ? <li className={styles.groupRow}>
        <span className={styles.groupText}><span className={styles.groupDetail}>Your domain</span><span className={styles.groupTitle}>{domain.hostname}</span>{checked ? <span className={styles.groupDetail}>Last checked {checked}</span> : <span className={styles.groupDetail}>Not checked yet</span>}</span>
        <span className={styles.groupEnd}>{verified ? <XaStatus kind="live" size="sm">Connected</XaStatus> : <XaStatus kind="waits" size="sm">Waits for your records</XaStatus>}</span>
      </li> : null}
    </ul>
    <p className={styles.quiet}>{readBack === "verified" ? "Strelva read the published website back and it matched." : readBack === "failed" ? "Published, but reading it back failed. Checking again doesn't republish the website." : "Publication is recorded. Strelva is reading it back."}</p>
    {domain?.error ? <div role="alert"><XaSays>{domain.error}</XaSays></div> : null}
    {domain && !verified ? <div className={styles.section}>
      <ol className={styles.steps}>
        <li className={styles.step}><span className={styles.stack}>Sign in where {domain.hostname} was bought or where its DNS lives, and add these records. Leave your mail records as they are.<DomainRecords hostname={domain.hostname} records={domain.records} /></span></li>
        <li className={styles.step}><span>Strelva checks for them every minute while this page is open. Most providers take minutes; some take up to two days.</span></li>
      </ol>
      <XaWorking title={`Waiting for ${domain.hostname} to point here`} steps={[{ id: "look", label: checked ? `Checked ${checked}` : "First check starts once records are returned", state: "active" }]} />
    </div> : verified ? <XaSays>{domain!.hostname} points to your website. Visitors can use it now.</XaSays> : null}
    {children}
  </section>;
}

/** Connect or re-check a domain. Only shown to someone who may change the website's domain. */
export function WebsiteDomainForm({ value, onChange, onSubmit, hasDomain, busy, disabled }: { value: string; onChange: (value: string) => void; onSubmit: () => void; hasDomain: boolean; busy: boolean; disabled: boolean }) {
  return <form className={styles.section} onSubmit={event => { event.preventDefault(); onSubmit(); }}>
    <XaField label="Your domain" placeholder="your-business.com" value={value} onChange={event => onChange(event.target.value)} disabled={disabled} autoComplete="off" spellCheck={false} hint={hasDomain ? "Leave it empty to check the domain above again." : "The domain you already own. Strelva shows the records to add next."} />
    <div className={styles.actions}><XaButton type="submit" disabled={disabled || (!value.trim() && !hasDomain)} busy={busy}>{hasDomain ? "Check domain status" : "Connect domain"}</XaButton></div>
  </form>;
}
