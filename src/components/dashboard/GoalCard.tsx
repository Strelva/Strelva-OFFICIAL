"use client";

import { useState } from "react";
import { XaButton, XaLabel, XaTextLink } from "@/components/ui/strelva/Xa";
import type { Goal, GoalMetric } from "@/lib/goals";
import { GOAL_METRIC_LABELS, currentGoalValue } from "@/lib/goals";
import { useDashboardOptional } from "./DashboardContext";

interface GoalCardProps {
  goal: Goal | null;
  stats: { pageViews: number; bookingClicks: number; reviewsReceived: number; phoneClicks?: number };
}

const METRIC_OPTIONS: { value: GoalMetric; label: string }[] = [
  { value: "visitors", label: "People finding you" },
  { value: "calls", label: "Calls" },
  { value: "bookings", label: "Booking clicks" },
  { value: "reviews", label: "New reviews" },
];

/** A weekly goal the owner sets on one proof metric, with progress against this
 *  week's number. Turns the report from a scoreboard into something they're
 *  chasing — the retention hook. */
export function GoalCard({ goal: initialGoal, stats }: GoalCardProps) {
  const dashboard = useDashboardOptional();
  const readOnly = dashboard?.readOnly ?? false;
  const apiPath = (p: string) => dashboard?.dashboardHref(p) ?? p;

  const [goal, setGoal] = useState<Goal | null>(initialGoal);
  const [editing, setEditing] = useState(false);
  const [metric, setMetric] = useState<GoalMetric>(initialGoal?.metric ?? "visitors");
  const [target, setTarget] = useState<string>(initialGoal ? String(initialGoal.target) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const t = Number(target);
    if (!Number.isFinite(t) || t <= 0) {
      setError("Pick a target above zero.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(apiPath("/api/dashboard/goal"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ metric, target: t }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || "Couldn't save that goal.");
        return;
      }
      setGoal(body.goal);
      setEditing(false);
    } catch {
      setError("Couldn't save that goal. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      await fetch(apiPath("/api/dashboard/goal"), { method: "DELETE", credentials: "same-origin" });
      setGoal(null);
      setTarget("");
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  const inputClass = "min-h-[40px] rounded-[12px] border border-[var(--st-line)] bg-[var(--st-surface)] px-3 text-[15px] text-[var(--st-text)] outline-none focus-visible:border-[var(--st-accent)]";

  // No goal, not editing: a quiet invitation to set one.
  if (!goal && !editing) {
    return (
      <section className="flex flex-col gap-2" aria-labelledby="goal-label">
        <XaLabel id="goal-label">Weekly goal</XaLabel>
        <p className="m-0 text-[15px] text-[var(--st-text-2)]">
          No goal yet. Pick a number to chase and every recap tracks it.{" "}
          {!readOnly ? <XaTextLink onClick={() => setEditing(true)}>Set a weekly goal</XaTextLink> : null}
        </p>
      </section>
    );
  }

  // Editing (or setting a first goal): the form, in place.
  if (editing) {
    return (
      <section className="flex flex-col gap-3" aria-labelledby="goal-label">
        <XaLabel id="goal-label">Weekly goal</XaLabel>
        <div className="flex flex-wrap items-center gap-3">
          <select aria-label="What to count" value={metric} onChange={(e) => setMetric(e.target.value as GoalMetric)} className={inputClass} data-owned-select>
            {METRIC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input aria-label="How many each week" type="number" min={1} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="How many" className={`w-28 ${inputClass}`} />
          <span className="text-[15px] text-[var(--st-text-2)]">a week</span>
          <XaButton busy={busy} onClick={save}>Save goal</XaButton>
          <XaTextLink onClick={() => { setEditing(false); setError(""); }}>Cancel</XaTextLink>
        </div>
        {error ? <p className="m-0 text-[14px] text-[var(--st-critical)]" role="alert">{error}</p> : null}
      </section>
    );
  }

  // Goal set: progress.
  const current = currentGoalValue(goal!.metric, stats);
  const pct = Math.min(100, Math.round((current / goal!.target) * 100));
  const hit = current >= goal!.target;

  return (
    <section className="flex flex-col gap-3" aria-labelledby="goal-label">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <XaLabel id="goal-label">Weekly goal</XaLabel>
        {!readOnly ? <span className="flex gap-3 text-[14px]"><XaTextLink onClick={() => setEditing(true)}>Change</XaTextLink><XaTextLink onClick={clear} aria-label="Remove the weekly goal">Remove</XaTextLink></span> : null}
      </div>
      <p className="m-0 text-[17px] text-[var(--st-text)]"><span className="tabular-nums">{current.toLocaleString()}</span> of <span className="tabular-nums">{goal!.target.toLocaleString()}</span> {GOAL_METRIC_LABELS[goal!.metric]}{hit ? ". Goal reached." : `, ${goal!.target - current} to go this week.`}</p>
      <div className="h-1.5 max-w-[560px] overflow-hidden rounded-full bg-[var(--st-inset)]" role="progressbar" aria-valuemin={0} aria-valuemax={goal!.target} aria-valuenow={current} aria-label="Progress toward the weekly goal">
        <div className="h-full rounded-full bg-[var(--st-accent)] transition-[width] duration-(--motion-slow)" style={{ width: `${pct}%` }} />
      </div>
    </section>
  );
}
