import { StEmpty, StHead, StLabel, StMono, StNotice, StPage, StPillLink, StRow, StRows, StSection, StSkeleton, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import type { RecapView, SiteRecaps } from "@/products/recaps/server";
import styles from "@/experience/publishing/publishing.module.css";

export type RecapPeriodFilter = "all" | "week" | "month";
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
function delta(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "Same as before";
  return `${value > 0 ? "Up" : "Down"} ${Math.abs(Math.round(value))}%`;
}

export function RecapOutcome({ recap, outcome, siteName }: { recap: RecapView; outcome?: OutcomeRecap; siteName: string }) {
  const proof = recap.inquiryOutcome?.status === "available" ? recap.inquiryOutcome : undefined;
  const inquiryMissing = recap.inquiryOutcome?.status === "unavailable" ? "Inquiry evidence couldn't be read when this recap was saved" : "Not counted in this saved recap";
  const metrics = [
    { label: `Visits to ${siteName}`, value: recap.visits, detail: delta(recap.visitsDelta) },
    { label: "Inquiries", value: outcome?.inquiries ?? proof?.inquiries, detail: outcome?.inquiryDetail ?? (proof ? "Recorded form submissions" : undefined), missing: inquiryMissing },
    { label: "Answered", value: outcome?.answered ?? proof?.answered, detail: outcome?.answeredDetail ?? (proof ? "First business replies accepted by the mail provider · delivery not verified" : undefined), missing: inquiryMissing },
    { label: "Bookings", value: outcome?.bookings, detail: outcome?.bookingDetail },
    { label: "New reviews", value: outcome?.reviews ?? recap.newReviews, detail: outcome?.reviewDetail ?? "Recorded review events; provider isn't identified in this recap" },
  ];
  return <article className={styles.stack} aria-label={recapTitle(recap)}>
    <StSection title={recapTitle(recap)} meta={recap.period === "month" ? "Monthly recap" : "Weekly recap"}>
      {recap.summary ? <p className={styles.copy}>{recap.summary}</p> : null}
      <StRows label="Visits to reviews">{metrics.map(metric => <StRow key={metric.label} stackOnPhone={false} lead={<StMono size="value">{metric.value == null ? "—" : metric.value.toLocaleString("en-US")}</StMono>} title={metric.label} detail={metric.value == null ? metric.missing || "Not counted in this saved recap" : metric.detail} />)}</StRows>
      {!outcome ? <p className={styles.copy}><StMono>{recap.customerActions}</StMono> booking-link and phone-link clicks were recorded. These are clicks, not confirmed bookings or answered calls.</p> : null}
      {recap.highlights.length ? <StRows label="What changed">{recap.highlights.map((highlight, index) => <StRow key={index} title={highlight} />)}</StRows> : null}
      {recap.nextAction ? <StSurface label="Suggested next step"><StLabel>{recap.nextAction.title}</StLabel><p className={styles.copy}>{recap.nextAction.description}</p><p className={styles.copy}>A suggestion. Nothing starts from this recap.</p></StSurface> : null}
      <p className={styles.copy}>Counts come from the saved site recap. Strelva doesn&apos;t count walk-ins or calls made away from the site. A dash means unavailable, not zero.</p>
    </StSection>
  </article>;
}

export function WorkspaceRecaps({ workspaceId, state, period, outcomes, preview = false }: { workspaceId: string; state: WorkspaceRecapsState; period: RecapPeriodFilter; outcomes?: Record<string, OutcomeRecap>; preview?: boolean }) {
  const homeHref = `/workspace?workspaceId=${encodeURIComponent(workspaceId)}`;
  const filterHref = (value: RecapPeriodFilter) => `${preview ? "/preview/strelva/recaps" : "/workspace/recaps"}?workspaceId=${encodeURIComponent(workspaceId)}${value === "all" ? "" : `&period=${value}`}`;
  return <main className={styles.paper} data-dashboard data-workspace-theme="linen"><StPage>
    <StHead crumb={{ label: "Back to Home", href: homeHref }} title="Recaps" meta="What Strelva saw on your site each week and month." />
    {state.kind === "loading" ? <><StSkeleton label="Loading recaps" width="70%" /><StSkeleton /></> : state.kind === "permission" ? <StNotice tone="critical"><strong>These recaps belong to another business</strong><p>Your account isn&apos;t a member of this business. Ask its owner to invite you, or open your own workspace.</p><StTextButton href="/workspace">Open your workspace</StTextButton></StNotice> : state.kind === "error" ? <StNotice tone="critical"><strong>Recaps couldn&apos;t load</strong><p>Your saved recaps are kept. Reload the page to try again.</p><StTextButton href={filterHref(period)}>Reload recaps</StTextButton></StNotice> : <>
      <nav aria-label="Recap period" className={styles.actions}>{FILTERS.map(filter => <StPillLink key={filter.value} current={period === filter.value} variant="soft" href={filterHref(filter.value)}>{filter.label}{period === filter.value ? " · selected" : ""}</StPillLink>)}</nav>
      {!state.sites.length ? <StEmpty>No site is connected to this business yet. Recaps start once Strelva runs a website for this business.</StEmpty> : state.sites.map(site => {
        const recaps = site.recaps.filter(recap => period === "all" || recap.period === period);
        return <section key={site.tenantId} aria-label={site.siteName} className={styles.stack}>
          {state.sites.length > 1 ? <StLabel as="h3">{site.siteName}</StLabel> : null}
          {site.unavailable ? <StNotice tone="critical">Recaps for {site.siteName} couldn&apos;t be read right now.</StNotice> : !recaps.length ? <StEmpty>{period === "month" ? "No monthly recap yet." : period === "week" ? "No weekly recap yet." : `No recaps for ${site.siteName} yet.`}</StEmpty> : recaps.map(recap => <RecapOutcome key={`${recap.period}:${recap.id}`} recap={recap} siteName={site.siteName} outcome={outcomes?.[recap.id]} />)}
        </section>;
      })}
    </>}
  </StPage></main>;
}
