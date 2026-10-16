"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { XaButton, XaField, XaSegmented } from "@/components/ui/strelva/Xa";

const PRESETS = [
  { key: "live", label: "Last 7 days" },
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

  const value = (["live", "week", "month", "custom"] as const).find((key) => key === (customOpen ? "custom" : current)) ?? "live";
  return (
    <div className="flex flex-col items-start gap-3">
      <XaSegmented label="Which days" value={value} onChange={(key) => {
        if (key === "custom") { setCustomOpen(true); return; }
        setCustomOpen(false);
        go(key);
      }} options={[...PRESETS.map((p) => ({ value: p.key, label: p.label })), { value: "custom" as const, label: "Pick days" }]} />
      {customOpen && (
        <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); if (from && to && from <= to) go("custom", { from, to }); }}>
          <div className="w-[170px]"><XaField label="From" type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="w-[170px]"><XaField label="To" type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} /></div>
          <XaButton type="submit" disabled={!from || !to || from > to}>Show these days</XaButton>
        </form>
      )}
    </div>
  );
}
