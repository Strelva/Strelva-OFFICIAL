import type { ReactNode } from "react";
import { XaAnswers, XaHeadline, XaInitial, XaLabel, XaTextLink } from "@/components/ui/strelva/Xa";
import type { OwnerBrand } from "@/platform/infra/agency-brand";
import { BUSINESS_EFFORT_CATEGORY_LABELS, type BusinessEffortCategory } from "@/platform/business-effort/types";
import type { CareReportFacts } from "@/platform/care-reports/contracts";
import {
  CARE_CHECK_LABEL, careChangeTitle, careHeadline, careOutcomeLine, careReleaseLabel, careReportTitle, careShortDate, careSiteCheckLines, careTimeLabel, careUsageLine,
} from "@/platform/care-reports/model";
import { PrintDocumentButton } from "@/experience/workspace/billing/PrintDocumentButton";
import { DOCUMENT_PRINT_CSS } from "@/experience/workspace/billing/print";
import { XaBlock, XaChanges, XaFigure, XaNote } from "@/experience/xa-object/XaObjectPage";
import styles from "./care-report.module.css";

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export type CareReportDocumentSnapshot = CareReportFacts & { agencyNote?: string | null };

/**
 * One month's Care plan report for one client, as one printable page (XA, in
 * the voice of E3: one figure that matters, then what changed and who did it).
 * Server-renderable. The agency's name comes from a live brand read passed in
 * by the page, never from the stored snapshot, so a renamed agency or an
 * unavailable identity shows as it is now.
 */
/** The owner's and the shared page: one calm column with the report as its object. */
export function CareReportColumn({ children }: { children: ReactNode }) {
  return <div className={styles.column}>{children}</div>;
}

export function CareReportDocument({ snapshot, brand, releaseNumber, releases, releaseHref, back, flat = false }: {
  snapshot: CareReportDocumentSnapshot;
  brand: OwnerBrand;
  releaseNumber: number | null;
  releases?: readonly { number: number; publishedAt: string }[];
  releaseHref?: (number: number) => string;
  back?: { label: string; href: string };
  audience: "agency" | "owner" | "shared";
  /** Inside the agency's decision panel the panel is the page; no second card. */
  flat?: boolean;
}) {
  const { changes, requests, time } = snapshot;
  const note = snapshot.agencyNote?.trim();
  const categories = Object.entries(time.byCategory).filter(([, minutes]) => minutes > 0);
  const earlier = releases && releases.length > 1 ? releases : null;
  const checkTone = (check: keyof typeof CARE_CHECK_LABEL) => check === "confirmed" ? undefined : "waits" as const;
  return <>{back ? <div data-print-hide className={styles.back}><XaTextLink href={back.href}>{back.label}</XaTextLink></div> : null}<article className={styles.report} data-flat={flat || undefined} aria-label={`${careReportTitle(snapshot)} for ${snapshot.business.name}`}>
    <style>{DOCUMENT_PRINT_CSS}</style>
    <header className={styles.head}>
      <p className={styles.byline}>
        {brand.logoUrl ? <img src={brand.logoUrl} alt="" className={styles.logo} /> : <XaInitial name={brand.name} color={brand.accentColor} size={28} />}
        <span className={styles.bylineName}>{`Prepared by ${brand.name}`}</span>
        <span className={styles.credit}>Runs on Strelva</span>
      </p>
      <XaHeadline quiet={`${snapshot.business.name} · ${releaseNumber ? careReleaseLabel(releaseNumber) : "Draft, not shared"}`}>{careReportTitle(snapshot)}</XaHeadline>
    </header>

    <XaFigure value={changes.total.toLocaleString("en-US")} label={changes.total === 1 ? "change made this month" : "changes made this month"} detail={careHeadline(snapshot)} />

    {note ? <XaBlock label={`A note from ${brand.name}`}>
      <div className={styles.note}><XaInitial name={brand.name} color={brand.accentColor} size={28} shape="round" /><p>{note}</p></div>
    </XaBlock> : null}

    <XaBlock label="Checked changes">
      {changes.items.length ? <XaChanges label="Changes" rows={changes.items.map(item => ({
        key: `${item.systemId}-${item.release}`, when: careShortDate(item.at), dateTime: item.at,
        text: <>{item.summary || careChangeTitle(item)}<span className={styles.sub}>{careChangeTitle(item)}</span></>,
        who: CARE_CHECK_LABEL[item.check], tone: checkTone(item.check),
      }))} /> : <XaNote>No Releases were recorded this month.</XaNote>}
      {changes.notChecked > 0 ? <XaNote tone="waits">{plural(changes.notChecked, "change wasn't", "changes weren't")} checked on the live site.</XaNote> : null}
    </XaBlock>

    <XaBlock label="Requests">
      {requests.done.length ? <XaChanges label="Requests done" rows={requests.done.map(item => ({ key: item.id, when: careShortDate(item.doneAt), dateTime: item.doneAt, text: item.request, who: `Done ${careShortDate(item.doneAt)}` }))} />
        : <XaNote>No Requests were done this month.</XaNote>}
      <XaNote>{requests.openCount.toLocaleString("en-US")} open · {requests.askedCount.toLocaleString("en-US")} asked this month</XaNote>
    </XaBlock>

    <XaBlock label="Inquiries and bookings"><p className={styles.sentence}>{careOutcomeLine(snapshot.outcomes)}</p></XaBlock>

    <XaBlock label="Site checks">
      <ul className={styles.plain} aria-label="Site checks">{careSiteCheckLines(snapshot.siteChecks).map(line => <li key={line}>{line}</li>)}</ul>
    </XaBlock>

    <XaBlock label="Time recorded">
      {time.minutes > 0 ? <>
        <p className={styles.sentence}>{careTimeLabel(time.minutes)} across {plural(time.entries, "entry", "entries")}</p>
        <XaAnswers labelWidth={180} rows={categories.map(([category, minutes]) => [BUSINESS_EFFORT_CATEGORY_LABELS[category as BusinessEffortCategory] ?? category, careTimeLabel(minutes)] as const)} />
      </> : <XaNote>No time recorded by {brand.name} this month.</XaNote>}
    </XaBlock>

    <XaBlock label="Strelva assistant"><p className={styles.sentence}>{careUsageLine(snapshot.usage)}</p></XaBlock>

    {earlier && releaseHref ? <div data-print-hide><XaBlock label="Earlier Releases">
      <ul className={styles.releases} aria-label="Releases of this report">
        {earlier.map(item => <li key={item.number}>
          {item.number === releaseNumber ? <span aria-current="page" className={styles.current}>{careReleaseLabel(item.number)}</span> : <XaTextLink href={releaseHref(item.number)}>{careReleaseLabel(item.number)}</XaTextLink>}
          <span className={styles.sub}>Shared {careShortDate(item.publishedAt)}</span>
        </li>)}
      </ul>
    </XaBlock></div> : null}

    <footer className={styles.foot}>
      <XaLabel>Counts come from records Strelva keeps. &quot;Not checked&quot; means the count was unavailable, not zero.</XaLabel>
      <div data-print-hide><PrintDocumentButton /></div>
    </footer>
  </article></>;
}
