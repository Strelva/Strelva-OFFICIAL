import Link from "next/link";
import type { ComponentType } from "react";
import { Search, Eye, MapPin, Users, MousePointerClick, Link2 } from "lucide-react";
import type { SearchPerf, GaPerf } from "@/lib/analytics";

interface SearchAnalyticsPanelProps {
  /** Live Search Console performance for this tenant (or null when not loaded). */
  search?: SearchPerf | null;
  /** Live GA4 performance for this tenant (or null when not loaded). */
  ga?: GaPerf | null;
  /** Where the "Connect Google" CTA sends the owner (dashboard-aware). */
  connectHref: string;
}

function StatTile({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <div className="rounded-xl border border-glass-border bg-glass p-4">
      <div className="mb-3 flex items-center gap-2 text-gray-muted">
        <Icon className="h-4 w-4" strokeWidth={1.5} />
        <span className="text-[11px] font-medium uppercase tracking-[0.12em]">{label}</span>
      </div>
      <p className="text-[26px] font-semibold leading-none text-warm-black">{value}</p>
      <p className="mt-2 text-[12px] leading-relaxed text-gray-muted">{detail}</p>
    </div>
  );
}

/** Section shell — shared eyebrow + heading so every state looks intentional. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
          Search &amp; Analytics
        </p>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-[18px] font-normal text-warm-black">
          How people find you on Google
        </h2>
      </div>
      {children}
    </section>
  );
}

export function SearchAnalyticsPanel({ search, ga, connectHref }: SearchAnalyticsPanelProps) {
  const searchOk = search?.status === "ok";
  const gaOk = ga?.status === "ok";
  const anyOk = searchOk || gaOk;
  const anyUnavailable = search?.status === "unavailable" || ga?.status === "unavailable";

  // Most clients haven't linked Google yet — this must read as a next step, not a
  // broken tab. A gentle connect nudge pointing at the existing Connect Google flow.
  if (!anyOk && !anyUnavailable) {
    return (
      <Shell>
        <div className="rounded-xl border border-accent/20 bg-accent-dim/40 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-raised text-accent">
              <Link2 className="h-4 w-4" strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-warm-black">
                Connect Google to see your search performance
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-gray-muted">
                Link your Google account and we&apos;ll show the searches people use to find you and
                the pages they visit most.
              </p>
              <Link
                href={connectHref}
                className="mt-3 inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg bg-accent px-4 text-[13px] font-medium text-on-accent transition-colors hover:bg-accent/85"
              >
                <Link2 className="h-4 w-4" strokeWidth={1.5} />
                Connect Google
              </Link>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  // Configured, but the data isn't ready this cycle (auth hiccup / fresh property).
  // Quiet and reassuring — never surface an API error to the owner.
  if (!anyOk) {
    return (
      <Shell>
        <div className="rounded-xl border border-glass-border bg-glass p-5">
          <p className="text-[13px] leading-relaxed text-gray-muted">
            Your search data is coming soon. We&apos;re gathering how people find you on Google.
            Check back shortly.
          </p>
        </div>
      </Shell>
    );
  }

  const position = searchOk && search!.position > 0 ? `#${search!.position}` : null;
  const topQueries = searchOk ? search!.topQueries.slice(0, 5) : [];
  const topPages = gaOk ? ga!.topPages.slice(0, 5) : [];

  return (
    <Shell>
      <p className="text-[12px] text-gray-muted">Last 4 weeks</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {searchOk && (
          <>
            <StatTile
              label="Found you"
              value={search!.clicks.toLocaleString()}
              detail="clicked through from Google"
              icon={Search}
            />
            <StatTile
              label="Times shown"
              value={search!.impressions.toLocaleString()}
              detail="appeared in Google search"
              icon={Eye}
            />
            <StatTile
              label="Average spot"
              value={position ?? "—"}
              detail="where you rank on Google"
              icon={MapPin}
            />
          </>
        )}
        {gaOk && (
          <>
            <StatTile
              label="Visitors"
              value={ga!.users.toLocaleString()}
              detail="people who visited your site"
              icon={Users}
            />
            <StatTile
              label="Visits"
              value={ga!.sessions.toLocaleString()}
              detail="total visits to your site"
              icon={MousePointerClick}
            />
          </>
        )}
      </div>

      {topQueries.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
            What people search to find you
          </p>
          <div className="overflow-hidden rounded-xl border border-glass-border bg-glass">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-glass-border text-[11px] uppercase tracking-wide text-gray-muted">
                  <th scope="col" className="px-4 py-2.5 font-medium">Search</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Clicks</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Times shown</th>
                </tr>
              </thead>
              <tbody>
                {topQueries.map((q, i) => (
                  <tr key={`${q.query}-${i}`} className="border-t border-glass-border first:border-t-0">
                    <td className="px-4 py-2.5 text-warm-black">{q.query}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-fg">{q.clicks.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-fg">{q.impressions.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {topPages.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
            Most-visited pages
          </p>
          <div className="overflow-hidden rounded-xl border border-glass-border bg-glass">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-glass-border text-[11px] uppercase tracking-wide text-gray-muted">
                  <th scope="col" className="px-4 py-2.5 font-medium">Page</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Visits</th>
                </tr>
              </thead>
              <tbody>
                {topPages.map((p, i) => (
                  <tr key={`${p.path}-${i}`} className="border-t border-glass-border first:border-t-0">
                    <td className="px-4 py-2.5 text-warm-black">{p.path}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-fg">{p.views.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Shell>
  );
}
