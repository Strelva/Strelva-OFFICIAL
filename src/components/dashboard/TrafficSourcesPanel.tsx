import { XaLabel, XaSays, XaTextLink } from "@/components/ui/strelva/Xa";
import type { GaPerf } from "@/lib/analytics";

interface TrafficSourcesPanelProps {
  /** Live GA4 performance for this tenant (or null when not loaded). */
  ga?: GaPerf | null;
  /** Where the "Connect Google" CTA sends the owner (dashboard-aware). */
  connectHref: string;
}

/** A friendly label for a GA4 sessionSource value. GA4 uses "(direct)" and
 *  "(not set)" — owners shouldn't see raw analytics tokens. */
function sourceLabel(source: string): string {
  const s = source.trim().toLowerCase();
  if (!s || s === "(not set)" || s === "(none)") return "Typed in or a saved link";
  if (s === "(direct)") return "Typed in or a saved link";
  if (s === "google") return "Google";
  if (s === "bing") return "Bing";
  if (s.includes("maps")) return "Google Maps";
  if (s.includes("facebook") || s === "fb" || s.includes("instagram") || s.includes("ig"))
    return source.includes("insta") || s.includes("ig") ? "Instagram" : "Facebook";
  // Domains come through as e.g. "l.instagram.com" — show them as-is, trimmed.
  return source;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="sources-label">
      <XaLabel id="sources-label">Where your visitors come from</XaLabel>
      {children}
    </section>
  );
}

/**
 * Which channels send people to the site, as labelled bars (the label sits on
 * the bar, no legend). Search totals and pages live in the search panel above.
 */
export function TrafficSourcesPanel({ ga, connectHref }: TrafficSourcesPanelProps) {
  const ok = ga?.status === "ok";
  const unavailable = ga?.status === "unavailable";

  if (!ok && !unavailable) {
    return (
      <Shell>
        <XaSays links={[<XaTextLink key="connect" href={connectHref}>Connect Google</XaTextLink>]}>Connect Google and I show where your visitors come from: search, maps, social or a direct link.</XaSays>
      </Shell>
    );
  }
  if (!ok) {
    return <Shell><p className="m-0 text-[15px] text-[var(--st-text-2)]">Google didn&apos;t answer this time. Strelva tries again at the next refresh.</p></Shell>;
  }
  if (!ga) return null;
  const sources = ga.topSources.filter((s) => s.sessions > 0).slice(0, 6);
  if (sources.length === 0) {
    return <Shell><p className="m-0 text-[15px] text-[var(--st-text-2)]">Google is connected. As visitors arrive, this shows which channels bring them.</p></Shell>;
  }
  const maxSessions = Math.max(1, ...sources.map((s) => s.sessions));

  return (
    <Shell>
      <ul className="m-0 flex max-w-[640px] list-none flex-col gap-3 p-0" aria-label="Visits by where people came from, last 4 weeks">
        {sources.map((s, i) => (
          <li key={`${s.source}-${i}`} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-[15px]">
              <span className="text-[var(--st-text)]">{sourceLabel(s.source)}</span>
              <span className="tabular-nums text-[var(--st-text-2)]">{s.sessions.toLocaleString()} {s.sessions === 1 ? "visit" : "visits"}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--st-inset)]" aria-hidden="true">
              <div className="h-full rounded-full bg-[var(--st-accent)]" style={{ width: `${Math.round((s.sessions / maxSessions) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
