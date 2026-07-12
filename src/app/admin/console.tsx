/**
 * Operator-console design primitives — the shared vocabulary for the redesigned
 * /admin surfaces. Verdict-first, one sage family + three status hues, real logo
 * marks (never colored-initial dots). Presentational + server-safe.
 */
import Link from "next/link";
import type { ReactNode } from "react";

type Tone = "good" | "warn" | "crit" | "neutral" | "accent";

const TONE_TEXT: Record<Tone, string> = {
  good: "text-positive",
  warn: "text-warning",
  crit: "text-critical",
  neutral: "text-gray-muted",
  accent: "text-accent",
};
const TONE_CHIP: Record<Tone, string> = {
  good: "text-positive bg-positive/12",
  warn: "text-warning bg-warning/12",
  crit: "text-critical bg-critical/12",
  neutral: "text-gray-muted bg-gray-bg",
  accent: "text-accent bg-accent-dim",
};

/** A card surface with an optional header (title + trailing link or count). */
export function Panel({
  title,
  trailing,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: string;
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`rounded-2xl border border-glass-border bg-glass overflow-hidden ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 px-[18px] pt-[15px] pb-3">
          <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-warm-white">{title}</h2>
          {trailing}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** A muted "N open" / "last 30 days" counter for a panel header. */
export function PanelCount({ children }: { children: ReactNode }) {
  return <span className="text-[11px] font-mono text-gray-faint tabular-nums">{children}</span>;
}

/** A panel-header link ("All clients →"). */
export function PanelLink({ href, children }: { href?: string; children: ReactNode }) {
  const cls = "text-[12px] font-medium text-gray-muted hover:text-accent transition-colors";
  return href ? <Link href={href} className={cls}>{children}</Link> : <span className={cls}>{children}</span>;
}

/** Verdict-first stat tile: label, big serif number, an optional delta chip, and
 *  a one-line verdict. Status lives in the delta/verdict, never a left rail. */
export function Vital({
  label,
  value,
  suffix,
  delta,
  deltaTone = "good",
  verdict,
  verdictTone,
}: {
  label: string;
  value: ReactNode;
  suffix?: string;
  delta?: string;
  deltaTone?: Tone;
  verdict?: ReactNode;
  verdictTone?: Tone;
}) {
  return (
    <div className="rounded-2xl border border-glass-border bg-glass p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-faint">{label}</span>
        {delta && (
          <span className={`rounded-md px-[7px] py-0.5 text-[11.5px] font-semibold ${TONE_CHIP[deltaTone]}`}>{delta}</span>
        )}
      </div>
      <div className="mt-[11px] flex items-baseline gap-1.5 font-[family-name:var(--font-display)] text-[29px] font-medium leading-none tracking-[-0.02em] text-warm-white">
        {value}
        {suffix && <span className="text-[15px] text-gray-faint">{suffix}</span>}
      </div>
      {verdict && (
        <p className="mt-[10px] text-[12px] leading-[1.35] text-gray-muted">
          {verdictTone ? <span className={`font-semibold ${TONE_TEXT[verdictTone]}`}>{verdict}</span> : verdict}
        </p>
      )}
    </div>
  );
}

/** A status pill: at-risk / live / building / neutral. Text, not a dot. */
export function Chip({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-[-0.01em] ${TONE_CHIP[tone]} ${className}`}>{children}</span>;
}

/** SEO/site-health letter grade, colored by band. */
export function Grade({ grade }: { grade: string | null }) {
  const g = (grade || "–").toUpperCase();
  const tone: Tone = g === "A" || g === "B" ? "good" : g === "C" || g === "D" ? "warn" : g === "F" ? "crit" : "neutral";
  return <span className={`inline-block min-w-[22px] rounded-md px-[7px] py-0.5 text-center font-mono text-[11px] font-semibold ${TONE_CHIP[tone]}`}>{g}</span>;
}

/** A launch-readiness / progress bar. */
export function LaunchBar({ pct, tone }: { pct: number; tone?: Tone }) {
  const t: Tone = tone ?? (pct >= 90 ? "good" : pct >= 60 ? "warn" : "crit");
  const barColor = t === "good" ? "bg-positive" : t === "warn" ? "bg-warning" : t === "crit" ? "bg-critical" : "bg-gray-muted";
  return (
    <div className="h-[5px] w-full overflow-hidden rounded-full bg-white/[0.08]">
      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

const TONE_BG: Record<Tone, string> = {
  good: "bg-positive",
  warn: "bg-warning",
  crit: "bg-critical",
  neutral: "bg-gray-faint",
  accent: "bg-accent",
};

/**
 * A segmented proportion meter — one filled bar split by share, plus a legend.
 * Used for at-a-glance portfolio spreads (launch ready/watch/blocked, at-risk vs
 * healthy). Zero-value segments drop out of the bar but stay in the legend so the
 * reader sees a real "0 blocked". Tones map to the same status hues as everything else.
 */
export function Meter({ segments }: { segments: { value: number; tone: Tone; label: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div>
      <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-white/[0.06]">
        {segments
          .filter((s) => s.value > 0)
          .map((s, i) => (
            <div key={i} className={TONE_BG[s.tone]} style={{ width: `${(s.value / total) * 100}%` }} />
          ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((s, i) => (
          <span key={i} className="flex items-center gap-1.5 text-[11.5px] text-gray-muted">
            <span className={`h-2 w-2 rounded-full ${TONE_BG[s.tone]}`} />
            <span className="font-semibold tabular-nums text-warm-white">{s.value}</span> {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * A client's brand mark. Uses the real uploaded logo when present; otherwise a
 * calm monogram tile (initial on a neutral surface) — never a colored-initial dot.
 */
export function ClientLogo({
  name,
  logoUrl,
  size = 34,
  className = "",
}: {
  name: string;
  logoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const radius = size >= 44 ? 13 : size >= 30 ? 9 : 8;
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden border border-glass-border bg-surface-raised ${className}`}
      style={{ width: size, height: size, borderRadius: radius }}
    >
      {logoUrl ? (
        <img src={logoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span
          className="font-[family-name:var(--font-display)] font-semibold text-gray-muted"
          style={{ fontSize: Math.round(size * 0.42) }}
        >
          {initial}
        </span>
      )}
    </div>
  );
}

/** A small uppercase group label inside a queue/list. */
export function GroupLabel({ tone = "neutral", label, note }: { tone?: Tone; label: string; note?: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 px-2.5 pb-1.5 pt-3">
      <span className={`text-[10px] font-bold uppercase tracking-[0.1em] ${TONE_TEXT[tone]}`}>{label}</span>
      {note && <span className="text-[11px] text-gray-faint">{note}</span>}
    </div>
  );
}
