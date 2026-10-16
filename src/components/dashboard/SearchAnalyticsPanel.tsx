import { XaLabel, XaRow, XaRows, XaSays, XaTextLink } from "@/components/ui/strelva/Xa";
import { pageName } from "./page-name";
import type { SearchPerf, GaPerf } from "@/lib/analytics";

interface SearchAnalyticsPanelProps {
  /** Live Search Console performance for this tenant (or null when not loaded). */
  search?: SearchPerf | null;
  /** Live GA4 performance for this tenant (or null when not loaded). */
  ga?: GaPerf | null;
  /** Where the "Connect Google" CTA sends the owner (dashboard-aware). */
  connectHref: string;
}

/** Section shell: one sentence-case label so every state reads as the same place. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="search-label">
      <XaLabel id="search-label">How people find you on Google</XaLabel>
      {children}
    </section>
  );
}

export function SearchAnalyticsPanel({ search, ga, connectHref }: SearchAnalyticsPanelProps) {
  const searchOk = search?.status === "ok";
  const gaOk = ga?.status === "ok";
  const anyOk = searchOk || gaOk;
  const anyUnavailable = search?.status === "unavailable" || ga?.status === "unavailable";

  // Most clients haven't linked Google yet: a next step, not a broken tab.
  if (!anyOk && !anyUnavailable) {
    return (
      <Shell>
        <XaSays links={[<XaTextLink key="connect" href={connectHref}>Connect Google</XaTextLink>]}>Link Google and I show the searches people use to find you and the pages they visit most.</XaSays>
      </Shell>
    );
  }

  // Configured, but the data isn't ready this cycle. Honest, not alarming, no raw API error.
  if (!anyOk) {
    return (
      <Shell>
        <p className="m-0 text-[15px] text-[var(--st-text-2)]">Google didn&apos;t answer this time. Strelva tries again at the next refresh; nothing is lost.</p>
      </Shell>
    );
  }

  const topQueries = searchOk ? search!.topQueries.slice(0, 5) : [];
  const topPages = gaOk ? ga!.topPages.slice(0, 5) : [];
  const searchLine = searchOk
    ? `Over the last 4 weeks Google showed you ${search!.impressions.toLocaleString()} times and ${search!.clicks.toLocaleString()} ${search!.clicks === 1 ? "person" : "people"} clicked through${search!.position > 0 ? `; you usually sit around spot ${search!.position}` : ""}.`
    : null;
  const gaLine = gaOk ? `${ga!.users.toLocaleString()} ${ga!.users === 1 ? "person" : "people"} visited your site ${ga!.sessions.toLocaleString()} times.` : null;

  return (
    <Shell>
      <p className="m-0 max-w-[640px] text-[15px] leading-[1.5] text-[var(--st-text-body)]">{[searchLine, gaLine].filter(Boolean).join(" ")}</p>
      <div className="grid gap-8 md:grid-cols-2">
        {topQueries.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="m-0 text-[13px] text-[var(--st-text-3)]">What they searched</p>
            <XaRows label="What they searched">
              {topQueries.map((q, i) => <XaRow key={`${q.query}-${i}`} title={q.query} meta={`${q.clicks.toLocaleString()} ${q.clicks === 1 ? "click" : "clicks"}`} detail={`Shown ${q.impressions.toLocaleString()} times`} />)}
            </XaRows>
          </div>
        )}
        {topPages.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="m-0 text-[13px] text-[var(--st-text-3)]">Pages they opened most</p>
            <XaRows label="Pages they opened most">
              {topPages.map((p, i) => <XaRow key={`${p.path}-${i}`} title={pageName(p.path)} meta={`${p.views.toLocaleString()} ${p.views === 1 ? "visit" : "visits"}`} />)}
            </XaRows>
          </div>
        )}
      </div>
    </Shell>
  );
}
