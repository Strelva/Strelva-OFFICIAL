import type { ComponentProps } from "react";
import { XA_PLACE_LABELS } from "@/platform/presentation/place-labels";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { XaEmpty, XaLabel, XaRow, XaRows, XaSays, XaTextLink } from "@/components/ui/strelva/Xa";
import { XaFigure, XaLinkSegmented, XaNote, XaPlace, XaPlaceHead, XaPlaceLoading, XaPlaceNotMember, XaPlaceTrouble, xaShortDate } from "@/experience/places/XaPlace";
import place from "@/experience/places/xa-place.module.css";
import type { RecapView, SiteRecaps } from "@/products/recaps/server";
import type { OwnerCareReportItem } from "@/platform/care-reports";
import { careMonthLabel, careShortDate } from "@/platform/care-reports/model";
import styles from "./recaps.module.css";

export type RecapPeriodFilter = "all" | "week" | "month";
/** Reports an agency shared with this business. Absent while Care plan reports is off. */
export type OwnerCareReportsState = { kind: "ready"; items: OwnerCareReportItem[] } | { kind: "unavailable" };
export type WorkspaceRecapsState = { kind: "ready"; sites: SiteRecaps[] } | { kind: "loading" } | { kind: "permission" } | { kind: "error" };

/** Confirmed bookings and additional loop context remain fixture-only. */
export interface OutcomeRecap {
  inquiries: number | null; answered: number | null; bookings: number | null; reviews: number | null;
  inquiryDetail?: string; answeredDetail?: string; bookingDetail?: string; reviewDetail?: string;
}
const FILTERS: Array<{ value: RecapPeriodFilter; label: string }> = [{ value: "all", label: "All" }, { value: "week", label: "Weekly" }, { value: "month", label: "Monthly" }];
function dateLabel(value: string, options: Intl.DateTimeFormatOptions): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}
export function recapTitle(recap: RecapView): string {
  return recap.period === "month" ? dateLabel(recap.start, { month: "long", year: "numeric" }) : `Week of ${dateLabel(recap.start, { month: "short", day: "numeric", year: "numeric" })}`;
}
function delta(value: number, period: RecapView["period"]): string {
  if (!Number.isFinite(value) || value === 0) return `Same as the ${period} before`;
  return `${value > 0 ? "Up" : "Down"} ${Math.abs(Math.round(value))}% from the ${period} before`;
}
const count = (value: number) => value.toLocaleString("en-US");

/**
 * One saved recap, shaped like the Monday email (XA · E3): the clays, one
 * big number, what came of it, what changed, and one idea. Every count says
 * where it came from; a missing count is said in words, never shown as zero.
 */
export function RecapOutcome({ recap, outcome, siteName }: { recap: RecapView; outcome?: OutcomeRecap; siteName: string }) {
  const proof = recap.inquiryOutcome?.status === "available" ? recap.inquiryOutcome : undefined;
  const inquiryMissing = recap.inquiryOutcome?.status === "unavailable" ? "Inquiry evidence couldn't be read when this recap was saved" : "Not counted in this saved recap";
  const metrics = [
    { label: "Inquiries", value: outcome?.inquiries ?? proof?.inquiries, detail: outcome?.inquiryDetail ?? (proof ? "Recorded form submissions" : undefined), missing: inquiryMissing },
    { label: "Answered", value: outcome?.answered ?? proof?.answered, detail: outcome?.answeredDetail ?? (proof ? "First business replies accepted by the mail provider · delivery not verified" : undefined), missing: inquiryMissing },
    { label: "Bookings", value: outcome?.bookings, detail: outcome?.bookingDetail },
    { label: "New reviews", value: outcome?.reviews ?? recap.newReviews, detail: outcome?.reviewDetail ?? "Recorded review events; provider isn't identified in this recap" },
  ];
  const range = `${dateLabel(recap.start, { month: "short", day: "numeric" })} to ${dateLabel(recap.end, { month: "short", day: "numeric" })}`;
  return <article className={styles.recap} aria-label={recapTitle(recap)}>
    <div className={place.stack}>
      <p className={place.quiet}>{recap.period === "month" ? "Monthly recap" : "Weekly recap"} · {range}</p>
      <h2 className={styles.recapTitle}>{recapTitle(recap)}</h2>
    </div>
    <XaFigure value={count(recap.visits)} label={`visits to ${siteName}`} note={delta(recap.visitsDelta, recap.period)} />
    {recap.summary ? <p className={styles.summary}>{recap.summary}</p> : null}
    <section className={place.stack} aria-label="What came of it">
      <XaLabel as="h3">What came of it</XaLabel>
      <dl className={styles.counts}>{metrics.map(metric => <div key={metric.label} className={styles.count}>
        <dt>{metric.label}</dt>
        <dd className={styles.countValue} data-counted={metric.value != null || undefined}>{metric.value == null ? "" : count(metric.value)}</dd>
        <dd className={styles.countDetail}>{metric.value == null ? metric.missing || "Not counted in this saved recap" : metric.detail}</dd>
      </div>)}</dl>
      {!outcome ? <p className={place.quiet}>{count(recap.customerActions)} booking-link and phone-link clicks were recorded. These are clicks, not confirmed bookings or answered calls.</p> : null}
    </section>
    {recap.highlights.length ? <section className={place.stack} aria-label="What changed">
      <XaLabel as="h3">What changed</XaLabel>
      <XaRows label="What changed">{recap.highlights.map((highlight, index) => <XaRow key={index} title={highlight} />)}</XaRows>
    </section> : null}
    {recap.nextAction ? <XaSays><b>{recap.nextAction.title}.</b> {recap.nextAction.description} A suggestion. Nothing starts from this recap.</XaSays> : null}
    <p className={place.quiet}>Counts come from the saved site recap. Strelva doesn&apos;t count walk-ins or calls made away from the site.</p>
  </article>;
}

function AgencyReports({ workspaceId, reports }: { workspaceId: string; reports: OwnerCareReportsState }) {
  return <section className={place.stack} aria-labelledby="recaps-agency-reports">
    <XaLabel as="h2" id="recaps-agency-reports">Reports from your agency</XaLabel>
    {reports.kind === "unavailable" ? <XaNote tone="trouble" pebble role="alert">Agency reports couldn&apos;t load. Reload to try again.</XaNote>
      : !reports.items.length ? <XaNote>No reports from your agency yet.</XaNote>
        : <XaRows label="Reports from your agency">{reports.items.map(item => <XaRow key={item.reportId} title={`${careMonthLabel(item.month)} report`}
          detail={`From ${item.agencyName} · Release ${item.latestRelease.number} · shared ${careShortDate(item.latestRelease.publishedAt)}`}
          meta="Open" href={`/workspace/care-reports/${item.reportId}?workspaceId=${encodeURIComponent(workspaceId)}`} />)}</XaRows>}
  </section>;
}

type ShellChrome = Partial<Omit<ComponentProps<typeof StrelvaShell>, "children">>;

export function WorkspaceRecaps({ workspaceId, state, period, outcomes, preview = false, releaseLabel, careReports, recapId, chrome, hrefBase }: { workspaceId: string; state: WorkspaceRecapsState; period: RecapPeriodFilter; outcomes?: Record<string, OutcomeRecap>; preview?: boolean; releaseLabel?: string; careReports?: OwnerCareReportsState; recapId?: string; chrome?: ShellChrome; hrefBase?: string }) {
  const homeHref = `/workspace?workspaceId=${encodeURIComponent(workspaceId)}`;
  const base = hrefBase ?? (preview ? "/preview/strelva/recaps" : "/workspace/recaps");
  const href = (value: RecapPeriodFilter, recap?: string) => `${base}?workspaceId=${encodeURIComponent(workspaceId)}${value === "all" ? "" : `&period=${value}`}${recap ? `&recap=${encodeURIComponent(recap)}` : ""}`;
  const head = <XaPlaceHead title="Recaps" back={{ href: homeHref, label: `Back to ${XA_PLACE_LABELS.today}` }}
    status={<span>What Strelva saw on your site each week and month.{releaseLabel ? ` · ${releaseLabel}` : ""}</span>} />;
  return <StrelvaShell title="Recaps" workspaceId={workspaceId} active="system" {...chrome}>
    <XaPlace label="Recaps">
      {head}
      {state.kind === "loading" ? <XaPlaceLoading label="Loading recaps" />
        : state.kind === "permission" ? <XaPlaceNotMember title="These recaps belong to another business." />
          : state.kind === "error" ? <XaPlaceTrouble title="Recaps couldn't load." quiet="Your saved recaps are kept." action={<XaTextLink href={href(period)}>Reload recaps</XaTextLink>} />
            : (() => {
              const single = state.sites.length === 1 ? state.sites[0]! : null;
              const pick = (site: SiteRecaps) => { const recaps = site.recaps.filter(recap => period === "all" || recap.period === period); return { recaps, current: recaps.find(recap => recap.id === recapId) ?? recaps[0] }; };
              const others = (site: SiteRecaps) => { const { recaps, current } = pick(site); return recaps.length > 1 && current ? <section className={place.stack} aria-label={`Other recaps for ${site.siteName}`}>
                <XaLabel as="h3">Other recaps</XaLabel>
                <XaRows label="Other recaps">{recaps.filter(recap => recap !== current).map(recap => <XaRow key={`${recap.period}:${recap.id}`} title={recapTitle(recap)}
                  detail={`${count(recap.visits)} visits · ${recap.period === "month" ? "Monthly" : "Weekly"}`} meta={xaShortDate(recap.end)} href={href(period, recap.id)} />)}</XaRows>
              </section> : null; };
              const singleOthers = single && !single.unavailable ? others(single) : null;
              return <div className={place.columns} data-rail-first="true">
                {careReports || singleOthers ? <aside className={place.rail} aria-label="Reports and other recaps">
                  {careReports ? <AgencyReports workspaceId={workspaceId} reports={careReports} /> : null}
                  {singleOthers}
                </aside> : null}
                <div className={place.sectionGap}>
                  <XaLinkSegmented label="Recap period" options={FILTERS.map(filter => ({ href: href(filter.value), label: filter.label, current: period === filter.value }))} />
                  {!state.sites.length ? <XaEmpty pose="website" title="No site is connected to this business yet." job="Pebble starts counting once a site is here">Recaps start once a website is connected or published here.</XaEmpty>
                    : state.sites.map(site => {
                      const { current } = pick(site);
                      return <section key={site.tenantId} aria-label={site.siteName} className={place.stack}>
                        {state.sites.length > 1 ? <XaLabel as="h2">{site.siteName}</XaLabel> : null}
                        {site.unavailable ? <XaPlaceTrouble title={`Recaps for ${site.siteName} couldn't be read right now.`} quiet="Nothing is lost. Reload to try again." />
                          : !current ? <XaEmpty size="sm" pose="resting" title={period === "month" ? "No monthly recap yet." : period === "week" ? "No weekly recap yet." : `No recaps for ${site.siteName} yet.`} job="Pebble writes the first one after a full week of visits" />
                            : <><RecapOutcome recap={current} siteName={site.siteName} outcome={outcomes?.[current.id]} />{single ? null : others(site)}</>}
                      </section>;
                    })}
                </div>
              </div>;
            })()}
    </XaPlace>
  </StrelvaShell>;
}
