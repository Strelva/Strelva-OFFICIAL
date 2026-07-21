"use client";

import { useState } from "react";
import { Target } from "lucide-react";
import type { Goal, GoalMetric } from "@/lib/goals";
import { GOAL_METRIC_LABELS } from "@/lib/goals";

const METRIC_OPTIONS: { value: GoalMetric; label: string }[] = [
  { value: "visitors", label: "People finding them" },
  { value: "calls", label: "Calls" },
  { value: "bookings", label: "Booking clicks" },
  { value: "reviews", label: "New reviews" },
];

/**
 * Operator sets a client's weekly goal on their behalf — managed owners rarely
 * log in, so the goal (what the business is growing) is set here, and the
 * portfolio Analytics view then measures progress against it.
 */
export function GoalEditor({ tenantId, initialGoal }: { tenantId: string; initialGoal: Goal | null }) {
  const [goal, setGoal] = useState<Goal | null>(initialGoal);
  const [metric, setMetric] = useState<GoalMetric>(initialGoal?.metric ?? "visitors");
  const [target, setTarget] = useState<string>(initialGoal ? String(initialGoal.target) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save() {
    const t = Number(target);
    if (!Number.isFinite(t) || t <= 0) {
      setError("Set a weekly target above zero.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/goal`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metric, target: t }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setGoal(data.goal);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/goal`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `Failed (${res.status})`);
      }
      setGoal(null);
      setTarget("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clear failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-glass-border bg-glass p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-accent" strokeWidth={1.7} />
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-warm-white">Weekly goal</h2>
      </div>
      <p className="text-xs text-gray-faint">
        What is this business trying to grow? Sets the number the client&apos;s reports + the portfolio
        Analytics view measure against.{" "}
        {goal ? (
          <span className="text-gray-muted">
            Current: <span className="text-warm-white">{goal.target} {GOAL_METRIC_LABELS[goal.metric]}/wk</span>
          </span>
        ) : (
          <span className="text-warning">No goal set.</span>
        )}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="block text-xs text-gray-muted mb-1">Metric</label>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as GoalMetric)}
            className="w-full rounded-md bg-surface-base border border-glass-border px-3 py-2 text-sm text-warm-white focus:outline-none focus:border-accent/50"
          >
            {METRIC_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="w-full sm:w-32">
          <label className="block text-xs text-gray-muted mb-1">Target / week</label>
          <input
            type="number"
            min={1}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="30"
            className="w-full rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50"
          />
        </div>
        <button
          onClick={() => void save()}
          disabled={busy}
          className="rounded-md bg-accent text-on-accent px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          {busy ? "Saving…" : saved ? "Saved ✓" : "Save goal"}
        </button>
        {goal && (
          <button
            onClick={() => void clear()}
            disabled={busy}
            className="rounded-md border border-glass-border px-3 py-2 text-sm text-gray-muted hover:text-warm-white disabled:opacity-40"
          >
            Clear
          </button>
        )}
      </div>
      {error && <p className="text-sm text-critical">{error}</p>}
    </div>
  );
}
