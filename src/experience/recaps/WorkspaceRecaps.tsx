import Link from "next/link";
import { Card } from "@/components/ui/Card";
import type { RecapView, SiteRecaps } from "@/products/recaps/server";

/**
 * Recaps, in the workspace. The same weekly and monthly recaps the owner gets
 * by email and used to read at /dashboard/reports, one card each, newest
 * first. Server-rendered; the period filter is a plain link.
 */

export type RecapPeriodFilter = "all" | "week" | "month";

export type WorkspaceRecapsState =
  | { kind: "ready"; sites: SiteRecaps[] }
  | { kind: "permission" }
  | { kind: "error" };

const FILTERS: Array<{ value: RecapPeriodFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
];

function dateLabel(value: string, options: Intl.DateTimeFormatOptions): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}

export function recapTitle(recap: RecapView): string {
  return recap.period === "month"
    ? dateLabel(recap.start, { month: "long", year: "numeric" })
    : `Week of ${dateLabel(recap.start, { month: "short", day: "numeric", year: "numeric" })}`;
}

function delta(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "Same as before";
  return `${value > 0 ? "Up" : "Down"} ${Math.abs(Math.round(value))}%`;
}

function RecapCard({ recap }: { recap: RecapView }) {
  return (
    <Card padding="lg" className="text-warm-black">
      <article aria-labelledby={`recap-${recap.id}`}>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-muted">{recap.period === "month" ? "Monthly recap" : "Weekly recap"}</p>
        <h3 id={`recap-${recap.id}`} className="mt-2 font-display text-[24px] font-medium leading-tight">{recapTitle(recap)}</h3>
        {recap.summary ? <p className="mt-3 text-[15px] leading-7 text-gray-muted">{recap.summary}</p> : null}
        <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div><dt className="text-xs text-gray-muted">Visits</dt><dd className="mt-1 text-lg font-medium tabular-nums">{recap.visits.toLocaleString("en-US")}</dd></div>
          <div><dt className="text-xs text-gray-muted">Compared with before</dt><dd className="mt-1 text-lg font-medium">{delta(recap.visitsDelta)}</dd></div>
          <div><dt className="text-xs text-gray-muted">Bookings and calls</dt><dd className="mt-1 text-lg font-medium tabular-nums">{recap.customerActions.toLocaleString("en-US")}</dd></div>
        </dl>
        {recap.highlights.length > 0 ? (
          <ul className="mt-5 grid gap-2 text-sm leading-6 text-gray-muted">
            {recap.highlights.map((highlight, index) => <li key={index} className="flex gap-2"><span aria-hidden="true">·</span><span>{highlight}</span></li>)}
          </ul>
        ) : null}
        {recap.nextAction ? (
          <p className="mt-5 border-t border-gray-border pt-4 text-sm leading-6">
            <span className="font-medium">Next: {recap.nextAction.title}.</span> <span className="text-gray-muted">{recap.nextAction.description}</span>
          </p>
        ) : null}
      </article>
    </Card>
  );
}

export function WorkspaceRecaps({ workspaceId, state, period }: { workspaceId: string; state: WorkspaceRecapsState; period: RecapPeriodFilter }) {
  const homeHref = `/workspace?workspaceId=${encodeURIComponent(workspaceId)}`;
  const filterHref = (value: RecapPeriodFilter) => `/workspace/recaps?workspaceId=${encodeURIComponent(workspaceId)}${value === "all" ? "" : `&period=${value}`}`;
  return (
    <main className="min-h-dvh bg-canvas px-4 py-10 text-warm-black sm:px-6 md:px-8 md:py-12 lg:px-12">
      <div className="mx-auto max-w-[760px]">
        <a className="text-sm text-gray-muted underline-offset-4 hover:underline focus-visible:underline" href={homeHref}>Back to Home</a>
        <p className="mt-10 text-xs font-medium uppercase tracking-[0.14em] text-gray-muted">Recent</p>
        <h1 className="mt-3 font-display text-[34px] font-medium leading-tight sm:text-[40px]">Recaps</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-gray-muted">What Strelva saw on your site each week and month. The same recaps go to your inbox.</p>

        {state.kind === "permission" ? (
          <Card padding="lg" className="mt-8" role="alert">
            <h2 className="text-lg font-medium">These recaps belong to another business</h2>
            <p className="mt-2 text-sm leading-6 text-gray-muted">Your account isn&apos;t a member of this business. Ask its owner to invite you, or open your own workspace.</p>
            <Link className="mt-4 inline-block text-sm font-medium underline-offset-4 hover:underline" href="/workspace">Open your workspace</Link>
          </Card>
        ) : state.kind === "error" ? (
          <Card padding="lg" className="mt-8" role="alert">
            <h2 className="text-lg font-medium">Recaps couldn&apos;t load</h2>
            <p className="mt-2 text-sm leading-6 text-gray-muted">Nothing is lost. Your recap emails still go out. Reload the page to try again.</p>
          </Card>
        ) : (
          <>
            <nav aria-label="Recap period" className="mt-8 inline-flex rounded-lg border border-gray-border p-0.5">
              {FILTERS.map((filter) => (
                <a key={filter.value} href={filterHref(filter.value)} aria-current={period === filter.value ? "page" : undefined}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${period === filter.value ? "bg-warm-black text-warm-white" : "text-gray-muted hover:text-warm-black"}`}>
                  {filter.label}
                </a>
              ))}
            </nav>
            {state.sites.length === 0 ? (
              <Card padding="lg" className="mt-6">
                <h2 className="text-lg font-medium">No site is connected to this business yet</h2>
                <p className="mt-2 text-sm leading-6 text-gray-muted">Recaps start once Strelva runs a website for this business.</p>
              </Card>
            ) : state.sites.map((site) => {
              const recaps = site.recaps.filter((recap) => period === "all" || recap.period === period);
              return (
                <section key={site.tenantId} className="mt-8" aria-labelledby={`site-${site.tenantId}`}>
                  {state.sites.length > 1 ? <h2 id={`site-${site.tenantId}`} className="mb-3 text-lg font-medium">{site.siteName}</h2> : <h2 id={`site-${site.tenantId}`} className="sr-only">{site.siteName}</h2>}
                  {site.unavailable ? (
                    <Card padding="lg" role="status"><p className="text-sm leading-6 text-gray-muted">Recaps for {site.siteName} couldn&apos;t be read right now. Your recap emails are unaffected.</p></Card>
                  ) : recaps.length === 0 ? (
                    <Card padding="lg"><p className="text-sm leading-6 text-gray-muted">{period === "month" ? "No monthly recap yet. The first one arrives at the start of next month." : period === "week" ? "No weekly recap yet." : `No recaps for ${site.siteName} yet. The first one arrives after a full week of visits.`}</p></Card>
                  ) : (
                    <div className="grid gap-4">{recaps.map((recap) => <RecapCard key={`${recap.period}:${recap.id}`} recap={recap} />)}</div>
                  )}
                </section>
              );
            })}
          </>
        )}
      </div>
    </main>
  );
}
