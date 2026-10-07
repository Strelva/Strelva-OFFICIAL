/**
 * Human minutes per business per month (ADR 0009 factory test) for the operator
 * console. Server-safe presentation over the measure; the log and void controls
 * are client islands that call re-verified server actions.
 */
import { Chip, Panel, PanelCount, Vital } from "../console";
import { DataAvailabilityNotice } from "../DataAvailabilityNotice";
import type { BusinessEffortMeasure, EffortDirection, PortfolioMonth } from "@/platform/business-effort/measure";
import type { BusinessEffortLoad } from "./effort-data";
import { EffortLogForm } from "./EffortLogForm";
import { EffortEntries } from "./EffortEntries";

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
  return <Chip tone={tone}>{label}</Chip>;
}

function NotReady({ load }: { load: Exclude<BusinessEffortLoad, { state: "ready" }> }) {
  if (load.state === "unavailable") {
    return (
      <>
        <DataAvailabilityNotice sources={["human minutes"]} />
        <p className="text-[12px] leading-5 text-gray-muted">
          The human-minute ledger could not be read. No totals are shown rather than an unverified zero.
        </p>
      </>
    );
  }
  if (load.state === "denied") {
    return (
      <p className="text-[12px] leading-5 text-gray-muted">
        Your session could not be verified as an active super admin for human minutes. Sign in again with a verified operator account.
      </p>
    );
  }
  return (
    <p className="text-[12px] leading-5 text-gray-muted">
      Human minutes are recorded against customer businesses, which are unavailable while the workspace release is off.
    </p>
  );
}

function BusinessRows({ rows, latestMonth }: { rows: BusinessEffortMeasure[]; latestMonth: string }) {
  return (
    <ul className="divide-y divide-glass-border" aria-label={`Human minutes by business, ${monthLabel(latestMonth)}`}>
      {rows.map((row) => (
        <li key={row.businessId} className="grid grid-cols-3 items-center gap-x-4 gap-y-1 py-3 md:grid-cols-[minmax(0,1fr)_90px_90px_90px_130px]">
          <span className="col-span-3 min-w-0 text-[13px] font-semibold text-warm-white md:col-span-1">
            {row.name ?? "Unlisted business"}
            {row.tenantIds.length > 0 && <span className="ml-2 text-[11px] font-normal text-gray-faint">{row.tenantIds.join(", ")}</span>}
          </span>
          <span className="text-[12px] tabular-nums text-gray-muted"><span className="md:sr-only">Previous </span>{minutesText(row.previous?.minutes)}</span>
          <span className="text-[12px] tabular-nums text-warm-white"><span className="md:sr-only">Latest </span>{minutesText(row.latest?.minutes)}</span>
          <span className="text-[12px] tabular-nums text-gray-muted"><span className="md:sr-only">This month </span>{minutesText(row.monthToDate?.minutes)}</span>
          <span className="col-span-3 md:col-span-1"><DirectionChip direction={row.direction} /></span>
        </li>
      ))}
    </ul>
  );
}

/** Portfolio view for /admin/work. */
export function BusinessEffortPortfolio({ load }: { load: BusinessEffortLoad }) {
  if (load.state !== "ready") {
    return (
      <Panel title="Human minutes per business" className="lg:col-span-2" bodyClassName="px-[18px] pb-[18px]">
        <NotReady load={load} />
      </Panel>
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
  const portfolioDirection = DIRECTION[measure.portfolio.direction];

  return (
    <Panel
      title="Human minutes per business"
      trailing={<PanelCount>{monthLabel(measure.latestMonth)}</PanelCount>}
      className="lg:col-span-2"
      bodyClassName="space-y-5 px-[18px] pb-[18px]"
    >
      <p className="max-w-3xl text-[12px] leading-5 text-gray-muted">
        The factory test: human minutes needed per business each month must fall. Months are UTC calendar months; the latest month is the last complete one. Every customer business counts. A month without a non-voided entry is not logged; record 0 explicitly to confirm no human work. Portfolio medians and averages require logs for every business.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Vital
          label="Median per business"
          value={latest.medianMinutesPerBusiness === null ? "Not enough data" : minutesText(latest.medianMinutesPerBusiness)}
          suffix={latest.medianMinutesPerBusiness === null ? undefined : "min"}
          delta={measure.portfolio.direction === "insufficient_data" ? undefined : portfolioDirection.label}
          deltaTone={portfolioDirection.tone}
          verdict={`Across ${latest.businessCount} businesses. ${monthLabel(previous.month)}: ${previous.medianMinutesPerBusiness === null ? "Not enough data" : minutesText(previous.medianMinutesPerBusiness)}${previous.medianMinutesPerBusiness === null ? "" : " min"} (${previous.businessCount} businesses)`}
        />
        <Vital label="Average per business" value={latest.averageMinutesPerBusiness === null ? "Not enough data" : minutesText(latest.averageMinutesPerBusiness)} suffix={latest.averageMinutesPerBusiness === null ? undefined : "min"} verdict={`Across ${latest.businessCount} businesses`} />
        <Vital label="Logged minutes" value={latest.loggedBusinessCount === 0 ? "Not logged" : latest.loggedMinutes} suffix={latest.loggedBusinessCount === 0 ? undefined : "min"} verdict={`${latest.loggedBusinessCount} of ${latest.businessCount} businesses logged; ${latest.unloggedBusinessCount} not logged`} />
        <Vital label="Month to date · logged" value={monthToDate.loggedBusinessCount === 0 ? "Not logged" : monthToDate.loggedMinutes} suffix={monthToDate.loggedBusinessCount === 0 ? undefined : "min"} verdict={`${monthToDate.loggedBusinessCount} of ${monthToDate.businessCount} businesses logged; ${monthToDate.unloggedBusinessCount} not logged`} />
      </div>

      <p className="text-[12px] leading-5 text-gray-muted" aria-label="Monthly log coverage">
        <Coverage period={previous} /> · <Coverage period={latest} /> · <Coverage period={monthToDate} />
      </p>

      <section aria-labelledby="effort-by-business">
        <h3 id="effort-by-business" className="mb-1 text-[12.5px] font-semibold text-warm-white">By business</h3>
        <div className="hidden text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-faint md:grid md:grid-cols-[minmax(0,1fr)_90px_90px_90px_130px] md:gap-x-4" aria-hidden="true">
          <span>Business</span><span>{monthLabel(measure.previousMonth).split(" ")[0]}</span><span>{monthLabel(measure.latestMonth).split(" ")[0]}</span><span>This month</span><span>Direction</span>
        </div>
        {measured.length > 0 ? (
          <BusinessRows rows={measured} latestMonth={measure.latestMonth} />
        ) : (
          <p className="py-3 text-[12px] leading-5 text-gray-muted">No customer businesses exist yet. Every business will appear here, including those not logged.</p>
        )}
      </section>

      <section aria-labelledby="effort-log">
        <h3 id="effort-log" className="mb-3 text-[12.5px] font-semibold text-warm-white">Record human minutes</h3>
        {options.length > 0 ? (
          <EffortLogForm businesses={options} today={today} />
        ) : (
          <p className="text-[12px] leading-5 text-gray-muted">No customer businesses exist yet. Minutes are recorded against a customer business.</p>
        )}
      </section>

      <section aria-labelledby="effort-recent">
        <h3 id="effort-recent" className="mb-1 text-[12.5px] font-semibold text-warm-white">Recent entries</h3>
        <EffortEntries entries={overview.entries.slice(0, 15)} businessNames={names} />
      </section>
    </Panel>
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
          This site is not attached to a customer business, so its human minutes cannot be recorded here yet. Minutes belong to the business; attach the site through that business&apos;s website binding. Other businesses are measured on Internal work.
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
