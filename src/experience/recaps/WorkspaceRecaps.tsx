import type { ComponentProps } from "react";
import { XA_PLACE_LABELS } from "@/platform/presentation/place-labels";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { XaLabel, XaRow, XaRows, XaSays, XaSystemTile, XaTextLink } from "@/components/ui/strelva/Xa";
import { XaChangeLine, XaLead, XaLinkSegmented, XaNote, XaPlace, XaPlaceHead, XaPlaceLoading, XaPlaceNotMember, XaPlaceTrouble, xaShortDate } from "@/experience/places/XaPlace";
import { resultsHref } from "@/experience/places/WorkspaceResults";
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
const count = (value: number) => value.toLocaleString("en-US");

const plural = (value: number, one: string, many: string) => `${count(value)} ${value === 1 ? one : many}`;

/**
 * What came of the period, said as sentences (E3 voice) rather than a
 * label and number table. A count that wasn't saved with the recap is left
 * out, never shown as zero and never contradicted by a "not counted" line.
 */
export function recapOutcomeSentences(recap: RecapView, outcome?: OutcomeRecap): string[] {
  const proof = recap.inquiryOutcome?.status === "available" ? recap.inquiryOutcome : undefined;
  const asked = outcome?.inquiries ?? proof?.inquiries ?? null;
  const answered = outcome?.answered ?? proof?.answered ?? null;
  const lines: string[] = [];
  if (asked !== null) {
    // A saved reply is a reply sent, not proof it was read, so the sentence says "replied to".
    const answers = answered === null ? "" : asked > 0 && answered >= asked ? ` and Strelva or you replied to ${asked === 1 ? "them" : `all ${count(asked)}`}` : `, and Strelva or you replied to ${count(answered)}`;
    const quick = proof && proof.withinDay > 0 && answered !== null && answered > 0 ? `, ${count(proof.withinDay)} within a day` : "";
    lines.push(asked === 0 ? "Nobody asked a question through the site." : `${plural(asked, "person", "people")} asked a question${answers}${quick}.`);
  } else if (recap.inquiryOutcome?.status === "unavailable") lines.push("Questions couldn't be counted when this recap was saved.");
  if (outcome?.bookings != null) lines.push(`${plural(outcome.bookings, "visit", "visits")} booked.`);
  if (recap.customerActions > 0) lines.push(`${plural(recap.customerActions, "click", "clicks")} to book or call.`);
  const reviews = outcome?.reviews ?? recap.newReviews;
  lines.push(reviews ? `${plural(reviews, "new review", "new reviews")}.` : "No new reviews.");
  return lines;
}

/**
 * The change a recap leads with: the first highlight that names a change
 * rather than repeating a count (saved highlights also hold lines like "412
 * people visited your site", which the lead sentence already says).
 */
export function recapMattered(recap: Pick<RecapView, "highlights">): string | null {
  return recap.highlights.find(line => line.trim() && !/^\d/.test(line.trim()))?.trim() ?? null;
}

/** The lead sentence: the period's visits, then how that moved. One fact each. */
export function recapLead(recap: Pick<RecapView, "visits" | "visitsDelta" | "period">, siteName: string): string {
  const visits = `${count(recap.visits)} ${recap.visits === 1 ? "visit" : "visits"} to ${siteName}`;
  if (!Number.isFinite(recap.visitsDelta) || Math.round(recap.visitsDelta) === 0) return `${visits}, the same as the ${recap.period} before.`;
  return `${visits}, ${recap.visitsDelta > 0 ? "up" : "down"} ${Math.abs(Math.round(recap.visitsDelta))}% from the ${recap.period} before.`;
}

/**
 * One saved recap (lane results, October 16): the period, one sentence, the
 * one change that mattered (whoever acted is named in its words) with a link
 * to see that window, Pebble's one idea, then what came of it in sentences
 * and anything else that changed. No hero number and no clay line-up.
 */
export function RecapOutcome({ recap, outcome, siteName, seeHref }: { recap: RecapView; outcome?: OutcomeRecap; siteName: string; /** Where "See it" opens: Results for this recap's window. */ seeHref?: string }) {
  const range = `${dateLabel(recap.start, { month: "short", day: "numeric" })} to ${dateLabel(recap.end, { month: "short", day: "numeric" })}`;
  const said = recapOutcomeSentences(recap, outcome);
  const mattered = recapMattered(recap);
  const others = recap.highlights.filter(line => line.trim() && line.trim() !== mattered);
  return <article className={styles.recap} aria-label={recapTitle(recap)}>
    <div className={place.stack}>
      <p className={place.quiet}>{recap.period === "month" ? "Monthly recap" : "Weekly recap"} · {range}</p>
      <h2 className={styles.recapTitle}>{recapTitle(recap)}</h2>
    </div>
    <XaLead quiet={recap.summary || undefined}>{recapLead(recap, siteName)}</XaLead>
    {mattered ? <XaChangeLine label="The change that mattered" href={seeHref} linkLabel={recap.period === "month" ? "See that month" : "See that week"}>{/[.!?]$/.test(mattered) ? mattered : `${mattered}.`}</XaChangeLine> : null}
    {recap.nextAction ? <XaSays><b>{recap.nextAction.title}.</b> {recap.nextAction.description}</XaSays> : null}
    <p className={styles.summary}>{said.join(" ")}</p>
    {others.length ? <section className={place.stack} aria-label="Also changed">
      <XaLabel as="h3">Also changed</XaLabel>
      <XaRows label="Also changed">{others.map((highlight, index) => <XaRow key={index} title={highlight} />)}</XaRows>
    </section> : null}
    <p className={place.quiet}>Clicks aren&apos;t confirmed bookings or answered calls. Walk-ins and calls made away from the site aren&apos;t counted.</p>
  </article>;
}

function AgencyReports({ workspaceId, reports }: { workspaceId: string; reports: OwnerCareReportsState }) {
  return <section className={place.stack} aria-labelledby="recaps-agency-reports">
    <XaLabel as="h2" id="recaps-agency-reports">Reports from your agency</XaLabel>
    {reports.kind === "unavailable" ? <XaNote tone="trouble" pebble role="alert">Agency reports couldn&apos;t load. Reload to try again.</XaNote>
      : !reports.items.length ? <XaNote>No reports from your agency yet.</XaNote>
        : <XaRows label="Reports from your agency">{reports.items.map(item => <XaRow key={item.reportId} title={`${careMonthLabel(item.month).split(" ")[0]} report from ${item.agencyName}`}
          meta={`${item.latestRelease.number > 1 ? "Updated " : ""}${careShortDate(item.latestRelease.publishedAt)}`}
          href={`/workspace/care-reports/${item.reportId}?workspaceId=${encodeURIComponent(workspaceId)}`} />)}</XaRows>}
  </section>;
}

type ShellChrome = Partial<Omit<ComponentProps<typeof StrelvaShell>, "children">>;

export function WorkspaceRecaps({ workspaceId, state, period, outcomes, preview = false, releaseLabel, careReports, recapId, chrome, hrefBase, seeHrefFor }: { workspaceId: string; state: WorkspaceRecapsState; period: RecapPeriodFilter; outcomes?: Record<string, OutcomeRecap>; preview?: boolean; releaseLabel?: string; careReports?: OwnerCareReportsState; recapId?: string; chrome?: ShellChrome; hrefBase?: string; /** Where a recap's "See that week" opens; defaults to Results for the recap's own window. */ seeHrefFor?: (recap: RecapView) => string }) {
  const homeHref = `/workspace?workspaceId=${encodeURIComponent(workspaceId)}`;
  const base = hrefBase ?? (preview ? "/preview/strelva/recaps" : "/workspace/recaps");
  const href = (value: RecapPeriodFilter, recap?: string) => `${base}?workspaceId=${encodeURIComponent(workspaceId)}${value === "all" ? "" : `&period=${value}`}${recap ? `&recap=${encodeURIComponent(recap)}` : ""}`;
  const head = <XaPlaceHead art={<XaSystemTile kind="website" size={56} />} title="Recaps" back={{ href: homeHref, label: `Back to ${XA_PLACE_LABELS.today}` }}
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
                  {!state.sites.length ? <XaPlaceTrouble role="status" pose="website" title="No site is connected to this business yet." quiet="Recaps start once a website is connected or published here. Pebble starts counting the same day." />
                    : state.sites.map(site => {
                      const { current } = pick(site);
                      return <section key={site.tenantId} aria-label={site.siteName} className={place.stack}>
                        {state.sites.length > 1 ? <XaLabel as="h2">{site.siteName}</XaLabel> : null}
                        {site.unavailable ? <XaPlaceTrouble title={`Recaps for ${site.siteName} couldn't be read right now.`} quiet="Nothing is lost. Reload to try again." />
                          : !current ? <XaPlaceTrouble role="status" pose="resting" title={period === "month" ? "No monthly recap yet." : period === "week" ? "No weekly recap yet." : `No recaps for ${site.siteName} yet.`} quiet="Pebble writes the first one after a full week of visits." />
                            : <><RecapOutcome recap={current} siteName={site.siteName} outcome={outcomes?.[current.id]} seeHref={seeHrefFor ? seeHrefFor(current) : resultsHref(workspaceId, "custom", { from: current.start.slice(0, 10), to: current.end.slice(0, 10) })} />{single ? null : others(site)}</>}
                      </section>;
                    })}
                </div>
              </div>;
            })()}
    </XaPlace>
  </StrelvaShell>;
}
