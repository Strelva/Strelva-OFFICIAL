import type { ReactNode } from "react";
import { XaHeadline, XaInitial, XaStatus, XaTextLink } from "@/components/ui/strelva/Xa";
import type { OwnerBrand } from "@/platform/infra/agency-brand";
import { BUSINESS_EFFORT_CATEGORY_LABELS, type BusinessEffortCategory } from "@/platform/business-effort/types";
import type { CareReportFacts } from "@/platform/care-reports/contracts";
import {
  careCheckException, careCheckReason, careLead, careMattered, careOtherChanges, careOutcomeLine, careReleaseLabel, careReportTitle, careShortDate, careSiteCheckSentence, careTimeLabel,
} from "@/platform/care-reports/model";
import { XaChangeLine, XaLead } from "@/experience/places/XaPlace";
import { systemHref } from "@/experience/systems/model";
import { PrintDocumentButton } from "@/experience/workspace/billing/PrintDocumentButton";
import { DOCUMENT_PRINT_CSS } from "@/experience/workspace/billing/print";
import { XaBlock, XaChanges, XaNote } from "@/components/ui/strelva/Xa";
import styles from "./care-report.module.css";

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export type CareReportDocumentSnapshot = CareReportFacts & { agencyNote?: string | null };

/**
 * One month's Care plan report for one client, as one printable page (XA, in
 * the voice of E3; lane results, October 16: one sentence for the month, the
 * one change that mattered credited to the agency with a link to see it for
 * the owner, then what changed and who did it; no hero number).
 * Server-renderable. The agency's name comes from a live brand read passed in
 * by the page, never from the stored snapshot, so a renamed agency or an
 * unavailable identity shows as it is now.
 */
/** The owner's and the shared page: one calm column with the report as its object. */
export function CareReportColumn({ children }: { children: ReactNode }) {
  return <div className={styles.column}>{children}</div>;
}

export function CareReportDocument({ snapshot, brand, releaseNumber, releases, releaseHref, back, audience, flat = false }: {
  snapshot: CareReportDocumentSnapshot;
  brand: OwnerBrand;
  releaseNumber: number | null;
  releases?: readonly { number: number; publishedAt: string }[];
  releaseHref?: (number: number) => string;
  back?: { label: string; href: string };
  audience: "agency" | "owner" | "shared";
  /** Inside the agency's decision panel the panel is the page. */
  flat?: boolean;
}) {
  const { requests, time } = snapshot;
  const note = snapshot.agencyNote?.trim();
  const categories = Object.entries(time.byCategory).filter(([, minutes]) => minutes > 0);
  // Only Releases shared before the one on screen; a draft lists every shared one.
  const earlier = releases?.filter(item => releaseNumber === null || item.number < releaseNumber) ?? [];
  const lead = careLead(snapshot, brand.name);
  const mattered = careMattered(snapshot, brand.name);
  // The change that mattered is not listed again under what else changed.
  const others = careOtherChanges(snapshot, mattered);
  // Only the owner can open the System; a shared link has no account behind it.
  const seeHref = audience === "owner" && mattered ? systemHref("", snapshot.business.workspaceId, mattered.item.systemId) : undefined;
  // Release numbers are the agency's versioning; the owner and a shared link see the report, not its Releases.
  const agency = audience === "agency";
  return <>{back ? <div data-print-hide className={styles.back}><XaTextLink href={back.href}>{back.label}</XaTextLink></div> : null}<article className={styles.report} data-flat={flat || undefined} aria-label={`${careReportTitle(snapshot)} for ${snapshot.business.name}`}>
    <style>{DOCUMENT_PRINT_CSS}</style>
    <header className={styles.head}>
      {audience === "shared" ? null : <p className={styles.byline}>
        {brand.logoUrl ? <img src={brand.logoUrl} alt="" className={styles.logo} /> : <XaInitial name={brand.name} color={brand.accentColor} size={28} />}
        <span className={styles.bylineName}>{brand.name}</span>
        <span className={styles.credit}>Runs on Strelva</span>
      </p>}
      <XaHeadline quiet={agency && releaseNumber ? `${snapshot.business.name} · ${careReleaseLabel(releaseNumber)}` : snapshot.business.name}>{careReportTitle(snapshot)}</XaHeadline>
    </header>

    <XaLead quiet={lead.quiet}>{lead.text}</XaLead>
    {mattered ? <XaChangeLine label="The change that mattered" when={careShortDate(mattered.at)} href={seeHref}>{mattered.text}</XaChangeLine> : null}
    {note ? <XaBlock label={`${brand.name}'s note`}><p className={styles.sentence}>{note}</p></XaBlock> : null}

    {others.length || !mattered ? <XaBlock label={mattered ? "Also changed" : "What changed"}>
      {others.length ? <XaChanges label={mattered ? "Also changed" : "What changed"} rows={others.map(item => {
        const exception = careCheckException(item.check);
        const reason = careCheckReason(item, brand.name);
        return { key: `${item.systemId}-${item.release}`, when: careShortDate(item.at), dateTime: item.at,
          text: <>{item.summary || item.systemName}{reason ? <span className={styles.reason}>{reason}</span> : null}</>,
          who: exception ? <XaStatus kind="waits" size="sm">{exception}</XaStatus> : undefined, tone: exception ? "waits" as const : undefined };
      })} /> : <XaNote>Nothing changed on {snapshot.business.name}&apos;s Systems this month.</XaNote>}
    </XaBlock> : null}

    <XaBlock label="Requests">
      {requests.done.length ? <XaChanges label="Requests done" rows={requests.done.map(item => ({ key: item.id, when: careShortDate(item.doneAt), dateTime: item.doneAt, text: item.request }))} />
        : <XaNote>No requests were finished this month.</XaNote>}
      {requests.openCount > 0 ? <XaNote>{plural(requests.openCount, "request is", "requests are")} still open.</XaNote> : null}
    </XaBlock>

    <XaBlock label="Inquiries and bookings"><p className={styles.sentence}>{careOutcomeLine(snapshot.outcomes)}</p></XaBlock>

    <XaBlock label="Site checks"><p className={styles.sentence}>{careSiteCheckSentence(snapshot.siteChecks, snapshot.business.name)}</p></XaBlock>

    <XaBlock label="Time">
      {time.minutes > 0 ? <p className={styles.sentence}>{brand.name} spent {careTimeLabel(time.minutes)} on {snapshot.business.name}{categories.length ? `: ${categories.map(([category, minutes]) => `${(BUSINESS_EFFORT_CATEGORY_LABELS[category as BusinessEffortCategory] ?? category).toLowerCase()} ${careTimeLabel(minutes)}`).join(", ")}` : ""}.</p>
        : <XaNote>{brand.name} didn&apos;t record time this month.</XaNote>}
    </XaBlock>

    {agency && earlier.length && releaseHref ? <div data-print-hide><XaBlock label="Earlier releases">
      <ul className={styles.releases} aria-label="Earlier releases of this report">
        {earlier.map(item => <li key={item.number}>
          <XaTextLink href={releaseHref(item.number)}>{careReleaseLabel(item.number)}</XaTextLink>
          <span className={styles.sub}>Shared {careShortDate(item.publishedAt)}</span>
        </li>)}
      </ul>
    </XaBlock></div> : null}

    <footer className={styles.foot} data-print-hide><PrintDocumentButton /></footer>
  </article></>;
}
