"use client";

import { useEffect, useState } from "react";
import { XaChoices, XaStatus } from "@/components/ui/strelva/Xa";
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
    blurb: "Every change waits for your yes before it goes live.",
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
  const [note, setNote] = useState("");
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
    setNote("");
    setSaved(false);
    try {
      const res = await fetch(dashboardHref("/api/dashboard/content-autonomy"), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      const data = (await res.json().catch(() => null)) as { mode?: ContentAutonomy; note?: string | null; error?: string } | null;
      if (!res.ok) throw new Error(data?.error || "Couldn't save that.");
      // The business's Needs you policy decides what is in force; show it, and why when it differs.
      if (data?.mode === "auto" || data?.mode === "approve") setMode(data.mode);
      if (data?.note) setNote(data.note);
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
    <section className="flex flex-col gap-3" aria-labelledby="autonomy-label">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="autonomy-label" className="m-0 text-[13px] font-medium text-[var(--st-text-3)]">How much Strelva does on its own</h2>
        {saving ? <XaStatus kind="working" size="sm">Saving</XaStatus> : saved ? <XaStatus kind="live" size="sm">Saved</XaStatus> : null}
      </div>
      <p className="m-0 text-[15px] leading-[1.5] text-[var(--st-text-2)]">Your hours, prices, phone and booking link always come to you before they change. This only decides the small stuff.</p>
      <XaChoices label="Small changes to your site" value={mode} onChange={(value) => void choose(value)}
        options={MODES.map((m) => ({ value: m.value, label: m.label, detail: m.blurb, disabled: saving }))} />
      {note ? <p className="m-0 text-[14px] leading-relaxed text-[var(--st-text-2)]" role="status">{note}</p> : null}
      {error ? <p className="m-0 text-[14px] text-[var(--st-critical)]" role="alert">{error}</p> : null}
    </section>
  );
}
