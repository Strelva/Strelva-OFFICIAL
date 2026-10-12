"use client";

import { useState } from "react";
import type { WebsiteDomainView } from "@/products/websites/client";
import { StEmpty, StHead, StMono, StNotice, StPage, StSection, StSkeleton, StState, StTextButton } from "@/components/ui/strelva/Kit";
import styles from "./website-domain-records.module.css";

/** Read-only provider recommendations. Domain verification never implies a per-record DNS result. */
export function WebsiteDomainRecords({ domain, loading = false, canSee = true, error, backHref }: {
  domain: WebsiteDomainView | null;
  loading?: boolean;
  canSee?: boolean;
  error?: string;
  backHref?: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState("");
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(value); setCopyError(""); }
    catch { setCopyError("Copy is unavailable. Select the record value and copy it manually."); }
  }
  return <StPage>
    <StHead crumb={backHref ? { label: "Website", href: backHref } : undefined} title={canSee ? domain?.hostname ?? "Your domain" : "Your domain"} meta="The records your hosting provider recommends. Strelva can’t renew your domain for you." />
    {!canSee ? <StNotice>You don’t have permission to read this website’s domain. Ask an owner or admin of this business for access.</StNotice>
      : loading ? <div className={styles.stack} aria-busy="true"><StSkeleton label="Loading domain records" width="55%" /><StSkeleton /><StSkeleton /></div>
      : error ? <StNotice tone="critical">{error}</StNotice>
      : !domain ? <StEmpty>No domain is recorded for this website yet.</StEmpty>
      : <div className={styles.layout}>
        <StSection title="Domain records">
          {domain.error ? <StNotice tone="critical">{domain.error}</StNotice> : null}
          {domain.records.length ? <div className={styles.scroll} role="region" aria-label="Domain record values" tabIndex={0}><table className={styles.table}>
            <caption className="sr-only">Recommended DNS records for {domain.hostname}. Individual records have not been checked separately.</caption>
            <thead><tr><th scope="col">Type</th><th scope="col">Name</th><th scope="col">Value</th><th scope="col">Check</th></tr></thead>
            <tbody>{domain.records.map((record, index) => <tr key={`${record.type}:${record.name}:${index}`}>
              <td><StMono tone="text">{record.type}</StMono></td><td><StMono tone="text">{record.name}</StMono></td>
              <td><StMono tone="text">{record.value}</StMono></td><td><div className={styles.actions}><span>Not checked separately</span><StTextButton aria-label={`Copy ${record.type} record value for ${record.name}`} onClick={() => void copy(record.value)}>{copied === record.value ? "Copied" : "Copy"}</StTextButton></div></td>
            </tr>)}</tbody>
          </table></div> : <StEmpty>No recommended records were returned. Exact values are needed before changing DNS.</StEmpty>}
          <p className={styles.body}>Mail records stay as they are. Strelva does not change where your email goes.</p>
          {copied ? <p role="status" className={styles.body}>Record value copied.</p> : null}
          {copyError ? <StNotice tone="critical">{copyError}</StNotice> : null}
        </StSection>
        <StSection title="What Strelva checked">
          <StState kind={domain.status === "verified" ? "live" : domain.status === "failed" ? "down" : "need"}>{domain.status === "verified" ? "Domain verified" : domain.status === "failed" ? "Domain check failed" : "Domain verification pending"}</StState>
          <StMono as="time" dateTime={domain.checkedAt}>Last domain check: {new Date(domain.checkedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</StMono>
          <p className={styles.body}>These are provider recommendations. The result above is for the domain; it doesn’t show which individual records were found.</p>
          <p className={styles.body}>Registration, renewal date and where each hostname sends visitors are not available here yet.</p>
        </StSection>
      </div>}
  </StPage>;
}
