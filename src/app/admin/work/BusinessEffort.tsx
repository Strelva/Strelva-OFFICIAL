/**
 * Human minutes per business per month (ADR 0009 factory test) for the operator
 * console. Server-safe presentation over the measure; the log and void controls
 * are client islands that call re-verified server actions.
 */
import { Panel, PanelCount, Vital } from "../console";
import { StMono, StNotice, StRow, StRows, StSection, StState } from "@/components/ui/strelva/Kit";
import type { BusinessEffortMeasure, EffortDirection, PortfolioMonth } from "@/platform/business-effort/measure";
import type { BusinessEffortLoad } from "./effort-data";
import { EffortLogForm } from "./EffortLogForm";
import { EffortEntries } from "./EffortEntries";
import { measureQueueEffort } from "@/platform/business-effort/measure";
import { operatorQueueReleaseEnabled } from "@/platform/operator-queue/release";

const DIRECTION: Record<EffortDirection, { label: string; tone: "good" | "warn" | "neutral" }> = {
  falling: { label: "Falling", tone: "good" },
  rising: { label: "Rising", tone: "warn" },
  flat: { label: "Flat", tone: "neutral" },
  insufficient_data: { label: "Not enough data", tone: "neutral" },
};

export function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00.000Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function minutesText(value: number | null | undefined): string {
  return value === null || value === undefined ? "Not logged" : String(Math.round(value * 10) / 10);
}

function Coverage({ period }: { period: PortfolioMonth }) {
  return <span>{monthLabel(period.month)}: {period.loggedBusinessCount} of {period.businessCount} logged, {period.unloggedBusinessCount} not logged</span>;
}

function DirectionChip({ direction }: { direction: EffortDirection }) {
  const { label, tone } = DIRECTION[direction];
  return <StState kind={tone === "good" ? "live" : tone === "warn" ? "need" : "draft"}>{label}</StState>;
}

function NotReady({ load }: { load: Exclude<BusinessEffortLoad, { state: "ready" }> }) {
  if (load.state === "unavailable") {
    return (
      <>
        <StNotice tone="critical"><span role="alert">Live counts are paused for human minutes.</span></StNotice>
        <p className="text-sm leading-5 text-gray-muted">
          The human-minute ledger could not be read. No totals are shown rather than an unverified zero.
        </p>
      </>
    );
  }
  if (load.state === "denied") {
    return (
      <p className="text-sm leading-5 text-gray-muted">
        Your session could not be verified as an active super admin for human minutes. Sign in again with a verified operator account.
      </p>
    );
  }
  return (
    <p className="text-sm leading-5 text-gray-muted">
      Human minutes are recorded against client businesses, which are unavailable while the workspace release is off.
    </p>
  );
}

function BusinessRows({ rows, latestMonth }: { rows: BusinessEffortMeasure[]; latestMonth: string }) {
  return <StRows label={`Human minutes by business, ${monthLabel(latestMonth)}`}>
    {rows.map(row => <StRow key={row.businessId} title={row.name ?? "Unlisted business"}
      detail={<>{row.tenantIds.length ? <StMono>{row.tenantIds.join(", ")} · </StMono> : null}Previous {minutesText(row.previous?.minutes)} · Latest {minutesText(row.latest?.minutes)} · This month {minutesText(row.monthToDate?.minutes)}</>}
      end={<DirectionChip direction={row.direction} />} />)}
  </StRows>;
}

/** Portfolio view for /admin/work. */
export function BusinessEffortPortfolio({ load, readOnly = false }: { load: BusinessEffortLoad; readOnly?: boolean }) {
  if (load.state !== "ready") {
    return (
      <StSection title="Human minutes per business">
        <NotReady load={load} />
      </StSection>
    );
  }
  const { overview, today } = load;
  const { measure } = overview;
  const { latest, previous, monthToDate } = measure.portfolio;
  const measured = [...measure.businesses]
    .sort((a, b) => (b.latest?.minutes ?? -1) - (a.latest?.minutes ?? -1) || (a.name ?? "").localeCompare(b.name ?? ""));
  const names = Object.fromEntries(overview.businesses.map((b) => [b.id, b.name]));
  const options = overview.businesses.map((b) => ({
    id: b.id,
    label: b.tenantIds.length > 0 ? `${b.name} (${b.tenantIds.join(", ")})` : b.name,
  }));
  const queueMinutes = operatorQueueReleaseEnabled() ? measureQueueEffort(overview.entries, measure.currentMonth) : [];

  return (
    <StSection title="Human minutes per business" meta={<StMono>{monthLabel(measure.latestMonth)}</StMono>}>
      <p className="max-w-3xl text-sm leading-5 text-gray-muted">
        The factory test: human minutes needed per business each month must fall. Months are UTC calendar months; the latest month is the last complete one. Every client business counts. A month without a non-voided entry is not logged; record 0 explicitly to confirm no human work. Portfolio medians and averages require logs for every business.
      </p>
      <StRows label="Human-minute summary">
        <StRow title="Median per business" detail={`Across ${latest.businessCount} businesses. ${monthLabel(previous.month)}: ${previous.medianMinutesPerBusiness === null ? "Not enough data" : minutesText(previous.medianMinutesPerBusiness)}${previous.medianMinutesPerBusiness === null ? "" : " min"} (${previous.businessCount} businesses)`}
          end={<><StMono>{latest.medianMinutesPerBusiness === null ? "Not enough data" : `${minutesText(latest.medianMinutesPerBusiness)} min`}</StMono>{measure.portfolio.direction !== "insufficient_data" ? <DirectionChip direction={measure.portfolio.direction} /> : null}</>} />
        <StRow title="Average per business" detail={`Across ${latest.businessCount} businesses`} end={<StMono>{latest.averageMinutesPerBusiness === null ? "Not enough data" : `${minutesText(latest.averageMinutesPerBusiness)} min`}</StMono>} />
        <StRow title="Logged minutes" detail={`${latest.loggedBusinessCount} of ${latest.businessCount} businesses logged; ${latest.unloggedBusinessCount} not logged`} end={<StMono>{latest.loggedBusinessCount === 0 ? "Not logged" : `${latest.loggedMinutes} min`}</StMono>} />
        <StRow title="Month to date · logged" detail={`${monthToDate.loggedBusinessCount} of ${monthToDate.businessCount} businesses logged; ${monthToDate.unloggedBusinessCount} not logged`} end={<StMono>{monthToDate.loggedBusinessCount === 0 ? "Not logged" : `${monthToDate.loggedMinutes} min`}</StMono>} />
      </StRows>

      <p className="text-sm leading-5 text-gray-muted" aria-label="Monthly log coverage">
        <Coverage period={previous} /> · <Coverage period={latest} /> · <Coverage period={monthToDate} />
      </p>

      <section aria-labelledby="effort-by-business">
        <h3 id="effort-by-business" className="mb-1 text-base font-semibold text-warm-white">By business</h3>
        {measured.length > 0 ? (
          <BusinessRows rows={measured} latestMonth={measure.latestMonth} />
        ) : (
          <p className="py-3 text-sm leading-5 text-gray-muted">No client businesses exist yet. Every business will appear here, including those not logged.</p>
        )}
      </section>

      <section aria-labelledby="effort-log">
        {operatorQueueReleaseEnabled() && <div className="mb-5">
          <h3 className="text-base font-semibold text-warm-white">This month by queue kind and System</h3>
          {queueMinutes.length ? <StRows label="This month by queue kind and System">
            {queueMinutes.map(row => <StRow key={JSON.stringify([row.businessId, row.kind, row.systemId, row.systemLabel])}
              title={names[row.businessId] ?? "Business"} detail={`${row.systemLabel ?? "Not attached"} · ${row.kind.replaceAll("_", " ")}`} end={<StMono>{row.minutes} min</StMono>} />)}
          </StRows> : <p className="mt-2 text-sm text-gray-muted">No attributed queue minutes this month. Manual minutes stay in the business totals.</p>}
        </div>}
        <h3 id="effort-log" className="mb-3 text-base font-semibold text-warm-white">Record human minutes</h3>
        {options.length > 0 ? (
          readOnly ? <StNotice>Preview only. Recording minutes is unavailable here.</StNotice> : <EffortLogForm businesses={options} today={today} />
        ) : (
          <p className="text-sm leading-5 text-gray-muted">No client businesses exist yet. Minutes are recorded against a client business.</p>
        )}
      </section>

      <section aria-labelledby="effort-recent">
        <h3 id="effort-recent" className="mb-1 text-base font-semibold text-warm-white">Recent entries</h3>
        <EffortEntries entries={overview.entries.slice(0, 15)} businessNames={names} readOnly={readOnly} />
      </section>
    </StSection>
  );
}

/** One managed site's business on /admin/clients/[id]. */
export function BusinessEffortForSite({ load, tenantId }: { load: BusinessEffortLoad; tenantId: string }) {
  if (load.state !== "ready") {
    return (
      <Panel title="Human minutes" bodyClassName="px-[18px] pb-[18px]">
        <NotReady load={load} />
      </Panel>
    );
  }
  const business = load.overview.businesses.find((b) => b.tenantIds.includes(tenantId));
  if (!business) {
    return (
      <Panel title="Human minutes" bodyClassName="px-[18px] pb-[18px]">
        <p className="text-[12px] leading-5 text-gray-muted">
          This site is not attached to a client business, so its human minutes cannot be recorded here yet. Minutes belong to the business; attach the site through that business&apos;s website binding. Other businesses are measured on Internal work.
        </p>
      </Panel>
    );
  }
  const row = load.overview.measure.businesses.find((b) => b.businessId === business.id);
  const { latestMonth, previousMonth } = load.overview.measure;
  const entries = load.overview.entries.filter((entry) => entry.businessId === business.id).slice(0, 10);
  const trend = DIRECTION[row?.direction ?? "insufficient_data"];

  return (
    <Panel title="Human minutes" trailing={<PanelCount>{business.name}</PanelCount>} bodyClassName="space-y-5 px-[18px] pb-[18px]">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Vital
          label={monthLabel(latestMonth)}
          value={minutesText(row?.latest?.minutes)}
          suffix={row?.latest?.minutes == null ? undefined : "min"}
          delta={trend.label}
          deltaTone={trend.tone}
          verdict={`${monthLabel(previousMonth)}: ${minutesText(row?.previous?.minutes)}${row?.previous?.minutes == null ? "" : " min"}`}
        />
        <Vital label="Month to date" value={minutesText(row?.monthToDate?.minutes)} suffix={row?.monthToDate?.minutes == null ? undefined : "min"} />
        <Vital label="First log" value={business.firstEffortOn ? monthLabel(business.firstEffortOn.slice(0, 7)) : "Not logged"} />
      </div>
      <EffortLogForm businesses={[{ id: business.id, label: business.name }]} today={load.today} />
      <section aria-labelledby="site-effort-recent">
        <h3 id="site-effort-recent" className="mb-1 text-[12.5px] font-semibold text-warm-white">Recent entries</h3>
        <EffortEntries entries={entries} />
      </section>
    </Panel>
  );
}
