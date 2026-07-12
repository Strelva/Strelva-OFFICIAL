"use client";

import { useEffect, useState } from "react";
import { Sparkles, Check, Loader2 } from "lucide-react";
import type { ContentAutonomy } from "@/lib/content-autonomy";
import { useDashboardOptional } from "./DashboardContext";

const MODES: { value: ContentAutonomy; label: string; blurb: string }[] = [
  {
    value: "auto",
    label: "Handle routine updates",
    blurb: "Strelva publishes small copy tweaks on its own. Anything about your hours, prices, phone, or booking link still comes to you first.",
  },
  {
    value: "approve",
    label: "Ask me first",
    blurb: "Every change waits for your okay before it goes live.",
  },
];

/**
 * The owner's content-autonomy control — how much Strelva publishes without asking.
 * The safety rail is fixed in the engine, not here: high-risk facts (hours, prices,
 * phone, booking/payment links) ALWAYS wait for approval on either mode. "Handle
 * routine updates" only speeds up low-risk copy.
 */
export function ContentAutonomyPanel() {
  const [mode, setMode] = useState<ContentAutonomy>("approve");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const dashboardHref = useDashboardOptional()?.dashboardHref ?? ((p: string) => p);

  useEffect(() => {
    let active = true;
    fetch(dashboardHref("/api/dashboard/content-autonomy"))
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { mode?: ContentAutonomy } | null) => {
        if (active && data?.mode === "auto") setMode("auto");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function choose(next: ContentAutonomy) {
    if (next === mode) return;
    const prev = mode;
    setMode(next);
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch(dashboardHref("/api/dashboard/content-autonomy"), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      if (!res.ok) throw new Error("Couldn't save that.");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setMode(prev);
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl dashboard-panel p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-dim text-accent">
          <Sparkles className="h-[18px] w-[18px]" strokeWidth={1.6} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-warm-black">How much Strelva handles on its own</h2>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-muted" strokeWidth={2} />}
            {saved && <span className="text-[12px] font-medium text-accent">Saved</span>}
          </div>
          <p className="mt-0.5 text-[13px] leading-relaxed text-gray-muted">
            Your hours, prices, phone, and booking link always come to you before they change. This only decides the small stuff.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {MODES.map((m) => {
          const on = mode === m.value;
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => choose(m.value)}
              disabled={saving}
              className={`rounded-lg border p-3 text-left transition-colors disabled:opacity-70 ${
                on ? "border-accent/60 bg-accent-dim" : "border-glass-border bg-glass hover:border-gray-border"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-warm-black">{m.label}</span>
                {on && <Check className="h-4 w-4 text-accent" strokeWidth={2.4} />}
              </div>
              <p className="mt-1 text-[11.5px] leading-snug text-gray-muted">{m.blurb}</p>
            </button>
          );
        })}
      </div>

      {error && <p className="mt-2 text-[12px] text-critical" role="alert">{error}</p>}
    </section>
  );
}
