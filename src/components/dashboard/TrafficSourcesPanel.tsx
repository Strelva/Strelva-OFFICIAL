import Link from "next/link";
import { Compass, Link2 } from "lucide-react";
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
  if (!s || s === "(not set)" || s === "(none)") return "Direct / typed in";
  if (s === "(direct)") return "Direct / typed in";
  if (s === "google") return "Google";
  if (s === "bing") return "Bing";
  if (s.includes("maps")) return "Google Maps";
  if (s.includes("facebook") || s === "fb" || s.includes("instagram") || s.includes("ig"))
    return source.includes("insta") || s.includes("ig") ? "Instagram" : "Facebook";
  // Domains come through as e.g. "l.instagram.com" — show them as-is, trimmed.
  return source;
}

/** Section shell — matches the Search & Analytics panel eyebrow rhythm so the
 *  two GA-backed panels read as one system. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
          Traffic
        </p>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-[18px] font-normal text-warm-black">
          Where your visitors come from
        </h2>
      </div>
      {children}
    </section>
  );
}

/**
 * "Where your visitors come from" — the GA4 traffic-sources view. GA4 totals and
 * most-visited pages already render in the Search & Analytics panel; this fills
 * the missing piece (which channels send people your way) plus the pages they
 * land on. Connect-state mirrors the GSC connect prompt when GA4 is unconfigured.
 */
export function TrafficSourcesPanel({ ga, connectHref }: TrafficSourcesPanelProps) {
  const ok = ga?.status === "ok";
  const unavailable = ga?.status === "unavailable";

  // Not linked yet — read as a next step, not a broken tab.
  if (!ok && !unavailable) {
    return (
      <Shell>
        <div className="rounded-xl border border-accent/20 bg-accent-dim/40 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-raised text-accent">
              <Compass className="h-4 w-4" strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-warm-black">
                Connect Google and we&apos;ll show where your visitors come from
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-gray-muted">
                Search, maps, social, or a direct link. See which channels send people to your
                site and the pages they land on.
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

  // Configured, but data isn't ready this cycle. Quiet, never an API error.
  if (!ok) {
    return (
      <Shell>
        <div className="rounded-xl border border-glass-border bg-glass p-5">
          <p className="text-[13px] leading-relaxed text-gray-muted">
            Your visitor sources are coming soon. We&apos;re gathering where people find you.
            Check back shortly.
          </p>
        </div>
      </Shell>
    );
  }

  const sources = ga!.topSources.filter((s) => s.sessions > 0).slice(0, 6);
  const pages = ga!.topPages.filter((p) => p.views > 0).slice(0, 5);

  // Connected, but nothing measured yet (fresh property, no sessions).
  if (sources.length === 0 && pages.length === 0) {
    return (
      <Shell>
        <div className="rounded-xl border border-glass-border bg-glass p-5">
          <p className="text-[13px] leading-relaxed text-gray-muted">
            Google is connected. As visitors arrive, we&apos;ll show which channels bring them here.
          </p>
        </div>
      </Shell>
    );
  }

  const maxSessions = Math.max(1, ...sources.map((s) => s.sessions));

  return (
    <Shell>
      <p className="text-[12px] text-gray-muted">Last 4 weeks</p>

      {sources.length > 0 && (
        <div className="space-y-2.5">
          {sources.map((s) => {
            const pct = Math.round((s.sessions / maxSessions) * 100);
            return (
              <div key={s.source} className="rounded-xl border border-glass-border bg-glass p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-[13px] font-medium text-warm-black">
                    {sourceLabel(s.source)}
                  </span>
                  <span className="shrink-0 text-[13px] tabular-nums text-gray-muted">
                    {s.sessions.toLocaleString()} {s.sessions === 1 ? "visit" : "visits"}
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${pct}%` }}
                    aria-hidden="true"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pages.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
            Where they land
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
                {pages.map((p) => (
                  <tr key={p.path} className="border-t border-glass-border first:border-t-0">
                    <td className="px-4 py-2.5 text-warm-black">{p.path}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-fg">
                      {p.views.toLocaleString()}
                    </td>
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
