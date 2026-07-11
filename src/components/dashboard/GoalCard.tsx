"use client";

import { useState } from "react";
import { Target, Check, X } from "lucide-react";
import type { Goal } from "@/lib/goals";
import { GOAL_METRIC_LABELS, currentGoalValue } from "@/lib/goals";
import type { MetricKey } from "@/lib/proof";
import { useDashboardOptional } from "./DashboardContext";

interface GoalCardProps {
  goal: Goal | null;
  stats: { pageViews: number; bookingClicks: number; reviewsReceived: number };
}

const METRIC_OPTIONS: { value: MetricKey; label: string }[] = [
  { value: "visitors", label: "People finding you" },
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
  const [metric, setMetric] = useState<MetricKey>(initialGoal?.metric ?? "visitors");
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

  // No goal, not editing → a quiet invitation to set one.
  if (!goal && !editing) {
    return (
      <button
        type="button"
        onClick={() => !readOnly && setEditing(true)}
        disabled={readOnly}
        className="flex w-full items-center gap-3 rounded-xl border border-dashed border-gray-border bg-glass/40 p-4 text-left transition-colors hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-dim text-accent">
          <Target className="h-4 w-4" strokeWidth={1.6} />
        </span>
        <span>
          <span className="block text-[14px] font-medium text-warm-black">Set a weekly goal</span>
          <span className="block text-[12px] text-gray-muted">
            Pick a number to chase. We&apos;ll track it on every report.
          </span>
        </span>
      </button>
    );
  }

  // Editing (or setting a first goal) → the form.
  if (editing) {
    return (
      <div className="rounded-xl border border-glass-border bg-glass p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-accent" strokeWidth={1.6} />
          <p className="text-[12px] font-medium uppercase tracking-wide text-accent">Weekly goal</p>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as MetricKey)}
            className="rounded-lg border border-gray-border bg-surface-base px-3 py-2 text-[13px] text-warm-black outline-none focus:border-accent/40"
          >
            {METRIC_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Target"
            className="w-28 rounded-lg border border-gray-border bg-surface-base px-3 py-2 text-[13px] text-warm-black outline-none focus:border-accent/40"
          />
          <span className="text-[13px] text-gray-muted">per week</span>
          <div className="flex gap-2 sm:ml-auto">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-medium text-on-accent transition-colors hover:bg-accent/85 disabled:opacity-60"
            >
              <Check className="h-3.5 w-3.5" strokeWidth={2} />
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError("");
              }}
              className="rounded-lg border border-gray-border px-3 py-2 text-[13px] font-medium text-gray-muted transition-colors hover:text-warm-black"
            >
              Cancel
            </button>
          </div>
        </div>
        {error && <p className="mt-2 text-[12px] text-critical">{error}</p>}
      </div>
    );
  }

  // Goal set → progress.
  const current = currentGoalValue(goal!.metric, stats);
  const pct = Math.min(100, Math.round((current / goal!.target) * 100));
  const hit = current >= goal!.target;

  return (
    <div className="rounded-xl border border-glass-border bg-glass p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-accent" strokeWidth={1.6} />
          <p className="text-[12px] font-medium uppercase tracking-wide text-accent">Weekly goal</p>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-[12px] font-medium text-gray-muted transition-colors hover:text-warm-black"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={busy}
              className="text-gray-faint transition-colors hover:text-warm-black"
              aria-label="Remove goal"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
          </div>
        )}
      </div>
      <p className="mt-2 text-[15px] font-medium text-warm-black">
        {current.toLocaleString()} of {goal!.target.toLocaleString()} {GOAL_METRIC_LABELS[goal!.metric]}
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-raised">
        <div
          className={`h-full rounded-full transition-all ${hit ? "bg-success" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-[12px] text-gray-muted">
        {hit
          ? "Goal hit. Nice. Raise the bar or ride the momentum."
          : `${goal!.target - current} to go this week.`}
      </p>
    </div>
  );
}
