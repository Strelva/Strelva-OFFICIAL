import { StCopy, StHead, StMono, StRow, StRows, StSection, StState, StTextButton } from "@/components/ui/strelva/Kit";
import type { OwnerBrand } from "@/platform/infra/agency-brand";
import { BUSINESS_EFFORT_CATEGORY_LABELS, type BusinessEffortCategory } from "@/platform/business-effort/types";
import type { CareCheck, CareReportFacts } from "@/platform/care-reports/contracts";
import {
  CARE_CHECK_LABEL, careChangeTitle, careHeadline, careOutcomeLine, careReleaseLabel, careReportTitle, careShortDate, careSiteCheckLines, careTimeLabel, careUsageLine,
} from "@/platform/care-reports/model";
import { PrintDocumentButton } from "@/experience/workspace/billing/PrintDocumentButton";
import { DOCUMENT_PRINT_CSS } from "@/experience/workspace/billing/print";

const CHECK_KIND = { confirmed: "live", not_confirmed: "need", not_checked: "draft" } as const satisfies Record<CareCheck, "live" | "need" | "draft">;
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export type CareReportDocumentSnapshot = CareReportFacts & { agencyNote?: string | null };

/**
 * One month's report for one client, as a printable page. Server-renderable.
 * The agency's name comes from a live brand read passed in by the page, never
 * from the stored snapshot, so a renamed agency or an unavailable identity shows
 * as it is now.
 */
export function CareReportDocument({ snapshot, brand, releaseNumber, releases, releaseHref, back }: {
  snapshot: CareReportDocumentSnapshot;
  brand: OwnerBrand;
  releaseNumber: number | null;
  releases?: readonly { number: number; publishedAt: string }[];
  releaseHref?: (number: number) => string;
  back?: { label: string; href: string };
  audience: "agency" | "owner" | "shared";
}) {
  const { changes, requests, time } = snapshot;
  const note = snapshot.agencyNote?.trim();
  const categories = Object.entries(time.byCategory).filter(([, minutes]) => minutes > 0);
  const earlier = releases && releases.length > 1 ? releases : null;
  return <>
    <style>{DOCUMENT_PRINT_CSS}</style>
    {back ? <div data-print-hide><StTextButton href={back.href}>{back.label}</StTextButton></div> : null}
    <StHead title={careReportTitle(snapshot)} meta={`${snapshot.business.name} · ${releaseNumber ? careReleaseLabel(releaseNumber) : "Draft, not shared"}`} />
    <p className="flex items-center gap-2 text-sm">
      {brand.logoUrl ? <img src={brand.logoUrl} alt="" className="size-6 object-contain" /> : null}
      <span>{`Prepared by ${brand.name}`}</span>
      <StCopy muted>Runs on Strelva</StCopy>
    </p>
    {note ? <StSection title={`A note from ${brand.name}`}><StCopy>{note}</StCopy></StSection> : null}
    <StCopy>{careHeadline(snapshot)}</StCopy>
    <StSection title="Checked changes">
      {changes.items.length ? <StRows label="Changes">
        {changes.items.map(item => <StRow key={`${item.systemId}-${item.release}`} title={careChangeTitle(item)}
          detail={[item.summary, careShortDate(item.at)].filter(Boolean).join(" · ")}
          end={<StState kind={CHECK_KIND[item.check]}>{CARE_CHECK_LABEL[item.check]}</StState>} />)}
      </StRows> : <StCopy muted>No Releases were recorded this month.</StCopy>}
      {changes.notChecked > 0 ? <StCopy muted>{plural(changes.notChecked, "change wasn't", "changes weren't")} checked on the live site.</StCopy> : null}
    </StSection>
    <StSection title="Requests">
      {requests.done.length ? <StRows label="Requests done">
        {requests.done.map(item => <StRow key={item.id} title={item.request} end={<StMono>Done {careShortDate(item.doneAt)}</StMono>} />)}
      </StRows> : <StCopy muted>No Requests were done this month.</StCopy>}
      <StCopy muted>{requests.openCount.toLocaleString("en-US")} open · {requests.askedCount.toLocaleString("en-US")} asked this month</StCopy>
    </StSection>
    <StSection title="Inquiries and bookings"><StCopy>{careOutcomeLine(snapshot.outcomes)}</StCopy></StSection>
    <StSection title="Site checks">
      <StRows label="Site checks">{careSiteCheckLines(snapshot.siteChecks).map(line => <StRow key={line} title={line} />)}</StRows>
    </StSection>
    <StSection title="Time recorded">
      {time.minutes > 0 ? <>
        <StCopy>{careTimeLabel(time.minutes)} across {plural(time.entries, "entry", "entries")}</StCopy>
        <StRows label="Time by kind of work">
          {categories.map(([category, minutes]) => <StRow key={category} title={BUSINESS_EFFORT_CATEGORY_LABELS[category as BusinessEffortCategory] ?? category} end={<StMono>{careTimeLabel(minutes)}</StMono>} />)}
        </StRows>
      </> : <StCopy muted>No time recorded by {brand.name} this month.</StCopy>}
    </StSection>
    <StSection title="Strelva assistant"><StCopy>{careUsageLine(snapshot.usage)}</StCopy></StSection>
    {earlier && releaseHref ? <div data-print-hide><StSection title="Earlier Releases">
      <StRows label="Releases of this report">
        {earlier.map(item => <StRow key={item.number} title={careReleaseLabel(item.number)} detail={`Shared ${careShortDate(item.publishedAt)}`}
          href={releaseHref(item.number)} selected={item.number === releaseNumber} />)}
      </StRows>
    </StSection></div> : null}
    <StCopy muted>Counts come from records Strelva keeps. A dash or &quot;not checked&quot; means unavailable, not zero.</StCopy>
    <div data-print-hide><PrintDocumentButton /></div>
  </>;
}
