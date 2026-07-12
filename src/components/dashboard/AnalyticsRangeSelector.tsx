"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { segmentPill as pill } from "./segment-pill";

const PRESETS = [
  { key: "live", label: "Live" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
] as const;

/** The analytics range switch: Live (rolling) or a dated window (this week /
 *  this month / a custom span). Updates the URL `?range=` so the server
 *  recomputes every number for the selected window — no client data fetching. */
export function AnalyticsRangeSelector({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [customOpen, setCustomOpen] = useState(current === "custom");
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");

  const today = new Date().toISOString().slice(0, 10);

  const go = (key: string, extra?: Record<string, string>) => {
    const sp = new URLSearchParams();
    sp.set("range", key);
    if (extra) for (const [k, v] of Object.entries(extra)) sp.set(k, v);
    router.push(`${pathname}?${sp.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => {
            setCustomOpen(false);
            go(p.key);
          }}
          className={pill(current === p.key)}
        >
          {p.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setCustomOpen((o) => !o)}
        className={pill(current === "custom")}
      >
        Custom
      </button>
      {customOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-glass-border bg-glass px-3 py-2">
          <input
            type="date"
            value={from}
            max={to || today}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-glass-border bg-surface-base px-2 py-1 text-[13px] text-warm-black"
            aria-label="From date"
          />
          <span className="text-[13px] text-gray-muted">to</span>
          <input
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-glass-border bg-surface-base px-2 py-1 text-[13px] text-warm-black"
            aria-label="To date"
          />
          <button
            type="button"
            disabled={!from || !to || from > to}
            onClick={() => go("custom", { from, to })}
            className="rounded-md bg-accent px-3 py-1 text-[13px] font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
